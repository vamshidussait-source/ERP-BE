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

interface AdminLoginResponse {
  accessToken: string;
}

interface ErrorResponse {
  message: string;
}

describe('Tenants routes are platform-admin-only (e2e)', () => {
  const TENANT_A_SCHEMA = 'guardtenanta';
  const TENANT_A_SUBDOMAIN = 'guardtenanta';
  const TENANT_B_SCHEMA = 'guardtenantb';
  const TENANT_B_SUBDOMAIN = 'guardtenantb';
  const SEED_EMAIL = 'guard-e2e-admin@example.com';
  const SEED_PASSWORD = 'E2ePassw0rd!';
  const PLATFORM_ADMIN_EMAIL = 'guard-e2e-platform@example.com';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let tenantAId: string;
  let tenantBId: string;
  let tenantAToken: string;
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
    await dropTenants();

    // 1. Seed a platform admin (clean slate for a known password) and log in.
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
    const adminLogin = adminLoginRes.body as AdminLoginResponse;
    expect(adminLogin.accessToken).toBeDefined();
    platformAdminToken = adminLogin.accessToken;

    // 2. Provision two tenants. A platform admin browses ALL tenants, so we
    //    need more than one to prove the list is not tenant-filtered.
    const tenantARes = await request(app.getHttpServer())
      .post('/api/admin/tenants/provision')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        name: 'Guard Test School A',
        schemaName: TENANT_A_SCHEMA,
        subdomain: TENANT_A_SUBDOMAIN,
      })
      .expect(201);
    const tenantA = tenantARes.body as TenantResponse;
    tenantAId = tenantA.id;
    expect(tenantAId).toBeDefined();

    const tenantBRes = await request(app.getHttpServer())
      .post('/api/admin/tenants/provision')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        name: 'Guard Test School B',
        schemaName: TENANT_B_SCHEMA,
        subdomain: TENANT_B_SUBDOMAIN,
      })
      .expect(201);
    const tenantB = tenantBRes.body as TenantResponse;
    tenantBId = tenantB.id;
    expect(tenantBId).toBeDefined();

    // 3. Seed a login user in tenant A's schema and log in to get a
    //    tenant-scoped JWT (its payload carries tenantId = tenantAId). Such a
    //    token must NOT be able to call the /api/tenants routes anymore.
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO "${TENANT_A_SCHEMA}".users (email, "passwordHash", role, "isActive")
       VALUES ($1, $2, $3, true)`,
      [SEED_EMAIL, passwordHash, 'school_admin'],
    );

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Tenant-ID', TENANT_A_SCHEMA)
      .send({ email: SEED_EMAIL, password: SEED_PASSWORD })
      .expect(200);
    const login = loginRes.body as LoginResponse;
    expect(login.accessToken).toBeDefined();
    tenantAToken = login.accessToken;
  });

  afterAll(async () => {
    await dropTenants();
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

  /** Drops the test tenants' schemas and removes their rows from public.tenants. */
  async function dropTenants() {
    if (!dataSource) {
      return;
    }
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      for (const schema of [TENANT_A_SCHEMA, TENANT_B_SCHEMA]) {
        await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await queryRunner.query(
          `DELETE FROM public.tenants WHERE "schemaName" = $1`,
          [schema],
        );
      }
    } finally {
      await queryRunner.release();
    }
  }

  it('allows a platform admin token to list all tenants (no X-Tenant-ID)', async () => {
    // Platform admin JWTs carry no tenantId claim and the tenants routes are
    // NOT tenant-scoped: no TenantMiddleware, no X-Tenant-ID header. The list
    // spans every tenant on the platform.
    const res = await request(app.getHttpServer())
      .get('/api/tenants')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);

    const body = res.body as { data: unknown[]; total: number };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  it('allows a platform admin token to read any single tenant (no X-Tenant-ID)', async () => {
    // Platform admins are not scoped to a "current tenant", so a single
    // tenant's settings can be read directly by id.
    const res = await request(app.getHttpServer())
      .get(`/api/tenants/${tenantBId}`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);

    expect((res.body as TenantResponse).id).toBe(tenantBId);
  });

  it('rejects a tenant-scoped user token from listing tenants (403)', async () => {
    // A school user has no business listing every school on the platform.
    // PlatformAdminGuard rejects any JWT whose role is not 'platform_admin'
    // with 403 — regardless of any tenant claims in the token.
    const res = await request(app.getHttpServer())
      .get('/api/tenants')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .expect(403);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('platform admin');
  });

  it('rejects a tenant-scoped user token from reading a tenant (403)', async () => {
    // Same rule for single-tenant reads: tenant management is a
    // platform-admin-only operation.
    const res = await request(app.getHttpServer())
      .get(`/api/tenants/${tenantAId}`)
      .set('Authorization', `Bearer ${tenantAToken}`)
      .expect(403);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('platform admin');
  });
});
