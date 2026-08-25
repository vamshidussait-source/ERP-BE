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
  sectionId: string | null;
}

interface AttendanceResponse {
  id: string;
  studentId: string;
  sectionId: string | null;
  date: string;
  status: string;
  markedBy: string | null;
  notes: string | null;
  firstName?: string;
  lastName?: string;
}

interface AttendanceSummaryRow {
  studentId: string;
  firstName: string;
  lastName: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

interface ErrorResponse {
  message: string;
}

describe('Attendance (e2e)', () => {
  const TENANT_SCHEMA = 'e2eattendance';
  const TENANT_SUBDOMAIN = 'e2eattendance';
  const SEED_PASSWORD = 'E2ePassw0rd!';
  const ADMIN_EMAIL = 'attendance-admin@example.com';
  const STAFF_EMAIL = 'attendance-staff@example.com';
  const PARENT_EMAIL = 'attendance-parent@example.com';
  const PLATFORM_ADMIN_EMAIL = 'attendance-e2e-platform@example.com';
  const MARK_DATE = '2026-08-03';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let staffToken: string;
  let parentToken: string;
  let platformAdminToken: string;
  let sectionId: string;
  let student1Id: string;
  let student2Id: string;
  let student3Id: string;
  let parentUserId: string;

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
        name: 'E2E Attendance Test School',
        schemaName: TENANT_SCHEMA,
        subdomain: TENANT_SUBDOMAIN,
      })
      .expect(201);
    const tenant = provisionRes.body as TenantResponse;
    expect(tenant.schemaName).toBe(TENANT_SCHEMA);

