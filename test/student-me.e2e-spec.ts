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

interface ClassResponse {
  id: string;
  name: string;
  displayOrder: number;
}

interface SectionResponse {
  id: string;
  classId: string;
  name: string;
  capacity: number | null;
}

interface StudentResponse {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  sectionId: string | null;
  status: string;
}

interface StudentProfileResponse {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  sectionId: string | null;
  sectionName: string | null;
  className: string | null;
  status: string;
  dateOfBirth: string;
}

interface ErrorResponse {
  message: string;
}

describe('Student self-service profile (e2e)', () => {
  const TENANT_SCHEMA = 'e2estudentme';
  const TENANT_SUBDOMAIN = 'e2estudentme';
  const SEED_PASSWORD = 'E2ePassw0rd!';
  const ADMIN_EMAIL = 'studentme-admin@example.com';
  const STAFF_EMAIL = 'studentme-staff@example.com';
  const STUDENT_EMAIL = 'studentme-student@example.com';
  const UNLINKED_STUDENT_EMAIL = 'studentme-unlinked@example.com';
  const PARENT_EMAIL = 'studentme-parent@example.com';
  const PLATFORM_ADMIN_EMAIL = 'studentme-e2e-platform@example.com';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let staffToken: string;
  let studentToken: string;
  let unlinkedStudentToken: string;
  let parentToken: string;
  let platformAdminToken: string;
  let studentId: string;
  let sectionId: string;

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

    // Clean up from previous runs.
    await dropTenant();

    // 1. Seed a platform admin.
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
    platformAdminToken = (adminLoginRes.body as { accessToken: string }).accessToken;

    // 2. Provision a fresh tenant.
    const provisionRes = await request(app.getHttpServer())
      .post('/api/admin/tenants/provision')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        name: 'E2E Student Me Test School',
        schemaName: TENANT_SCHEMA,
        subdomain: TENANT_SUBDOMAIN,
      })
      .expect(201);
    const tenant = provisionRes.body as TenantResponse;
    expect(tenant.schemaName).toBe(TENANT_SCHEMA);

    // 3. Seed users: school_admin, staff, parent, linked student, unlinked student.
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO "${TENANT_SCHEMA}".users
         (email, "passwordHash", role, "isActive")
       VALUES ($1, $2, $3, true), ($4, $5, $6, true), ($7, $8, $9, true)`,
      [
        ADMIN_EMAIL, passwordHash, 'school_admin',
        STAFF_EMAIL, passwordHash, 'staff',
        PARENT_EMAIL, passwordHash, 'parent',
      ],
    );

    // 4. Create a class and section.
    adminToken = await login(ADMIN_EMAIL);
    staffToken = await login(STAFF_EMAIL);
    parentToken = await login(PARENT_EMAIL);

    const classRes = await request(app.getHttpServer())
      .post('/api/classes')
      .set(auth(adminToken))
      .send({ name: 'Grade 10', displayOrder: 10 })
      .expect(201);
    const classBody = classRes.body as ClassResponse;

    const sectionRes = await request(app.getHttpServer())
      .post(`/api/classes/${classBody.id}/sections`)
      .set(auth(adminToken))
      .send({ name: 'B', capacity: 25 })
      .expect(201);
    const sectionBody = sectionRes.body as SectionResponse;
    sectionId = sectionBody.id;

    // 5. Create a student via the API.
    const studentRes = await request(app.getHttpServer())
      .post('/api/students')
      .set(auth(adminToken))
      .send({
        firstName: 'Marie',
        lastName: 'Curie',
        dateOfBirth: '2008-01-07',
        admissionNumber: 'ADM-SME-001',
        sectionId,
      })
      .expect(201);
    const studentBody = studentRes.body as StudentResponse;
    studentId = studentBody.id;

    // 6. Create the linked student user and the unlinked student user.
    const linkedStudentUserId = await createUser(
      STUDENT_EMAIL,
      'student',
      studentId,
    );
    const _unlinkedUserId = await createUser(
      UNLINKED_STUDENT_EMAIL,
      'student',
      null,
    );

    // 7. Log in as both student users.
    studentToken = await login(STUDENT_EMAIL);
    unlinkedStudentToken = await login(UNLINKED_STUDENT_EMAIL);
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

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Tenant-ID', TENANT_SCHEMA)
      .send({ email, password: SEED_PASSWORD })
      .expect(200);
    const body = res.body as LoginResponse;
    expect(body.accessToken).toBeDefined();
    return body.accessToken;
  }

  /**
   * Creates a user row directly in the DB with the given role and
   * optional linkedStudentId, then returns the new user id.
   */
  async function createUser(
    email: string,
    role: string,
    linkedStudentId: string | null,
  ): Promise<string> {
    const hash = await bcrypt.hash(SEED_PASSWORD, 10);
    const rows = (await dataSource.query(
      `INSERT INTO "${TENANT_SCHEMA}".users
         (email, "passwordHash", role, "isActive", "linkedStudentId")
       VALUES ($1, $2, $3, true, $4)
       RETURNING id`,
      [email, hash, role, linkedStudentId],
    )) as Array<{ id: string }>;
    return rows[0].id;
  }

  function auth(token: string) {
    return {
      'X-Tenant-ID': TENANT_SCHEMA,
      Authorization: `Bearer ${token}`,
    };
  }

  // ── Tests ──────────────────────────────────────────────────────────

  it('returns the linked student profile (200)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/students/me')
      .set(auth(studentToken))
      .expect(200);

    const body = res.body as StudentProfileResponse;
    expect(body.id).toBe(studentId);
    expect(body.firstName).toBe('Marie');
    expect(body.lastName).toBe('Curie');
    expect(body.admissionNumber).toBe('ADM-SME-001');
    expect(body.sectionId).toBe(sectionId);
    expect(body.sectionName).toBe('B');
    expect(body.className).toBe('Grade 10');
    expect(body.status).toBe('active');
  });

  it('returns 404 when the student account is not linked', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/students/me')
      .set(auth(unlinkedStudentToken))
      .expect(404);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('not linked to a student record');
  });

  it('returns 403 for a non-student role (school_admin)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/students/me')
      .set(auth(adminToken))
      .expect(403);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('student accounts');
  });

  it('returns 403 for a staff role', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/students/me')
      .set(auth(staffToken))
      .expect(403);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('student accounts');
  });

  it('returns 403 for a parent role', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/students/me')
      .set(auth(parentToken))
      .expect(403);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('student accounts');
  });

  it('returns 401 without a token', async () => {
    await request(app.getHttpServer())
      .get('/api/students/me')
      .set('X-Tenant-ID', TENANT_SCHEMA)
      .expect(401);
  });
});
