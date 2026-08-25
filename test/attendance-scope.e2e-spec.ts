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
}

describe('Attendance scoping (e2e)', () => {
  const TENANT_SCHEMA = 'e2eattscope';
  const TENANT_SUBDOMAIN = 'e2eattscope';
  const SEED_PASSWORD = 'E2ePassw0rd!';
  const ADMIN_EMAIL = 'scope-admin@example.com';
  const STAFF_EMAIL = 'scope-staff@example.com';
  const PARENT_EMAIL = 'scope-parent@example.com';
  const STUDENT_USER_EMAIL = 'scope-student-user@example.com';
  const STUDENT_NO_LINK_EMAIL = 'scope-student-nolink@example.com';
  const PLATFORM_ADMIN_EMAIL = 'att-scope-e2e-platform@example.com';
  const MARK_DATE = '2026-08-10';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let staffToken: string;
  let parentToken: string;
  let studentUserToken: string;
  let platformAdminToken: string;
  let sectionId: string;
  let student1Id: string; // linked to parent
  let student2Id: // not linked to parent
    string;
  let studentUserDbId: string; // the users.id for the student-role user
  let studentNoLinkDbId: string; // student-role user with no linkedStudentId
  let student1UserId: string; // the users.id for the parent-role user
  let student2UserId: string;
  let studentNoLinkToken: string;

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
    platformAdminToken = (adminLoginRes.body as { accessToken: string })
      .accessToken;

    // 2. Provision a fresh tenant.
    const provisionRes = await request(app.getHttpServer())
      .post('/api/admin/tenants/provision')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        name: 'E2E Attendance Scope Test School',
        schemaName: TENANT_SCHEMA,
        subdomain: TENANT_SUBDOMAIN,
      })
      .expect(201);
    const tenant = provisionRes.body as TenantResponse;
    expect(tenant.schemaName).toBe(TENANT_SCHEMA);

    // 3. Seed users: school_admin, staff, parent, student-role user.
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    const userRows = (await dataSource.query(
      `INSERT INTO "${TENANT_SCHEMA}".users
         (email, "passwordHash", role, "isActive")
       VALUES ($1, $2, $3, true), ($4, $5, $6, true), ($7, $8, $9, true), ($10, $11, $12, true), ($13, $14, $15, true)
       RETURNING id, email`,
      [
        ADMIN_EMAIL, passwordHash, 'school_admin',
        STAFF_EMAIL, passwordHash, 'staff',
        PARENT_EMAIL, passwordHash, 'parent',
        STUDENT_USER_EMAIL, passwordHash, 'student',
        STUDENT_NO_LINK_EMAIL, passwordHash, 'student',
      ],
    )) as Array<{ id: string; email: string }>;

    const emailToId = new Map(userRows.map((r) => [r.email, r.id]));
    student1UserId = emailToId.get(PARENT_EMAIL)!;
    studentUserDbId = emailToId.get(STUDENT_USER_EMAIL)!;
    studentNoLinkDbId = emailToId.get(STUDENT_NO_LINK_EMAIL)!;;

    // 4. Log in all users.
    adminToken = await login(ADMIN_EMAIL);
    staffToken = await login(STAFF_EMAIL);
    parentToken = await login(PARENT_EMAIL);
    studentUserToken = await login(STUDENT_USER_EMAIL);
    studentNoLinkToken = await login(STUDENT_NO_LINK_EMAIL);

    // 5. Create class + section + two students.
    const classRes = await request(app.getHttpServer())
      .post('/api/classes')
      .set(auth(adminToken))
      .send({ name: 'Grade 5', displayOrder: 5 })
      .expect(201);
    const classBody = classRes.body as { id: string };

    const sectionRes = await request(app.getHttpServer())
      .post(`/api/classes/${classBody.id}/sections`)
      .set(auth(adminToken))
      .send({ name: 'A', capacity: 30 })
      .expect(201);
    const sectionBody = sectionRes.body as { id: string };
    sectionId = sectionBody.id;

    const s1Res = await request(app.getHttpServer())
      .post('/api/students')
      .set(auth(adminToken))
      .send({
        firstName: 'Alice',
        lastName: 'Smith',
        dateOfBirth: '2014-03-15',
        admissionNumber: 'ADM-SCOPE-001',
        sectionId,
      })
      .expect(201);
    student1Id = (s1Res.body as { id: string }).id;

    const s2Res = await request(app.getHttpServer())
      .post('/api/students')
      .set(auth(adminToken))
      .send({
        firstName: 'Bob',
        lastName: 'Jones',
        dateOfBirth: '2014-07-22',
        admissionNumber: 'ADM-SCOPE-002',
        sectionId,
      })
      .expect(201);
    student2Id = (s2Res.body as { id: string }).id;

    // 6. Link parent to student1 (Alice) via the parent-links API.
    await request(app.getHttpServer())
      .post('/api/parent-links')
      .set(auth(adminToken))
      .send({ parentUserId: student1UserId, studentId: student1Id })
      .expect(201);

    // 7. Set linkedStudentId on the student-role user (Bob).
    await dataSource.query(
      `UPDATE "${TENANT_SCHEMA}".users
       SET "linkedStudentId" = $1
       WHERE id = $2`,
      [student2Id, studentUserDbId],
    );

    // 8. Mark attendance for both students.
    await request(app.getHttpServer())
      .post('/api/attendance/mark')
      .set(auth(staffToken))
      .send({ studentId: student1Id, date: MARK_DATE, status: 'present' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/attendance/mark')
      .set(auth(staffToken))
      .send({ studentId: student2Id, date: MARK_DATE, status: 'absent' })
      .expect(201);
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
    return body.accessToken;
  }

  function auth(token: string) {
    return {
      'X-Tenant-ID': TENANT_SCHEMA,
      Authorization: `Bearer ${token}`,
    };
  }

  // ── Parent scoping ───────────────────────────────────────────────────

  it('parent can view attendance for linked child (student1)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/attendance/student/${student1Id}`)
      .set(auth(parentToken))
      .expect(200);

    const body = res.body as { data: unknown[]; total: number };
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('parent gets 403 for unlinked student (student2)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/attendance/student/${student2Id}`)
      .set(auth(parentToken))
      .expect(403);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('permission');
  });

  // ── Student-self scoping ─────────────────────────────────────────────

  it('student user can view own attendance (student2)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/attendance/student/${student2Id}`)
      .set(auth(studentUserToken))
      .expect(200);

    const body = res.body as { data: unknown[]; total: number };
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('student user gets 403 for another student (student1)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/attendance/student/${student1Id}`)
      .set(auth(studentUserToken))
      .expect(403);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('own');
  });

  // ── Unrestricted roles ───────────────────────────────────────────────

  it('school_admin can view any student attendance', async () => {
    await request(app.getHttpServer())
      .get(`/api/attendance/student/${student1Id}`)
      .set(auth(adminToken))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/attendance/student/${student2Id}`)
      .set(auth(adminToken))
      .expect(200);
  });

  it('staff can view any student attendance', async () => {
    await request(app.getHttpServer())
      .get(`/api/attendance/student/${student1Id}`)
      .set(auth(staffToken))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/attendance/student/${student2Id}`)
      .set(auth(staffToken))
      .expect(200);
  });

  // ── Parent-links CRUD ────────────────────────────────────────────────

  it('school_admin can unlink a parent and the parent then gets 403', async () => {
    // Unlink parent from student1.
    await request(app.getHttpServer())
      .delete('/api/parent-links')
      .set(auth(adminToken))
      .send({ parentUserId: student1UserId, studentId: student1Id })
      .expect(200);

    // Parent can no longer view student1's attendance.
    await request(app.getHttpServer())
      .get(`/api/attendance/student/${student1Id}`)
      .set(auth(parentToken))
      .expect(403);

    // Re-link for any further tests.
    await request(app.getHttpServer())
      .post('/api/parent-links')
      .set(auth(adminToken))
      .send({ parentUserId: student1UserId, studentId: student1Id })
      .expect(201);
  });

  // ── GET /attendance/me ─────────────────────────────────────────────

  it('student with linkedStudentId can fetch own attendance via /me', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/attendance/me')
      .query({ startDate: '2026-08-01', endDate: '2026-08-31' })
      .set(auth(studentUserToken))
      .expect(200);

    const body = res.body as { data: unknown[]; total: number };
    // studentUserDbId is linked to student2Id which has one attendance record.
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('student without linkedStudentId gets 404 from /me', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/attendance/me')
      .set(auth(studentNoLinkToken))
      .expect(404);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('not linked to a student record');
  });

  it('non-student role gets 403 from /me', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/attendance/me')
      .set(auth(parentToken))
      .expect(403);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('only available to student accounts');
  });

  it('parent role is rejected from the parent-links endpoints (403)', async () => {
    await request(app.getHttpServer())
      .post('/api/parent-links')
      .set(auth(parentToken))
      .send({ parentUserId: student1UserId, studentId: student1Id })
      .expect(403);
  });
});
