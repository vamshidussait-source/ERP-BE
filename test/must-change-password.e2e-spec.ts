import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AppLogger } from '../src/common/logger/app.logger';

interface TenantResponse {
  id: string;
  schemaName: string;
}

interface LoginResponse {
  accessToken: string;
  mustChangePassword: boolean;
  user: { id: string; email: string; role: string; mustChangePassword: boolean };
}

interface ErrorResponse {
  message: string | string[];
}

const PENDING_MESSAGE =
  'You must change your temporary password before continuing.';

describe('MustChangePasswordGuard (e2e)', () => {
  const TENANT_SCHEMA = 'e2emustchg';
  const TENANT_SUBDOMAIN = 'e2emustchg';
  const SEED_PASSWORD = 'E2ePassw0rd!';
  const ADMIN_EMAIL = 'mc-admin@example.com';
  const STAFF_EMAIL = 'mc-staff@example.com';
  const PLATFORM_ADMIN_EMAIL = 'mc-e2e-platform@example.com';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let staffToken: string;
  let platformAdminToken: string;

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

    await dropTenant();

    // Seed a platform admin and provision a fresh tenant.
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
    platformAdminToken = (adminLoginRes.body as { accessToken: string })
      .accessToken;

    const provisionRes = await request(app.getHttpServer())
      .post('/api/admin/tenants/provision')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        name: 'E2E MustChangePassword Test School',
        schemaName: TENANT_SCHEMA,
        subdomain: TENANT_SUBDOMAIN,
      })
      .expect(201);
    expect((provisionRes.body as TenantResponse).schemaName).toBe(
      TENANT_SCHEMA,
    );

    // Seed a school_admin (normal login, flag=false) and a staff login
    // (normal login, flag=false — used for the "unaffected user" case).
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO "${TENANT_SCHEMA}".users
         (email, "passwordHash", role, "isActive", "mustChangePassword")
       VALUES ($1, $2, $3, true, false), ($4, $5, $6, true, false)`,
      [
        ADMIN_EMAIL,
        passwordHash,
        'school_admin',
        STAFF_EMAIL,
        passwordHash,
        'staff',
      ],
    );

    adminToken = (await login(ADMIN_EMAIL)).accessToken;
    staffToken = (await login(STAFF_EMAIL)).accessToken;
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

  async function login(
    email: string,
    password = SEED_PASSWORD,
  ): Promise<LoginResponse> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Tenant-ID', TENANT_SCHEMA)
      .send({ email, password })
      .expect(200);
    return res.body as LoginResponse;
  }

  function auth(token: string) {
    return {
      'X-Tenant-ID': TENANT_SCHEMA,
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * Issues a login for a student via the account-access API and logs in
   * with the temporary password, returning the pending-password token.
   */
  async function createPendingPasswordUser(
    email: string,
  ): Promise<{ pendingToken: string; tempPassword: string }> {
    // Create a student first.
    const sRes = await request(app.getHttpServer())
      .post('/api/students')
      .set(auth(adminToken))
      .send({
        firstName: 'Pending',
        lastName: `User ${email}`,
        dateOfBirth: '2015-01-01',
        admissionNumber: `ADM-MC-${email}`,
      })
      .expect(201);
    const studentId = (sRes.body as { id: string }).id;

    // Issue a login with a temporary password.
    const issueRes = await request(app.getHttpServer())
      .post('/api/account-access/issue-login')
      .set(auth(adminToken))
      .send({
        targetType: 'student',
        targetId: studentId,
        email,
      })
      .expect(201);
    const tempPassword = (issueRes.body as { temporaryPassword: string })
      .temporaryPassword;

    // Log in with the temporary password — mustChangePassword=true.
    const pendingLogin = await login(email, tempPassword);
    expect(pendingLogin.mustChangePassword).toBe(true);
    return { pendingToken: pendingLogin.accessToken, tempPassword };
  }

  // ── Blocked: unrelated endpoints with mustChangePassword=true ─────────

  it('blocks a pending user from GET /students with the expected 403 message', async () => {
    const { pendingToken } = await createPendingPasswordUser(
      'pending1@mc.edu',
    );

    const res = await request(app.getHttpServer())
      .get('/api/students')
      .set(auth(pendingToken))
      .expect(403);

    const body = res.body as ErrorResponse;
    expect(body.message).toBe(PENDING_MESSAGE);
  });

  it('blocks a pending user from multiple unrelated endpoints (403)', async () => {
    const { pendingToken } = await createPendingPasswordUser(
      'pending2@mc.edu',
    );

    // Staff directory.
    const staffRes = await request(app.getHttpServer())
      .get('/api/staff')
      .set(auth(pendingToken))
      .expect(403);
    expect((staffRes.body as ErrorResponse).message).toBe(PENDING_MESSAGE);

    // Classes.
    await request(app.getHttpServer())
      .get('/api/classes')
      .set(auth(pendingToken))
      .expect(403);

    // Account-access list (admin-only route — guard blocks before RBAC).
    const acctRes = await request(app.getHttpServer())
      .get('/api/account-access')
      .set(auth(pendingToken))
      .expect(403);
    expect((acctRes.body as ErrorResponse).message).toBe(PENDING_MESSAGE);

    // Write endpoints are equally blocked, not just reads.
    await request(app.getHttpServer())
      .post('/api/students')
      .set(auth(pendingToken))
      .send({
        firstName: 'Nope',
        lastName: 'Nope',
        dateOfBirth: '2010-01-01',
        admissionNumber: 'ADM-MC-BLOCKED',
      })
      .expect(403);
  });

  // ── Allowed: the password-change flow itself ──────────────────────────

  it('lets a pending user call POST /auth/change-password and returns a fresh unflagged token', async () => {
    const { pendingToken, tempPassword } = await createPendingPasswordUser(
      'pending3@mc.edu',
    );

    const NEW_PASSWORD = 'FreshPassw0rd!';
    const changeRes = await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set(auth(pendingToken))
      .send({ currentPassword: tempPassword, newPassword: NEW_PASSWORD })
      .expect(200);

    const changeBody = changeRes.body as LoginResponse;
    expect(changeBody.accessToken).toBeDefined();
    expect(changeBody.mustChangePassword).toBe(false);
    expect(changeBody.user.mustChangePassword).toBe(false);

    // The fresh token grants normal access immediately.
    const studentsRes = await request(app.getHttpServer())
      .get('/api/students')
      .set(auth(changeBody.accessToken))
      .expect(200);
    expect(studentsRes.status).toBe(200);
  });

  it('after changing password, the same user can access GET /students normally', async () => {
    const { pendingToken, tempPassword } = await createPendingPasswordUser(
      'pending4@mc.edu',
    );

    // Blocked while pending...
    await request(app.getHttpServer())
      .get('/api/students')
      .set(auth(pendingToken))
      .expect(403);

    // ...changes password...
    const NEW_PASSWORD = 'AnotherPassw0rd!';
    const changeRes = await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set(auth(pendingToken))
      .send({ currentPassword: tempPassword, newPassword: NEW_PASSWORD })
      .expect(200);
    const { accessToken: freshToken } = changeRes.body as LoginResponse;

    // ...and now has normal access with the fresh token.
    await request(app.getHttpServer())
      .get('/api/students')
      .set(auth(freshToken))
      .expect(200);

    // Re-login with the new password also yields an unflagged token.
    const relogin = await login('pending4@mc.edu', NEW_PASSWORD);
    expect(relogin.mustChangePassword).toBe(false);
    await request(app.getHttpServer())
      .get('/api/students')
      .set(auth(relogin.accessToken))
      .expect(200);
  });

  // ── Unaffected: users with mustChangePassword=false ───────────────────

  it('does not affect users with mustChangePassword=false on any route', async () => {
    // school_admin across several routes.
    await request(app.getHttpServer())
      .get('/api/students')
      .set(auth(adminToken))
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/staff')
      .set(auth(adminToken))
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/account-access')
      .set(auth(adminToken))
      .expect(200);

    // staff role too.
    await request(app.getHttpServer())
      .get('/api/students')
      .set(auth(staffToken))
      .expect(200);

    // change-password still works for a normal user (self-service).
    await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set(auth(staffToken))
      .send({
        currentPassword: 'WrongCurrent1!',
        newPassword: 'SomeNewPass1!',
      })
      .expect(401); // reaches the handler — 401 wrong current password, NOT 403 guard
  });

  it('public routes remain accessible without a token', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Tenant-ID', TENANT_SCHEMA)
      .send({ email: ADMIN_EMAIL, password: SEED_PASSWORD })
      .expect(200);
  });

  it('unauthenticated requests to protected routes still get 401 (not 403)', async () => {
    await request(app.getHttpServer())
      .get('/api/students')
      .set('X-Tenant-ID', TENANT_SCHEMA)
      .expect(401);
  });
});
