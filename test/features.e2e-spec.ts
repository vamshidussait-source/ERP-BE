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

interface AdminLoginResponse {
  accessToken: string;
}

interface LoginResponse {
  accessToken: string;
  user: { id: string; email: string; role: string };
}

interface ErrorResponse {
  message: string;
}

describe('Feature entitlements (e2e)', () => {
  const TENANT_SCHEMA = 'featuretesttenant';
  const TENANT_SUBDOMAIN = 'featuretesttenant';
  const SEED_PASSWORD = 'E2ePassw0rd!';
  const PLATFORM_ADMIN_EMAIL = 'features-e2e-platform@example.com';
  const TENANT_USER_EMAIL = 'features-e2e-user@example.com';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let platformAdminToken: string;
  let tenantUserToken: string;
  let tenantId: string;

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

    // 2. Provision a fresh tenant on the "basic" plan tier.
    const provisionRes = await request(app.getHttpServer())
      .post('/api/admin/tenants/provision')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        name: 'E2E Features Test School',
        schemaName: TENANT_SCHEMA,
        subdomain: TENANT_SUBDOMAIN,
        planTier: 'basic',
      })
      .expect(201);
    const tenant = provisionRes.body as TenantResponse;
    tenantId = tenant.id;
    expect(tenantId).toBeDefined();

    // 3. Seed a regular tenant user (school_admin) in the tenant schema and
    //    log in to get a tenant-scoped JWT. Such a token must be rejected
    //    with 403 on every /features and /tenants/:id/features route.
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO "${TENANT_SCHEMA}".users (email, "passwordHash", role, "isActive")
       VALUES ($1, $2, $3, true)`,
      [TENANT_USER_EMAIL, passwordHash, 'school_admin'],
    );

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Tenant-ID', TENANT_SCHEMA)
      .send({ email: TENANT_USER_EMAIL, password: SEED_PASSWORD })
      .expect(200);
    const login = loginRes.body as LoginResponse;
    expect(login.accessToken).toBeDefined();
    tenantUserToken = login.accessToken;
  });

  afterAll(async () => {
    // Prove ON DELETE CASCADE rather than assuming it: leave an override row
    // on the tenant, delete the tenant, and confirm the override disappears.
    if (tenantId) {
      await dataSource.query(
        `INSERT INTO public.tenant_feature_overrides ("tenantId", "featureKey", enabled)
         VALUES ($1, 'fee_management', true)
         ON CONFLICT ("tenantId", "featureKey") DO NOTHING`,
        [tenantId],
      );
      const beforeDelete = await dataSource.query(
        `SELECT COUNT(*)::int AS count
         FROM public.tenant_feature_overrides WHERE "tenantId" = $1`,
        [tenantId],
      );
      expect(beforeDelete[0].count).toBe(1);
    }

    await dropTenant();

    if (tenantId) {
      const afterDelete = await dataSource.query(
        `SELECT COUNT(*)::int AS count
         FROM public.tenant_feature_overrides WHERE "tenantId" = $1`,
        [tenantId],
      );
      expect(afterDelete[0].count).toBe(0);
    }

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
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${TENANT_SCHEMA}" CASCADE`);
      await queryRunner.query(
        `DELETE FROM public.tenants WHERE "schemaName" = $1`,
        [TENANT_SCHEMA],
      );
    } finally {
      await queryRunner.release();
    }
  }

  it('lists all 10 seeded features for a platform admin', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/features')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);

    const body = res.body as Array<{ key: string; name: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(10);

    const keys = body.map((feature) => feature.key);
    for (const expected of [
      'students',
      'staff',
      'classes_sections',
      'attendance',
      'notifications',
      'file_uploads',
      'progress_reports',
      'fee_management',
      'timetable',
      'exams_grades',
    ]) {
      expect(keys).toContain(expected);
    }
    expect(body[0].name).toBeDefined();
  });

  it('rejects unauthenticated access to the feature routes (401)', async () => {
    await request(app.getHttpServer()).get('/api/features').expect(401);
  });

  it('returns the basic tier defaults as the effective feature set', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/tenants/${tenantId}/features`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);

    const body = res.body as Record<string, boolean>;
    // Basic tier: enabled...
    expect(body.students).toBe(true);
    expect(body.staff).toBe(true);
    expect(body.classes_sections).toBe(true);
    expect(body.attendance).toBe(true);
    expect(body.notifications).toBe(true);
    expect(body.file_uploads).toBe(true);
    // ...and disabled features.
    expect(body.progress_reports).toBe(false);
    expect(body.fee_management).toBe(false);
    expect(body.timetable).toBe(false);
    expect(body.exams_grades).toBe(false);
    // Exactly the 10 seeded features, no more.
    expect(Object.keys(body)).toHaveLength(10);
  });

  it('creates an override that wins over the basic tier default', async () => {
    // fee_management is disabled on the basic tier; enable it via override.
    const setRes = await request(app.getHttpServer())
      .patch(`/api/tenants/${tenantId}/features/fee_management`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ enabled: true })
      .expect(200);

    const override = setRes.body as {
      tenantId: string;
      featureKey: string;
      enabled: boolean;
    };
    expect(override.tenantId).toBe(tenantId);
    expect(override.featureKey).toBe('fee_management');
    expect(override.enabled).toBe(true);

    const effectiveRes = await request(app.getHttpServer())
      .get(`/api/tenants/${tenantId}/features`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);

    const effective = effectiveRes.body as Record<string, boolean>;
    expect(effective.fee_management).toBe(true);
    // Every other feature remains at its basic tier default.
    expect(effective.students).toBe(true);
    expect(effective.attendance).toBe(true);
    expect(effective.file_uploads).toBe(true);
    expect(effective.progress_reports).toBe(false);
    expect(effective.timetable).toBe(false);
    expect(effective.exams_grades).toBe(false);
  });

  it('removes the override, reverting to the basic tier default', async () => {
    // Override exists (fee_management: true) from the previous test.
    const removeRes = await request(app.getHttpServer())
      .delete(`/api/tenants/${tenantId}/features/fee_management`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);

    expect((removeRes.body as { removed: boolean }).removed).toBe(true);

    const effectiveRes = await request(app.getHttpServer())
      .get(`/api/tenants/${tenantId}/features`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);

    // Back to the basic tier default (disabled).
    expect((effectiveRes.body as Record<string, boolean>).fee_management).toBe(
      false,
    );
  });

  it('removing a non-existent override is an idempotent no-op', async () => {
    const removeRes = await request(app.getHttpServer())
      .delete(`/api/tenants/${tenantId}/features/fee_management`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);

    expect((removeRes.body as { removed: boolean }).removed).toBe(false);
  });

  it('rejects a regular tenant-user token with 403 on all feature routes', async () => {
    // PlatformAdminGuard rejects any JWT whose role is not 'platform_admin'
    // with 403 — regardless of tenant claims — on every route in this module.
    const res = await request(app.getHttpServer())
      .get('/api/features')
      .set('Authorization', `Bearer ${tenantUserToken}`)
      .expect(403);
    expect((res.body as ErrorResponse).message).toContain('platform admin');

    await request(app.getHttpServer())
      .get(`/api/tenants/${tenantId}/features`)
      .set('Authorization', `Bearer ${tenantUserToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/tenants/${tenantId}/features/fee_management`)
      .set('Authorization', `Bearer ${tenantUserToken}`)
      .send({ enabled: true })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/tenants/${tenantId}/features/fee_management`)
      .set('Authorization', `Bearer ${tenantUserToken}`)
      .expect(403);
  });

  it('returns 404 when setting an override for an unknown feature', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/tenants/${tenantId}/features/nonexistent_feature_key`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ enabled: true })
      .expect(404);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('not found');
  });
});