    // 3. Seed three users (same known bcrypt hash): school_admin, staff,
    //    and parent.
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO "${TENANT_SCHEMA}".users
         (email, "passwordHash", role, "isActive")
       VALUES ($1, $2, $3, true), ($4, $5, $6, true), ($7, $8, $9, true)`,
      [
        ADMIN_EMAIL,
        passwordHash,
        'school_admin',
        STAFF_EMAIL,
        passwordHash,
        'staff',
        PARENT_EMAIL,
        passwordHash,
        'parent',
      ],
    );

    // Look up the parent user id for later parent–student linking.
    const parentRows = (await dataSource.query(
      `SELECT id FROM "${TENANT_SCHEMA}".users WHERE email = $1`,
      [PARENT_EMAIL],
    )) as Array<{ id: string }>;
    parentUserId = parentRows[0].id;

    // 4. Log in as all three users.
    adminToken = await login(ADMIN_EMAIL);
    staffToken = await login(STAFF_EMAIL);
    parentToken = await login(PARENT_EMAIL);

    // 5. Create a class, a section, and three students in that section
    //    (the third student has no attendance records, to exercise the
    //    zero-count summary row).
    const classRes = await request(app.getHttpServer())
      .post('/api/classes')
      .set(auth(adminToken))
      .send({ name: 'Grade 8', displayOrder: 8 })
      .expect(201);
    const classBody = classRes.body as ClassResponse;

    const sectionRes = await request(app.getHttpServer())
      .post(`/api/classes/${classBody.id}/sections`)
      .set(auth(adminToken))
      .send({ name: 'A', capacity: 30 })
      .expect(201);
    const sectionBody = sectionRes.body as SectionResponse;
    sectionId = sectionBody.id;

    const student1Res = await request(app.getHttpServer())
      .post('/api/students')
      .set(auth(adminToken))
      .send({
        firstName: 'Grace',
        lastName: 'Hopper',
        dateOfBirth: '2006-04-14',
        admissionNumber: 'ADM-ATT-001',
        sectionId,
      })
      .expect(201);
    const student1 = student1Res.body as StudentResponse;
    student1Id = student1.id;

    const student2Res = await request(app.getHttpServer())
      .post('/api/students')
      .set(auth(adminToken))
      .send({
        firstName: 'Alan',
        lastName: 'Turing',
        dateOfBirth: '2006-06-23',
        admissionNumber: 'ADM-ATT-002',
        sectionId,
      })
      .expect(201);
    const student2 = student2Res.body as StudentResponse;
    student2Id = student2.id;

    const student3Res = await request(app.getHttpServer())
      .post('/api/students')
      .set(auth(adminToken))
      .send({
        firstName: 'Ada',
        lastName: 'Lovelace',
        dateOfBirth: '2006-12-10',
        admissionNumber: 'ADM-ATT-003',
        sectionId,
      })
      .expect(201);
    const student3 = student3Res.body as StudentResponse;
    student3Id = student3.id;

    expect(student1.sectionId).toBe(sectionId);
    expect(student2.sectionId).toBe(sectionId);
    expect(student3.sectionId).toBe(sectionId);

    // 6. Link parent to student1 so the parent can view that student's
    //    attendance (required by the new parent-child scoping).
    await request(app.getHttpServer())
      .post('/api/parent-links')
      .set(auth(adminToken))
      .send({ parentUserId, studentId: student1Id })
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

  /** Logs in a seeded user and returns the JWT access token. */
  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Tenant-ID', TENANT_SCHEMA)
      .send({ email, password: SEED_PASSWORD })
      .expect(200);
    const body = res.body as LoginResponse;
    expect(body.accessToken).toBeDefined();
    expect(body.user).toBeDefined();
    expect(body.user.id).toBeDefined();
    expect(body.user.email).toBe(email);
    expect(body.user.role).toBeDefined();
    return body.accessToken;
  }

  /** Headers required by every tenant-scoped route, for a given token. */
  function auth(token: string) {
    return {
      'X-Tenant-ID': TENANT_SCHEMA,
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * Regex to assert that a value is a plain YYYY-MM-DD date string,
   * NOT a full ISO datetime (e.g. "2026-08-01T00:00:00.000Z").
   */
  const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

  /**
   * Regex that matches a full ISO datetime string — used to verify the
   * date field is NOT serialized as a datetime.
   */
  const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T/;

  it('lets a staff user mark attendance (201, status present)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/attendance/mark')
      .set(auth(staffToken))
      .send({
        studentId: student1Id,
        date: MARK_DATE,
        status: 'present',
      })
      .expect(201);

    const body = res.body as AttendanceResponse;
    expect(body.studentId).toBe(student1Id);
    // REGRESSION: date must be a plain "YYYY-MM-DD" string, not an
    // ISO datetime like "2026-08-03T00:00:00.000Z".
    expect(body.date).toBe(MARK_DATE);
    expect(body.date).toMatch(YYYY_MM_DD);
    expect(body.date).not.toMatch(ISO_DATETIME);
    expect(body.status).toBe('present');
    expect(body.id).toBeDefined();
    // The seeded "staff" user has no row in the staff table, so the FK-safe
    // fallback marks this record with markedBy = null.
    expect(body.markedBy).toBeNull();
  });

  it('re-marks the same student+date, updating instead of duplicating', async () => {
    // Re-mark the same student on the same date with a different status.
    const res = await request(app.getHttpServer())
      .post('/api/attendance/mark')
      .set(auth(staffToken))
      .send({
        studentId: student1Id,
        date: MARK_DATE,
        status: 'late',
      })
      .expect(201);

    const body = res.body as AttendanceResponse;
    expect(body.studentId).toBe(student1Id);
    expect(body.status).toBe('late');

    // Exactly one record must exist for this student+date.
    const dayRes = await request(app.getHttpServer())
      .get(`/api/attendance/section/${sectionId}/date/${MARK_DATE}`)
      .set(auth(staffToken))
      .expect(200);
    const records = dayRes.body as AttendanceResponse[];
    const student1Records = records.filter((r) => r.studentId === student1Id);
    expect(student1Records).toHaveLength(1);
    expect(student1Records[0].status).toBe('late');
  });

  it('marks the second student absent', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/attendance/mark')
      .set(auth(staffToken))
      .send({
        studentId: student2Id,
        date: MARK_DATE,
        status: 'absent',
      })
      .expect(201);

    const body = res.body as AttendanceResponse;
    expect(body.studentId).toBe(student2Id);
    expect(body.status).toBe('absent');
  });

  it('returns both marked students for the section+date with names', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/attendance/section/${sectionId}/date/${MARK_DATE}`)
      .set(auth(staffToken))
      .expect(200);

    const records = res.body as AttendanceResponse[];
    const byStudent = new Map(records.map((r) => [r.studentId, r]));

    expect(records).toHaveLength(2);

    const record1 = byStudent.get(student1Id);
    expect(record1).toBeDefined();
    expect(record1.status).toBe('late');
    expect(record1.firstName).toBe('Grace');
    expect(record1.lastName).toBe('Hopper');

    const record2 = byStudent.get(student2Id);
    expect(record2).toBeDefined();
    expect(record2.status).toBe('absent');
    expect(record2.firstName).toBe('Alan');
    expect(record2.lastName).toBe('Turing');
  });

  it('summarizes status counts, including a zero-record student', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/attendance/section/${sectionId}/summary`)
      .query({ startDate: '2026-08-01', endDate: '2026-08-31' })
      .set(auth(staffToken))
      .expect(200);

    const rows = res.body as AttendanceSummaryRow[];
    expect(rows).toHaveLength(3);
    const byStudent = new Map(rows.map((r) => [r.studentId, r]));

    const row1 = byStudent.get(student1Id);
    expect(row1).toBeDefined();
    expect(row1.present).toBe(0);
    expect(row1.late).toBe(1);
    expect(row1.absent).toBe(0);
    expect(row1.excused).toBe(0);

    const row2 = byStudent.get(student2Id);
    expect(row2).toBeDefined();
    expect(row2.present).toBe(0);
    expect(row2.late).toBe(0);
    expect(row2.absent).toBe(1);
    expect(row2.excused).toBe(0);

    // Student 3 has no records — must appear with all-zero counts.
    const row3 = byStudent.get(student3Id);
    expect(row3).toBeDefined();
    expect(row3.present).toBe(0);
    expect(row3.absent).toBe(0);
    expect(row3.late).toBe(0);
    expect(row3.excused).toBe(0);
  });

  it('returns date as plain YYYY-MM-DD, not ISO datetime (regression)', async () => {
    // 1. POST /attendance/mark — the create/upsert endpoint.
    const markRes = await request(app.getHttpServer())
      .post('/api/attendance/mark')
      .set(auth(staffToken))
      .send({
        studentId: student1Id,
        date: MARK_DATE,
        status: 'present',
      })
      .expect(201);

    const markBody = markRes.body as AttendanceResponse;
    expect(markBody.date).toBe(MARK_DATE);
    expect(markBody.date).toMatch(YYYY_MM_DD);
    expect(markBody.date).not.toMatch(ISO_DATETIME);

    // 2. GET /attendance/section/:sectionId/date/:date — date columns
    //    in the section-by-date query.
    const sectionRes = await request(app.getHttpServer())
      .get(`/api/attendance/section/${sectionId}/date/${MARK_DATE}`)
      .set(auth(staffToken))
      .expect(200);

    const sectionRecords = sectionRes.body as AttendanceResponse[];
    for (const record of sectionRecords) {
      expect(record.date).toMatch(YYYY_MM_DD);
      expect(record.date).not.toMatch(ISO_DATETIME);
    }

    // 3. GET /attendance/student/:studentId — paginated student history.
    const studentRes = await request(app.getHttpServer())
      .get(`/api/attendance/student/${student1Id}`)
      .query({ startDate: '2026-08-01', endDate: '2026-08-31' })
      .set(auth(staffToken))
      .expect(200);

    const studentBody = studentRes.body as {
      data: AttendanceResponse[];
    };
    for (const record of studentBody.data) {
      expect(record.date).toMatch(YYYY_MM_DD);
      expect(record.date).not.toMatch(ISO_DATETIME);
    }
  });

  it('rejects a parent marking attendance (403) but allows GET endpoints', async () => {
    // 403 on the write endpoint.
    const markRes = await request(app.getHttpServer())
      .post('/api/attendance/mark')
      .set(auth(parentToken))
      .send({
        studentId: student1Id,
        date: MARK_DATE,
        status: 'present',
      })
      .expect(403);
    const markBody = markRes.body as ErrorResponse;
    expect(markBody.message).toContain('school_admin');

    // GET endpoints stay open to the parent role (for linked children
    //    and section-level queries).
    await request(app.getHttpServer())
      .get(`/api/attendance/section/${sectionId}/date/${MARK_DATE}`)
      .set(auth(parentToken))
      .expect(200);

    // Parent is linked to student1, so this should work.
    await request(app.getHttpServer())
      .get(`/api/attendance/student/${student1Id}`)
      .query({ startDate: '2026-08-01', endDate: '2026-08-31' })
      .set(auth(parentToken))
      .expect(200);

    // Parent is NOT linked to student2, so this should be 403.
    await request(app.getHttpServer())
      .get(`/api/attendance/student/${student2Id}`)
      .query({ startDate: '2026-08-01', endDate: '2026-08-31' })
      .set(auth(parentToken))
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/attendance/section/${sectionId}/summary`)
      .query({ startDate: '2026-08-01', endDate: '2026-08-31' })
      .set(auth(parentToken))
      .expect(200);
  });
});
