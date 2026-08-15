import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { AppLogger } from './../src/common/logger/app.logger';

interface TenantResponse {
  id: string;
  schemaName: string;
}

interface LoginResponse {
  accessToken: string;
  user: { id: string; email: string; role: string };
}

interface NotificationResult {
  provider: 'msg91' | 'resend' | 'firebase';
  channel: string;
  status: string;
  to: string;
  messageId: string;
  mock: boolean;
}

describe('Notifications (e2e)', () => {
  const TENANT_SCHEMA = 'e2enotifications';
  const TENANT_SUBDOMAIN = 'e2enotifications';
  const SEED_EMAIL = 'notifications-admin@example.com';
  const SEED_PASSWORD = 'E2ePassw0rd!';
  const PLATFORM_ADMIN_EMAIL = 'notifications-e2e-platform@example.com';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let accessToken: string;
  let platformAdminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Mirror the bootstrap() setup in src/main.ts.
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter(app.get(AppLogger)));
    await app.init();

    dataSource = app.get(DataSource);

    // Remove any leftovers from a previous (possibly interrupted) run.
    await dropTenant();

    // 1. Seed a platform admin (clean slate for a known password) and log in.
    //    Provisioning is restricted to platform admins, so the provision call
    //    below must carry a platform-admin JWT from /api/admin/auth/login.
    await dataSource.query(
      `DELETE FROM public.platform_admins WHERE email = $1`,
      [PLATFORM_ADMIN_EMAIL],
    );
    const adminPasswordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO public.platform_admins (email, "passwordHash", name)
       VALUES ($1, $2, $3)`,
      [PLATFORM_ADMIN_EMAIL, adminPasswordHash, 'E2E Platform Admin'],
    );

    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email: PLATFORM_ADMIN_EMAIL, password: SEED_PASSWORD })
      .expect(200);
    const adminLogin = adminLoginRes.body as { accessToken: string };
    expect(adminLogin.accessToken).toBeDefined();
    platformAdminToken = adminLogin.accessToken;

    // 2. Provision a fresh tenant through the admin endpoint.
    const provisionRes = await request(app.getHttpServer())
      .post('/api/admin/tenants/provision')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        name: 'E2E Notifications Test School',
        schemaName: TENANT_SCHEMA,
        subdomain: TENANT_SUBDOMAIN,
      })
      .expect(201);
    const tenant = provisionRes.body as TenantResponse;
    expect(tenant.schemaName).toBe(TENANT_SCHEMA);

    // 3. Seed a login user directly in the tenant schema (known bcrypt hash).
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO "${TENANT_SCHEMA}".users
         (email, "passwordHash", role, "isActive")
       VALUES ($1, $2, $3, true)`,
      [SEED_EMAIL, passwordHash, 'school_admin'],
    );

    // 4. Log in and keep the JWT for the notification test requests.
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Tenant-ID', TENANT_SCHEMA)
      .send({ email: SEED_EMAIL, password: SEED_PASSWORD })
      .expect(200);
    const login = loginRes.body as LoginResponse;
    expect(login.accessToken).toBeDefined();
    expect(login.user).toBeDefined();
    expect(login.user.id).toBeDefined();
    expect(login.user.email).toBe(SEED_EMAIL);
    expect(login.user.role).toBeDefined();
    accessToken = login.accessToken;
  });

  afterAll(async () => {
    await dropTenant();
    if (dataSource) {
      await dataSource.query(
        `DELETE FROM public.platform_admins WHERE email = $1`,
        [PLATFORM_ADMIN_EMAIL],
      );
    }
    if (app) {
      await app.close();
    }
  });

  /** Drops the test tenant's schema and removes its row from public.tenants. */
  async function dropTenant() {
    if (!dataSource) {
      return;
    }
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.query(
        `DROP SCHEMA IF EXISTS "${TENANT_SCHEMA}" CASCADE`,
      );
      await queryRunner.query(
        `DELETE FROM public.tenants WHERE "schemaName" = $1`,
        [TENANT_SCHEMA],
      );
    } finally {
      await queryRunner.release();
    }
  }

  it('test SMS returns a mock msg91 response (201)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/notifications/test')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'sms' })
      .expect(201);

    const body = res.body as NotificationResult;
    expect(body.provider).toBe('msg91');
    expect(body.channel).toBe('sms');
    expect(body.mock).toBe(true);
    expect(body.messageId).toMatch(/^mock-sms-/);
  });

  it('test email returns a mock resend response (201)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/notifications/test')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'email' })
      .expect(201);

    const body = res.body as NotificationResult;
    expect(body.provider).toBe('resend');
    expect(body.channel).toBe('email');
    expect(body.mock).toBe(true);
    expect(body.messageId).toMatch(/^mock-email-/);
  });

  it('test push returns a mock firebase response (201)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/notifications/test')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'push' })
      .expect(201);

    const body = res.body as NotificationResult;
    expect(body.provider).toBe('firebase');
    expect(body.channel).toBe('push');
    expect(body.mock).toBe(true);
    expect(body.messageId).toMatch(/^mock-push-/);
  });

  it('rejects the test endpoint without a valid JWT (401)', async () => {
    await request(app.getHttpServer())
      .post('/api/notifications/test')
      .send({ type: 'sms' })
      .expect(401);
  });

  it('rejects an invalid type value (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/notifications/test')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'fax' })
      .expect(400);
  });
});
