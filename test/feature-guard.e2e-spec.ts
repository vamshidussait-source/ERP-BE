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

interface ErrorResponse {
  message: string;
  statusCode: number;
}

interface FeatureMap {
  [key: string]: boolean;
}

describe('Feature Guard enforcement (e2e)', () => {
  // Trial-tier tenant: timetable, progress_reports, exams_grades are all disabled.
  const TRIAL_SCHEMA = 'featureguardtrial';
  const TRIAL_SUBDOMAIN = 'featureguardtrial';
  // Premium-tier tenant: all features enabled.
  const PREMIUM_SCHEMA = 'featureguardpremium';
  const PREMIUM_SUBDOMAIN = 'featureguardpremium';

  const SEED_PASSWORD = 'E2ePassw0rd!';
  const PLATFORM_ADMIN_EMAIL = 'fg-e2e-platform@example.com';
  const TRIAL_ADMIN_EMAIL = 'fg-trial-admin@example.com';
  const PREMIUM_ADMIN_EMAIL = 'fg-premium-admin@example.com';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let platformAdminToken: string;
  let trialAdminToken: string;
  let premiumAdminToken: string;
  let trialTenantId: string;
  let premiumTenantId: string;
  let premiumSectionId: string;

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

    await dropTenant(TRIAL_SCHEMA);
    await dropTenant(PREMIUM_SCHEMA);

    // 1. Seed platform admin and log in.
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
    platformAdminToken = (
      adminLoginRes.body as { accessToken: string }
    ).accessToken;

    // 2. Provision trial-tier tenant (default — timetable, progress_reports,
    //    exams_grades are disabled on the trial tier).
    const trialRes = await request(app.getHttpServer())
      .post('/api/admin/tenants/provision')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        name: 'E2E Feature Guard Trial',
        schemaName: TRIAL_SCHEMA,
        subdomain: TRIAL_SUBDOMAIN,
      })
      .expect(201);
    trialTenantId = (trialRes.body as TenantResponse).id;

    // 3. Provision premium-tier tenant (all features enabled).
    const premiumRes = await request(app.getHttpServer())
      .post('/api/admin/tenants/provision')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        name: 'E2E Feature Guard Premium',
        schemaName: PREMIUM_SCHEMA,
        subdomain: PREMIUM_SUBDOMAIN,
        planTier: 'premium',
      })
      .expect(201);
    premiumTenantId = (premiumRes.body as TenantResponse).id;

    // 4. Seed school_admin users in both tenants.
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO "${TRIAL_SCHEMA}".users
         (email, "passwordHash", role, "isActive")
       VALUES ($1, $2, 'school_admin', true)`,
      [TRIAL_ADMIN_EMAIL, passwordHash],
    );
    await dataSource.query(
      `INSERT INTO "${PREMIUM_SCHEMA}".users
         (email, "passwordHash", role, "isActive")
       VALUES ($1, $2, 'school_admin', true)`,
      [PREMIUM_ADMIN_EMAIL, passwordHash],
    );

    // 5. Log in as both admins.
    trialAdminToken = await login(TRIAL_SCHEMA, TRIAL_ADMIN_EMAIL);
    premiumAdminToken = await login(PREMIUM_SCHEMA, PREMIUM_ADMIN_EMAIL);

    // 6. Create class + section in the premium tenant (for GET endpoints).
    const classRes = await request(app.getHttpServer())
      .post('/api/classes')
      .set(auth(PREMIUM_SCHEMA, premiumAdminToken))
      .send({ name: 'Grade 10', displayOrder: 10 })
      .expect(201);

    const sectionRes = await request(app.getHttpServer())
      .post(`/api/classes/${(classRes.body as { id: string }).id}/sections`)
      .set(auth(PREMIUM_SCHEMA, premiumAdminToken))
      .send({ name: 'A', capacity: 40 })
      .expect(201);
    premiumSectionId = (sectionRes.body as { id: string }).id;

    // Also create class + section in the trial tenant (for GET endpoints).
    const trialClassRes = await request(app.getHttpServer())
      .post('/api/classes')
      .set(auth(TRIAL_SCHEMA, trialAdminToken))
      .send({ name: 'Grade 10', displayOrder: 10 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/classes/${(trialClassRes.body as { id: string }).id}/sections`)
      .set(auth(TRIAL_SCHEMA, trialAdminToken))
      .send({ name: 'A', capacity: 40 })
      .expect(201);
  });

  afterAll(async () => {
    await dropTenant(TRIAL_SCHEMA);
    await dropTenant(PREMIUM_SCHEMA);
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

  async function dropTenant(schemaName: string) {
    if (!dataSource) return;
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    try {
      await qr.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await qr.query(
        `DELETE FROM public.tenants WHERE "schemaName" = $1`,
        [schemaName],
      );
    } finally {
      await qr.release();
    }
  }

  async function login(schemaName: string, email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Tenant-ID', schemaName)
      .send({ email, password: SEED_PASSWORD })
      .expect(200);
    return (res.body as LoginResponse).accessToken;
  }

  function auth(schemaName: string, token: string) {
    return {
      'X-Tenant-ID': schemaName,
      Authorization: `Bearer ${token}`,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // 1. Trial-tier user gets 403 on disabled features
  // ──────────────────────────────────────────────────────────────────

  describe('Trial-tier tenant (disabled features)', () => {
    it('returns 403 on GET /timetable/section/:sectionId', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/timetable/section/some-section-id')
        .set(auth(TRIAL_SCHEMA, trialAdminToken))
        .expect(403);

      expect((res.body as ErrorResponse).message).toContain(
        'not included in your school',
      );
    });

    it('returns 403 on POST /timetable', async () => {
      await request(app.getHttpServer())
        .post('/api/timetable')
        .set(auth(TRIAL_SCHEMA, trialAdminToken))
        .send({
          sectionId: 'fake-id',
          dayOfWeek: 'monday',
          periodNumber: 1,
          subject: 'Math',
          startTime: '08:00',
          endTime: '08:45',
        })
        .expect(403);
    });

    it('returns 403 on GET /assessment-periods', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/assessment-periods')
        .set(auth(TRIAL_SCHEMA, trialAdminToken))
        .expect(403);

      expect((res.body as ErrorResponse).message).toContain(
        'not included in your school',
      );
    });

    it('returns 403 on POST /progress-reports', async () => {
      await request(app.getHttpServer())
        .post('/api/progress-reports')
        .set(auth(TRIAL_SCHEMA, trialAdminToken))
        .send({
          studentId: 'fake-id',
          assessmentPeriodId: 'fake-id',
          classTeacherRemarks: 'test',
        })
        .expect(403);
    });

    it('returns 403 on GET /subjects', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/subjects')
        .set(auth(TRIAL_SCHEMA, trialAdminToken))
        .expect(403);

      expect((res.body as ErrorResponse).message).toContain(
        'not included in your school',
      );
    });

    it('returns 403 on POST /subjects', async () => {
      await request(app.getHttpServer())
        .post('/api/subjects')
        .set(auth(TRIAL_SCHEMA, trialAdminToken))
        .send({ name: 'Mathematics' })
        .expect(403);
    });

    it('returns 403 on GET /grading-scales', async () => {
      await request(app.getHttpServer())
        .get('/api/grading-scales')
        .set(auth(TRIAL_SCHEMA, trialAdminToken))
        .expect(403);
    });

    it('returns 403 on GET /exams', async () => {
      await request(app.getHttpServer())
        .get('/api/exams')
        .set(auth(TRIAL_SCHEMA, trialAdminToken))
        .expect(403);
    });

    it('returns 403 on POST /exams', async () => {
      await request(app.getHttpServer())
        .post('/api/exams')
        .set(auth(TRIAL_SCHEMA, trialAdminToken))
        .send({
          name: 'Test Exam',
          examDate: '2026-09-01',
        })
        .expect(403);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 2. Premium-tier user succeeds on the same routes
  // ──────────────────────────────────────────────────────────────────

  describe('Premium-tier tenant (enabled features)', () => {
    it('returns 200 on GET /timetable/section/:sectionId', async () => {
      await request(app.getHttpServer())
        .get(`/api/timetable/section/${premiumSectionId}`)
        .set(auth(PREMIUM_SCHEMA, premiumAdminToken))
        .expect(200);
    });

    it('returns 200 on GET /assessment-periods', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/assessment-periods')
        .set(auth(PREMIUM_SCHEMA, premiumAdminToken))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns 200 on GET /subjects', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/subjects')
        .set(auth(PREMIUM_SCHEMA, premiumAdminToken))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns 200 on GET /grading-scales', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/grading-scales')
        .set(auth(PREMIUM_SCHEMA, premiumAdminToken))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns 200 on GET /exams', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/exams')
        .set(auth(PREMIUM_SCHEMA, premiumAdminToken))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 3. GET /features/me
  // ──────────────────────────────────────────────────────────────────

  describe('GET /features/me', () => {
    it('returns the trial tier effective features for the trial tenant', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/features/me')
        .set(auth(TRIAL_SCHEMA, trialAdminToken))
        .expect(200);

      const body = res.body as FeatureMap;
      expect(body.students).toBe(true);
      expect(body.attendance).toBe(true);
      expect(body.timetable).toBe(false);
      expect(body.progress_reports).toBe(false);
      expect(body.exams_grades).toBe(false);
    });

    it('returns the premium tier effective features for the premium tenant', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/features/me')
        .set(auth(PREMIUM_SCHEMA, premiumAdminToken))
        .expect(200);

      const body = res.body as FeatureMap;
      expect(body.students).toBe(true);
      expect(body.attendance).toBe(true);
      expect(body.timetable).toBe(true);
      expect(body.progress_reports).toBe(true);
      expect(body.exams_grades).toBe(true);
    });

    it('rejects unauthenticated access (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/features/me')
        .set('X-Tenant-ID', TRIAL_SCHEMA)
        .expect(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 4. Toggle feature override → access changes without re-login
  // ──────────────────────────────────────────────────────────────────

  describe('Feature override toggle (dynamic access change)', () => {
    it('trial tenant gets 403 on timetable before override', async () => {
      await request(app.getHttpServer())
        .get('/api/timetable/section/some-id')
        .set(auth(TRIAL_SCHEMA, trialAdminToken))
        .expect(403);
    });

    it('platform admin enables timetable for the trial tenant', async () => {
      await request(app.getHttpServer())
        .patch(`/api/tenants/${trialTenantId}/features/timetable`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ enabled: true })
        .expect(200);
    });

    it('trial tenant now succeeds on timetable (same token, no re-login)', async () => {
      // This endpoint just needs the guard to pass; the actual query may
      // fail with 404 if no section exists, but the guard must pass first.
      // We use a GET on an existing endpoint that returns an empty array.
      const res = await request(app.getHttpServer())
        .get('/api/timetable/section/00000000-0000-0000-0000-000000000000')
        .set(auth(TRIAL_SCHEMA, trialAdminToken));

      // Should NOT be 403 — the feature guard passes now.
      expect(res.status).not.toBe(403);
    });

    it('GET /features/me now shows timetable=true for the trial tenant', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/features/me')
        .set(auth(TRIAL_SCHEMA, trialAdminToken))
        .expect(200);

      const body = res.body as FeatureMap;
      expect(body.timetable).toBe(true);
    });

    it('platform admin disables timetable again for the trial tenant', async () => {
      await request(app.getHttpServer())
        .patch(`/api/tenants/${trialTenantId}/features/timetable`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ enabled: false })
        .expect(200);
    });

    it('trial tenant gets 403 on timetable again after override removed', async () => {
      await request(app.getHttpServer())
        .get('/api/timetable/section/some-id')
        .set(auth(TRIAL_SCHEMA, trialAdminToken))
        .expect(403);
    });

    it('GET /features/me now shows timetable=false again', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/features/me')
        .set(auth(TRIAL_SCHEMA, trialAdminToken))
        .expect(200);

      const body = res.body as FeatureMap;
      expect(body.timetable).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 5. Routes without @RequiresFeature pass regardless of feature state
  // ──────────────────────────────────────────────────────────────────

  describe('Non-decorated routes pass FeatureGuard (fail-open)', () => {
    it('GET /students works on trial tier (no @RequiresFeature)', async () => {
      await request(app.getHttpServer())
        .get('/api/students')
        .set(auth(TRIAL_SCHEMA, trialAdminToken))
        .expect(200);
    });

    it('GET /classes works on trial tier (no @RequiresFeature)', async () => {
      await request(app.getHttpServer())
        .get('/api/classes')
        .set(auth(TRIAL_SCHEMA, trialAdminToken))
        .expect(200);
    });
  });
});
