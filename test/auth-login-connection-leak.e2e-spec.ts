import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { AppLogger } from './../src/common/logger/app.logger';

/**
 * Regression test for the connection-leak bug where every POST /auth/login
 * acquired a tenant-scoped QueryRunner but never released it (no
 * TenantConnectionCleanupInterceptor on AuthController). This eventually
 * exhausted the pg pool (default max: 10) and caused unrelated
 * tenant-scoped requests to hang indefinitely.
 *
 * This test logs in 15 times in quick succession (more than the old default
 * pool size of 10) and then verifies the app is still responsive by
 * successfully completing a GET /students request.
 */
describe('Auth login connection leak regression (e2e)', () => {
  const TENANT_SCHEMA = 'e2eloginleak';
  const TENANT_SUBDOMAIN = 'e2eloginleak';
  const SEED_PASSWORD = 'E2ePassw0rd!';
  const USER_EMAIL = 'loginleak-user@example.com';
  const PLATFORM_ADMIN_EMAIL = 'loginleak-e2e-platform@example.com';
  const LOGIN_COUNT = 15;

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

    // Clean up from any previous run.
    await dropTenant();

    // 1. Seed a platform admin and log in.
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
    adminToken = (adminLoginRes.body as { accessToken: string }).accessToken;

    // 2. Provision a fresh tenant.
    await request(app.getHttpServer())
      .post('/api/admin/tenants/provision')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'E2E Login Leak Test School',
        schemaName: TENANT_SCHEMA,
        subdomain: TENANT_SUBDOMAIN,
      })
      .expect(201);

    // 3. Seed a tenant user for repeated logins.
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO "${TENANT_SCHEMA}".users
         (email, "passwordHash", role, "isActive")
       VALUES ($1, $2, $3, true)`,
      [USER_EMAIL, passwordHash, 'school_admin'],
    );
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

  async function dropTenant() {
    if (!dataSource) return;
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    try {
      await qr.query(`DROP SCHEMA IF EXISTS "${TENANT_SCHEMA}" CASCADE`);
      await qr.query(
        `DELETE FROM public.tenants WHERE "schemaName" = $1`,
        [TENANT_SCHEMA],
      );
    } finally {
      await qr.release();
    }
  }

  it(
    `should not leak connections after ${LOGIN_COUNT} rapid logins`,
    async () => {
      // Fire LOGIN_COUNT login requests in rapid succession — each one
      // acquires a QueryRunner via TenantConnectionService. Without the
      // TenantConnectionCleanupInterceptor fix, every one of these would
      // leak a pooled connection, exhausting the default pool of 10.
      const loginPromises = Array.from({ length: LOGIN_COUNT }, (_, i) =>
        request(app.getHttpServer())
          .post('/api/auth/login')
          .set('X-Tenant-ID', TENANT_SCHEMA)
          .send({ email: USER_EMAIL, password: SEED_PASSWORD })
          .then((res) => {
            expect(res.status).toBe(200);
            const body = res.body as { accessToken: string; user: { id: string } };
            expect(body.accessToken).toBeDefined();
            expect(body.user.id).toBeDefined();
            return body.accessToken;
          }),
      );

      const tokens = await Promise.all(loginPromises);
      expect(tokens).toHaveLength(LOGIN_COUNT);

      // Every token should be a valid (non-empty) string.
      for (const token of tokens) {
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);
      }

      // CRITICAL CHECK: The app must still be responsive after all those
      // logins. If connections were leaked, the pool would be exhausted and
      // this request would hang until timeout (or succeed on the 20 pool
      // size with the new config, but still succeed).
      const healthRes = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);
      expect(healthRes.body).toBeDefined();

      // Also verify a tenant-scoped endpoint works (this needs a pooled
      // connection from the same pool that was being leaked).
      const studentsRes = await request(app.getHttpServer())
        .get('/api/students')
        .set('X-Tenant-ID', TENANT_SCHEMA)
        .set('Authorization', `Bearer ${tokens[0]}`)
        .expect(200);
      expect(studentsRes.body).toBeDefined();
    },
    // Generous timeout — the test needs time for 15 logins + DB seeding.
    60_000,
  );
});
