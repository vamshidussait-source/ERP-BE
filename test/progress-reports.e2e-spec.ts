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
}

interface SectionResponse {
  id: string;
  classId: string;
  name: string;
}

interface StudentResponse {
  id: string;
  firstName: string;
  lastName: string;
}

interface AssessmentPeriodResponse {
  id: string;
  name: string;
  academicYear: string;
  startDate: string;
  endDate: string;
}

interface ProgressReportResponse {
  id: string;
  studentId: string;
  assessmentPeriodId: string;
  classTeacherRemarks: string | null;
  attendancePercentage: number | null;
  preparedByStaffId: string | null;
  status: string;
  studentFirstName?: string;
  studentLastName?: string;
  assessmentPeriodName?: string;
  academicYear?: string;
}

interface CoScholasticGradeResponse {
  id: string;
  progressReportId: string;
  area: string;
  grade: string;
}

interface ErrorResponse {
  message: string | string[];
  statusCode: number;
}

describe('Progress Reports (e2e)', () => {
  const TENANT_SCHEMA = 'e2eprogressreports';
  const TENANT_SUBDOMAIN = 'e2eprogressreports';
  const SEED_PASSWORD = 'E2ePassw0rd!';
  const ADMIN_EMAIL = 'pr-admin@example.com';
  const STAFF_EMAIL = 'pr-staff@example.com';
  const PARENT_EMAIL = 'pr-parent@example.com';
  const STUDENT_EMAIL = 'pr-student@example.com';
  const OTHER_PARENT_EMAIL = 'pr-other-parent@example.com';
  const PLATFORM_ADMIN_EMAIL = 'pr-e2e-platform@example.com';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let staffToken: string;
  let parentToken: string;
  let studentToken: string;
  let otherParentToken: string;
  let platformAdminToken: string;
  let studentId: string;
  let student2Id: string;
  let parentUserId: string;
  let otherParentUserId: string;
  let studentUserId: string;
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

    await dropTenant();

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
    platformAdminToken = (adminLoginRes.body as { accessToken: string }).accessToken;

    // 2. Provision a fresh tenant.
    const provisionRes = await request(app.getHttpServer())
      .post('/api/admin/tenants/provision')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        name: 'E2E Progress Reports Test School',
        schemaName: TENANT_SCHEMA,
        subdomain: TENANT_SUBDOMAIN,
        planTier: 'premium',
      })
      .expect(201);
    const tenant = provisionRes.body as TenantResponse;
    expect(tenant.schemaName).toBe(TENANT_SCHEMA);

    // 3. Seed users: school_admin, staff, parent, student, other_parent.
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO "${TENANT_SCHEMA}".users
         (email, "passwordHash", role, "isActive")
       VALUES
         ($1, $2, 'school_admin', true),
         ($3, $4, 'staff', true),
         ($5, $6, 'parent', true),
         ($7, $8, 'student', true),
         ($9, $10, 'parent', true)`,
      [
        ADMIN_EMAIL, passwordHash,
        STAFF_EMAIL, passwordHash,
        PARENT_EMAIL, passwordHash,
        STUDENT_EMAIL, passwordHash,
        OTHER_PARENT_EMAIL, passwordHash,
      ],
    );

    // Look up user IDs.
    const userRows = (await dataSource.query(
      `SELECT id, email FROM "${TENANT_SCHEMA}".users WHERE email IN ($1, $2, $3, $4, $5)`,
      [ADMIN_EMAIL, STAFF_EMAIL, PARENT_EMAIL, STUDENT_EMAIL, OTHER_PARENT_EMAIL],
    )) as Array<{ id: string; email: string }>;
    const userMap = new Map(userRows.map((r) => [r.email, r.id]));
    parentUserId = userMap.get(PARENT_EMAIL)!;
    otherParentUserId = userMap.get(OTHER_PARENT_EMAIL)!;
    studentUserId = userMap.get(STUDENT_EMAIL)!;

    // 4. Log in as all users.
    adminToken = await login(ADMIN_EMAIL);
    staffToken = await login(STAFF_EMAIL);
    parentToken = await login(PARENT_EMAIL);
    studentToken = await login(STUDENT_EMAIL);
    otherParentToken = await login(OTHER_PARENT_EMAIL);

    // 5. Create class, section, students.
    const classRes = await request(app.getHttpServer())
      .post('/api/classes')
      .set(auth(adminToken))
      .send({ name: 'Grade 10', displayOrder: 10 })
      .expect(201);
    const classBody = classRes.body as ClassResponse;

    const sectionRes = await request(app.getHttpServer())
      .post(`/api/classes/${classBody.id}/sections`)
      .set(auth(adminToken))
      .send({ name: 'A', capacity: 40 })
      .expect(201);
    sectionId = (sectionRes.body as SectionResponse).id;

    const student1Res = await request(app.getHttpServer())
      .post('/api/students')
      .set(auth(adminToken))
      .send({
        firstName: 'Priya',
        lastName: 'Sharma',
        dateOfBirth: '2010-05-15',
        admissionNumber: 'ADM-PR-001',
        sectionId,
      })
      .expect(201);
    studentId = (student1Res.body as StudentResponse).id;

    const student2Res = await request(app.getHttpServer())
      .post('/api/students')
      .set(auth(adminToken))
      .send({
        firstName: 'Arjun',
        lastName: 'Patel',
        dateOfBirth: '2010-08-20',
        admissionNumber: 'ADM-PR-002',
        sectionId,
      })
      .expect(201);
    student2Id = (student2Res.body as StudentResponse).id;

    // 6. Link parent to student1, student to their own linkedStudentId.
    await request(app.getHttpServer())
      .post('/api/parent-links')
      .set(auth(adminToken))
      .send({ parentUserId, studentId })
      .expect(201);

    // Link student user to student1.
    await dataSource.query(
      `UPDATE "${TENANT_SCHEMA}".users SET "linkedStudentId" = $1 WHERE id = $2`,
      [studentId, studentUserId],
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

  // ──────────────────────────────────────────────────────────────────
  // Assessment Periods CRUD
  // ──────────────────────────────────────────────────────────────────

  describe('AssessmentPeriods', () => {
    let periodId: string;

    it('creates an assessment period (school_admin, 201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/assessment-periods')
        .set(auth(adminToken))
        .send({
          name: 'Term 1',
          academicYear: '2026-27',
          startDate: '2026-04-01',
          endDate: '2026-09-30',
        })
        .expect(201);

      const body = res.body as AssessmentPeriodResponse;
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Term 1');
      expect(body.academicYear).toBe('2026-27');
      periodId = body.id;
    });

    it('rejects duplicate name+academicYear (409)', async () => {
      await request(app.getHttpServer())
        .post('/api/assessment-periods')
        .set(auth(adminToken))
        .send({
          name: 'Term 1',
          academicYear: '2026-27',
          startDate: '2026-04-01',
          endDate: '2026-09-30',
        })
        .expect(409);
    });

    it('lists assessment periods (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/assessment-periods')
        .set(auth(adminToken))
        .expect(200);

      const periods = res.body as AssessmentPeriodResponse[];
      expect(periods.length).toBeGreaterThanOrEqual(1);
      expect(periods[0].name).toBe('Term 1');
    });

    it('gets a single assessment period (200)', async () => {
      await request(app.getHttpServer())
        .get(`/api/assessment-periods/${periodId}`)
        .set(auth(adminToken))
        .expect(200);
    });

    it('updates an assessment period (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/assessment-periods/${periodId}`)
        .set(auth(adminToken))
        .send({ name: 'Half-Yearly' })
        .expect(200);

      const body = res.body as AssessmentPeriodResponse;
      expect(body.name).toBe('Half-Yearly');
    });

    it('rejects staff creating an assessment period (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/assessment-periods')
        .set(auth(staffToken))
        .send({
          name: 'Term 2',
          academicYear: '2026-27',
          startDate: '2026-10-01',
          endDate: '2027-03-31',
        })
        .expect(403);
    });

    it('deletes an assessment period (200)', async () => {
      // Create one to delete.
      const createRes = await request(app.getHttpServer())
        .post('/api/assessment-periods')
        .set(auth(adminToken))
        .send({
          name: 'To Delete',
          academicYear: '2026-27',
          startDate: '2026-04-01',
          endDate: '2026-09-30',
        })
        .expect(201);
      const toDeleteId = (createRes.body as AssessmentPeriodResponse).id;

      await request(app.getHttpServer())
        .delete(`/api/assessment-periods/${toDeleteId}`)
        .set(auth(adminToken))
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/assessment-periods/${toDeleteId}`)
        .set(auth(adminToken))
        .expect(404);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Progress Reports CRUD + Authorization
  // ──────────────────────────────────────────────────────────────────

  describe('ProgressReports', () => {
    let periodId: string;
    let reportId: string;

    beforeAll(async () => {
      // Create a fresh period for these tests.
      const res = await request(app.getHttpServer())
        .post('/api/assessment-periods')
        .set(auth(adminToken))
        .send({
          name: 'Term 1',
          academicYear: '2026-27',
          startDate: '2026-04-01',
          endDate: '2026-09-30',
        })
        .expect(201);
      periodId = (res.body as AssessmentPeriodResponse).id;
    });

    it('creates a progress report (school_admin, 201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/progress-reports')
        .set(auth(adminToken))
        .send({
          studentId,
          assessmentPeriodId: periodId,
          classTeacherRemarks: 'Excellent performance this term.',
          attendancePercentage: 95.5,
        })
        .expect(201);

      const body = res.body as ProgressReportResponse;
      expect(body.id).toBeDefined();
      expect(body.studentId).toBe(studentId);
      expect(body.assessmentPeriodId).toBe(periodId);
      expect(body.status).toBe('draft');
      expect(body.classTeacherRemarks).toBe('Excellent performance this term.');
      // PostgreSQL returns decimal columns as strings (e.g. "95.50")
      expect(Number(body.attendancePercentage)).toBeCloseTo(95.5, 1);
      reportId = body.id;
    });

    it('creates a progress report as staff (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/progress-reports')
        .set(auth(staffToken))
        .send({
          studentId: student2Id,
          assessmentPeriodId: periodId,
          classTeacherRemarks: 'Good effort.',
          attendancePercentage: 88.0,
        })
        .expect(201);

      const body = res.body as ProgressReportResponse;
      expect(body.status).toBe('draft');
    });

    it('upserts (updates) on duplicate studentId+periodId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/progress-reports')
        .set(auth(adminToken))
        .send({
          studentId,
          assessmentPeriodId: periodId,
          classTeacherRemarks: 'Updated remarks.',
          attendancePercentage: 97.0,
        })
        .expect(201);

      const body = res.body as ProgressReportResponse;
      expect(body.id).toBe(reportId); // same report, updated
      expect(body.classTeacherRemarks).toBe('Updated remarks.');
      expect(Number(body.attendancePercentage)).toBeCloseTo(97, 0);
    });

    it('admin can see draft reports', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/progress-reports/${reportId}`)
        .set(auth(adminToken))
        .expect(200);

      const body = res.body as ProgressReportResponse;
      expect(body.status).toBe('draft');
      expect(body.studentFirstName).toBe('Priya');
      expect(body.assessmentPeriodName).toBe('Term 1');
    });

    it('parent CANNOT see a draft report (404)', async () => {
      await request(app.getHttpServer())
        .get(`/api/progress-reports/${reportId}`)
        .set(auth(parentToken))
        .expect(404);
    });

    it('student CANNOT see a draft report (404)', async () => {
      await request(app.getHttpServer())
        .get(`/api/progress-reports/${reportId}`)
        .set(auth(studentToken))
        .expect(404);
    });

    it('admin publishes the report', async () => {
      await request(app.getHttpServer())
        .post(`/api/progress-reports/${reportId}/publish`)
        .set(auth(adminToken))
        .expect(201);

      // Verify via GET that the report is now published.
      const res = await request(app.getHttpServer())
        .get(`/api/progress-reports/${reportId}`)
        .set(auth(adminToken))
        .expect(200);
      const body = res.body as ProgressReportResponse;
      expect(body.status).toBe('published');
    });

    it('parent CAN now see the published report for linked child', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/progress-reports/${reportId}`)
        .set(auth(parentToken))
        .expect(200);

      const body = res.body as ProgressReportResponse;
      expect(body.status).toBe('published');
      expect(body.studentFirstName).toBe('Priya');
    });

    it('student CAN now see their own published report', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/progress-reports/${reportId}`)
        .set(auth(studentToken))
        .expect(200);

      const body = res.body as ProgressReportResponse;
      expect(body.status).toBe('published');
    });

    it('other parent CANNOT see this student\'s published report (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/progress-reports/${reportId}`)
        .set(auth(otherParentToken))
        .expect(403);
    });

    it('staff can see draft reports', async () => {
      // Create a new draft for student2.
      const createRes = await request(app.getHttpServer())
        .post('/api/progress-reports')
        .set(auth(staffToken))
        .send({
          studentId: student2Id,
          assessmentPeriodId: periodId,
          classTeacherRemarks: 'Draft for staff check.',
        })
        .expect(201);
      const draftId = (createRes.body as ProgressReportResponse).id;

      const res = await request(app.getHttpServer())
        .get(`/api/progress-reports/${draftId}`)
        .set(auth(staffToken))
        .expect(200);

      const body = res.body as ProgressReportResponse;
      expect(body.status).toBe('draft');
    });

    it('publish is idempotent (already published stays published)', async () => {
      await request(app.getHttpServer())
        .post(`/api/progress-reports/${reportId}/publish`)
        .set(auth(adminToken))
        .expect(201);

      // Verify status is still published.
      const res = await request(app.getHttpServer())
        .get(`/api/progress-reports/${reportId}`)
        .set(auth(adminToken))
        .expect(200);
      const body = res.body as ProgressReportResponse;
      expect(body.status).toBe('published');
    });

    it('staff cannot publish a report (403)', async () => {
      await request(app.getHttpServer())
        .post(`/api/progress-reports/${reportId}/publish`)
        .set(auth(staffToken))
        .expect(403);
    });

    it('lists all reports for a student (admin, includes drafts)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/progress-reports/student/${studentId}`)
        .set(auth(adminToken))
        .expect(200);

      const reports = res.body as ProgressReportResponse[];
      expect(reports.length).toBeGreaterThanOrEqual(1);
      expect(reports.some((r) => r.status === 'published')).toBe(true);
    });

    it('parent gets only published reports for their linked child', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/progress-reports/student/${studentId}`)
        .set(auth(parentToken))
        .expect(200);

      const reports = res.body as ProgressReportResponse[];
      for (const r of reports) {
        expect(r.status).toBe('published');
      }
    });

    it('parent cannot list reports for another student (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/progress-reports/student/${student2Id}`)
        .set(auth(parentToken))
        .expect(403);
    });

    it('student cannot list reports for another student (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/progress-reports/student/${student2Id}`)
        .set(auth(studentToken))
        .expect(403);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Co-Scholastic Grades
  // ──────────────────────────────────────────────────────────────────

  describe('CoScholasticGrades', () => {
    let periodId: string;
    let reportId: string;

    beforeAll(async () => {
      // Create period and report for testing.
      const periodRes = await request(app.getHttpServer())
        .post('/api/assessment-periods')
        .set(auth(adminToken))
        .send({
          name: 'Annual',
          academicYear: '2026-27',
          startDate: '2026-04-01',
          endDate: '2027-03-31',
        })
        .expect(201);
      periodId = (periodRes.body as AssessmentPeriodResponse).id;

      const reportRes = await request(app.getHttpServer())
        .post('/api/progress-reports')
        .set(auth(adminToken))
        .send({
          studentId,
          assessmentPeriodId: periodId,
          classTeacherRemarks: 'Annual report.',
        })
        .expect(201);
      reportId = (reportRes.body as ProgressReportResponse).id;
    });

    it('adds a co-scholastic grade (201)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/progress-reports/${reportId}/co-scholastic`)
        .set(auth(adminToken))
        .send({ area: 'Discipline', grade: 'A' })
        .expect(201);

      const body = res.body as CoScholasticGradeResponse;
      expect(body.id).toBeDefined();
      expect(body.area).toBe('Discipline');
      expect(body.grade).toBe('A');
    });

    it('adds multiple co-scholastic grades', async () => {
      await request(app.getHttpServer())
        .post(`/api/progress-reports/${reportId}/co-scholastic`)
        .set(auth(adminToken))
        .send({ area: 'Work Education', grade: 'B+' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/progress-reports/${reportId}/co-scholastic`)
        .set(auth(adminToken))
        .send({ area: 'Art Education', grade: 'A' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/progress-reports/${reportId}/co-scholastic`)
        .set(auth(adminToken))
        .send({ area: 'Health & Physical Education', grade: 'B' })
        .expect(201);
    });

    it('upserts (updates) on duplicate area', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/progress-reports/${reportId}/co-scholastic`)
        .set(auth(adminToken))
        .send({ area: 'Discipline', grade: 'A+' })
        .expect(201);

      const body = res.body as CoScholasticGradeResponse;
      expect(body.grade).toBe('A+');
    });

    it('lists co-scholastic grades for a report (admin)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/progress-reports/${reportId}/co-scholastic`)
        .set(auth(adminToken))
        .expect(200);

      const grades = res.body as CoScholasticGradeResponse[];
      expect(grades.length).toBeGreaterThanOrEqual(4);
      const areas = grades.map((g) => g.area);
      expect(areas).toContain('Discipline');
      expect(areas).toContain('Work Education');
    });

    it('rejects staff adding co-scholastic grade to draft (403 on parent report GET)', async () => {
      // The report is still in draft status. Staff can add grades (they
      // have the role), so this should succeed.
      const res = await request(app.getHttpServer())
        .post(`/api/progress-reports/${reportId}/co-scholastic`)
        .set(auth(staffToken))
        .send({ area: 'Conduct', grade: 'B' })
        .expect(201);

      const body = res.body as CoScholasticGradeResponse;
      expect(body.area).toBe('Conduct');
    });

    it('parent cannot list co-scholastic grades for draft report (404)', async () => {
      await request(app.getHttpServer())
        .get(`/api/progress-reports/${reportId}/co-scholastic`)
        .set(auth(parentToken))
        .expect(404);
    });

    it('parent CAN list co-scholastic grades after report is published', async () => {
      // Publish the report first.
      await request(app.getHttpServer())
        .post(`/api/progress-reports/${reportId}/publish`)
        .set(auth(adminToken))
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/progress-reports/${reportId}/co-scholastic`)
        .set(auth(parentToken))
        .expect(200);

      const grades = res.body as CoScholasticGradeResponse[];
      expect(grades.length).toBeGreaterThanOrEqual(4);
    });

    it('other parent cannot list co-scholastic grades (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/progress-reports/${reportId}/co-scholastic`)
        .set(auth(otherParentToken))
        .expect(403);
    });

    it('returns 404 for non-existent report', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .post(`/api/progress-reports/${fakeId}/co-scholastic`)
        .set(auth(adminToken))
        .send({ area: 'Test', grade: 'A' })
        .expect(404);
    });
  });
});
