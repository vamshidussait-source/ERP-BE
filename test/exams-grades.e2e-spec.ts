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

interface SubjectResponse {
  id: string;
  name: string;
}

interface GradingScaleResponse {
  id: string;
  name: string;
  isDefault: boolean;
}

interface GradeBandResponse {
  id: string;
  gradingScaleId: string;
  minPercentage: number;
  maxPercentage: number;
  grade: string;
}

interface ExamResponse {
  id: string;
  name: string;
  assessmentPeriodId: string | null;
  examDate: string;
  status: string;
  gradingScaleId: string | null;
}

interface ExamSubjectConfigResponse {
  id: string;
  examId: string;
  subjectId: string;
  maxMarks: number;
  subjectName: string;
}

interface ExamMarkResponse {
  id: string;
  examId: string;
  studentId: string;
  subjectId: string;
  marksObtained: number | null;
}

interface StudentMarksSummary {
  examId: string;
  examName: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  subjects: Array<{
    subjectName: string;
    maxMarks: number;
    marksObtained: number | null;
    percentage: number | null;
    grade: string | null;
  }>;
  totalMarksObtained: number;
  totalMaxMarks: number;
  overallPercentage: number | null;
  overallGrade: string | null;
  gradedSubjectsCount: number;
  totalSubjectsCount: number;
}

interface ErrorResponse {
  message: string | string[];
  statusCode: number;
}

describe('Exams & Grades (e2e)', () => {
  const TENANT_SCHEMA = 'e2eexamsgrades';
  const TENANT_SUBDOMAIN = 'e2eexamsgrades';
  const SEED_PASSWORD = 'E2ePassw0rd!';
  const ADMIN_EMAIL = 'eg-admin@example.com';
  const STAFF_EMAIL = 'eg-staff@example.com';
  const PARENT_EMAIL = 'eg-parent@example.com';
  const STUDENT_EMAIL = 'eg-student@example.com';
  const OTHER_PARENT_EMAIL = 'eg-other-parent@example.com';
  const PLATFORM_ADMIN_EMAIL = 'eg-e2e-platform@example.com';

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
  let studentUserId: string;
  let sectionId: string;
  let mathSubjectId: string;
  let scienceSubjectId: string;

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
        name: 'E2E Exams Grades Test School',
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
    const classBody = classRes.body as { id: string };

    const sectionRes = await request(app.getHttpServer())
      .post(`/api/classes/${classBody.id}/sections`)
      .set(auth(adminToken))
      .send({ name: 'A', capacity: 40 })
      .expect(201);
    sectionId = (sectionRes.body as { id: string }).id;

    const student1Res = await request(app.getHttpServer())
      .post('/api/students')
      .set(auth(adminToken))
      .send({
        firstName: 'Priya',
        lastName: 'Sharma',
        dateOfBirth: '2010-05-15',
        admissionNumber: 'ADM-EG-001',
        sectionId,
      })
      .expect(201);
    studentId = (student1Res.body as { id: string }).id;

    const student2Res = await request(app.getHttpServer())
      .post('/api/students')
      .set(auth(adminToken))
      .send({
        firstName: 'Arjun',
        lastName: 'Patel',
        dateOfBirth: '2010-08-20',
        admissionNumber: 'ADM-EG-002',
        sectionId,
      })
      .expect(201);
    student2Id = (student2Res.body as { id: string }).id;

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

    // 7. Create subjects for use in exams.
    const mathRes = await request(app.getHttpServer())
      .post('/api/subjects')
      .set(auth(adminToken))
      .send({ name: 'Mathematics' })
      .expect(201);
    mathSubjectId = (mathRes.body as SubjectResponse).id;

    const scienceRes = await request(app.getHttpServer())
      .post('/api/subjects')
      .set(auth(adminToken))
      .send({ name: 'Science' })
      .expect(201);
    scienceSubjectId = (scienceRes.body as SubjectResponse).id;
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
  // Subjects CRUD
  // ──────────────────────────────────────────────────────────────────

  describe('Subjects', () => {
    let subjectId: string;

    it('creates a subject (school_admin, 201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/subjects')
        .set(auth(adminToken))
        .send({ name: 'English' })
        .expect(201);

      const body = res.body as SubjectResponse;
      expect(body.id).toBeDefined();
      expect(body.name).toBe('English');
      subjectId = body.id;
    });

    it('rejects duplicate subject name (409)', async () => {
      await request(app.getHttpServer())
        .post('/api/subjects')
        .set(auth(adminToken))
        .send({ name: 'English' })
        .expect(409);
    });

    it('lists subjects (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/subjects')
        .set(auth(adminToken))
        .expect(200);

      const subjects = res.body as SubjectResponse[];
      expect(subjects.length).toBeGreaterThanOrEqual(3);
    });

    it('gets a subject by id (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/subjects/${subjectId}`)
        .set(auth(adminToken))
        .expect(200);

      const body = res.body as SubjectResponse;
      expect(body.name).toBe('English');
    });

    it('updates a subject (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/subjects/${subjectId}`)
        .set(auth(adminToken))
        .send({ name: 'English Literature' })
        .expect(200);

      const body = res.body as SubjectResponse;
      expect(body.name).toBe('English Literature');
    });

    it('rejects staff creating a subject (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/subjects')
        .set(auth(staffToken))
        .send({ name: 'Unauthorized Subject' })
        .expect(403);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Grading Scales + Grade Bands
  // ──────────────────────────────────────────────────────────────────

  describe('GradingScales', () => {
    let scaleId: string;
    let bandId: string;

    it('creates a grading scale (school_admin, 201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/grading-scales')
        .set(auth(adminToken))
        .send({ name: 'CBSE 9-Point Scale', isDefault: true })
        .expect(201);

      const body = res.body as GradingScaleResponse;
      expect(body.id).toBeDefined();
      expect(body.name).toBe('CBSE 9-Point Scale');
      expect(body.isDefault).toBe(true);
      scaleId = body.id;
    });

    it('adds grade bands to the scale', async () => {
      // CBSE 9-point: 91-100=A1, 81-90=A2, 71-80=B1, 61-70=B2,
      // 51-60=C1, 41-50=C2, 33-40=D, below 33=E
      const bands = [
        { minPercentage: 91, maxPercentage: 100, grade: 'A1' },
        { minPercentage: 81, maxPercentage: 90, grade: 'A2' },
        { minPercentage: 71, maxPercentage: 80, grade: 'B1' },
        { minPercentage: 61, maxPercentage: 70, grade: 'B2' },
        { minPercentage: 51, maxPercentage: 60, grade: 'C1' },
        { minPercentage: 41, maxPercentage: 50, grade: 'C2' },
        { minPercentage: 33, maxPercentage: 40, grade: 'D' },
        { minPercentage: 0, maxPercentage: 32, grade: 'E' },
      ];

      for (const band of bands) {
        const res = await request(app.getHttpServer())
          .post(`/api/grading-scales/${scaleId}/bands`)
          .set(auth(adminToken))
          .send(band)
          .expect(201);

        const body = res.body as GradeBandResponse;
        expect(body.id).toBeDefined();
        expect(body.grade).toBe(band.grade);
        if (band.grade === 'A1') {
          bandId = body.id;
        }
      }
    });

    it('lists grade bands for the scale (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/grading-scales/${scaleId}/bands`)
        .set(auth(adminToken))
        .expect(200);

      const bands = res.body as GradeBandResponse[];
      expect(bands.length).toBe(8);
    });

    it('includes bands when getting a grading scale by id (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/grading-scales/${scaleId}`)
        .set(auth(adminToken))
        .expect(200);

      const body = res.body as GradingScaleResponse & {
        bands: GradeBandResponse[];
      };
      expect(body.bands.length).toBe(8);
      expect(body.name).toBe('CBSE 9-Point Scale');
    });

    it('updates a grade band (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/grading-scales/${scaleId}/bands/${bandId}`)
        .set(auth(adminToken))
        .send({ grade: 'A1+' })
        .expect(200);

      const body = res.body as GradeBandResponse;
      expect(body.grade).toBe('A1+');

      // Revert for other tests.
      await request(app.getHttpServer())
        .patch(`/api/grading-scales/${scaleId}/bands/${bandId}`)
        .set(auth(adminToken))
        .send({ grade: 'A1' })
        .expect(200);
    });

    it('deletes a grade band (200)', async () => {
      // Create a band to delete.
      const createRes = await request(app.getHttpServer())
        .post(`/api/grading-scales/${scaleId}/bands`)
        .set(auth(adminToken))
        .send({ minPercentage: 0, maxPercentage: 10, grade: 'F' })
        .expect(201);
      const toDeleteId = (createRes.body as GradeBandResponse).id;

      await request(app.getHttpServer())
        .delete(`/api/grading-scales/${scaleId}/bands/${toDeleteId}`)
        .set(auth(adminToken))
        .expect(200);

      // Verify it's gone.
      const res = await request(app.getHttpServer())
        .get(`/api/grading-scales/${scaleId}/bands`)
        .set(auth(adminToken))
        .expect(200);
      const bands = res.body as GradeBandResponse[];
      expect(bands.find((b) => b.id === toDeleteId)).toBeUndefined();
    });

    it('rejects staff creating a grading scale (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/grading-scales')
        .set(auth(staffToken))
        .send({ name: 'Unauthorized Scale' })
        .expect(403);
    });

    it('lists grading scales (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/grading-scales')
        .set(auth(adminToken))
        .expect(200);

      const scales = res.body as GradingScaleResponse[];
      expect(scales.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Exams: CRUD, Marks, Grades, and Draft Gating
  // ──────────────────────────────────────────────────────────────────

  describe('Exams', () => {
    let examId: string;
    let gradingScaleId: string;

    beforeAll(async () => {
      // Get the grading scale we created earlier.
      const scalesRes = await request(app.getHttpServer())
        .get('/api/grading-scales')
        .set(auth(adminToken))
        .expect(200);
      const scales = scalesRes.body as GradingScaleResponse[];
      gradingScaleId = scales[0].id;
    });

    it('creates an exam with subject configs (school_admin, 201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/exams')
        .set(auth(adminToken))
        .send({
          name: 'Unit Test 1',
          examDate: '2026-08-15',
          gradingScaleId,
          subjects: [
            { subjectId: mathSubjectId, maxMarks: 100 },
            { subjectId: scienceSubjectId, maxMarks: 100 },
          ],
        })
        .expect(201);

      const body = res.body as ExamResponse;
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Unit Test 1');
      expect(body.status).toBe('draft');
      expect(body.gradingScaleId).toBe(gradingScaleId);
      examId = body.id;
    });

    it('returns subject configs for the exam (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/exams/${examId}/subjects`)
        .set(auth(adminToken))
        .expect(200);

      const configs = res.body as ExamSubjectConfigResponse[];
      expect(configs.length).toBe(2);
      const subjectNames = configs.map((c) => c.subjectName).sort();
      expect(subjectNames).toEqual(['Mathematics', 'Science']);
      expect(configs[0].maxMarks).toBe(100);
    });

    it('enters marks for a student (school_admin, 201)', async () => {
      // Math: 85/100 → 85% → should map to A2 (81-90)
      await request(app.getHttpServer())
        .post(`/api/exams/${examId}/marks`)
        .set(auth(adminToken))
        .send({
          studentId,
          subjectId: mathSubjectId,
          marksObtained: 85,
        })
        .expect(201);

      // Science: 92/100 → 92% → should map to A1 (91-100)
      await request(app.getHttpServer())
        .post(`/api/exams/${examId}/marks`)
        .set(auth(adminToken))
        .send({
          studentId,
          subjectId: scienceSubjectId,
          marksObtained: 92,
        })
        .expect(201);
    });

    it('enters marks as staff (201)', async () => {
      // Staff enters marks for student2.
      await request(app.getHttpServer())
        .post(`/api/exams/${examId}/marks`)
        .set(auth(staffToken))
        .send({
          studentId: student2Id,
          subjectId: mathSubjectId,
          marksObtained: 70,
        })
        .expect(201);
    });

    it('rejects marks exceeding max marks (400)', async () => {
      await request(app.getHttpServer())
        .post(`/api/exams/${examId}/marks`)
        .set(auth(adminToken))
        .send({
          studentId,
          subjectId: mathSubjectId,
          marksObtained: 150,
        })
        .expect(400);
    });

    it('computes correct grades from percentage via grade bands (admin, 200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/exams/${examId}/marks/${studentId}`)
        .set(auth(adminToken))
        .expect(200);

      const summary = res.body as StudentMarksSummary;
      expect(summary.examName).toBe('Unit Test 1');
      expect(summary.studentFirstName).toBe('Priya');
      expect(summary.studentLastName).toBe('Sharma');
      expect(summary.subjects.length).toBe(2);

      // Math: 85/100 → 85% → A2
      const mathSubject = summary.subjects.find(
        (s) => s.subjectName === 'Mathematics',
      )!;
      expect(Number(mathSubject.marksObtained)).toBe(85);
      expect(mathSubject.maxMarks).toBe(100);
      expect(mathSubject.percentage).toBeCloseTo(85, 0);
      expect(mathSubject.grade).toBe('A2');

      // Science: 92/100 → 92% → A1
      const scienceSubject = summary.subjects.find(
        (s) => s.subjectName === 'Science',
      )!;
      expect(Number(scienceSubject.marksObtained)).toBe(92);
      expect(scienceSubject.maxMarks).toBe(100);
      expect(scienceSubject.percentage).toBeCloseTo(92, 0);
      expect(scienceSubject.grade).toBe('A1');

      // Overall: (85+92)/(100+100) = 177/200 = 88.5% → A2
      expect(summary.totalMarksObtained).toBe(177);
      expect(summary.totalMaxMarks).toBe(200);
      expect(summary.overallPercentage).toBeCloseTo(88.5, 0);
      expect(summary.overallGrade).toBe('A2');
    });

    it('admin can see marks for a draft exam', async () => {
      await request(app.getHttpServer())
        .get(`/api/exams/${examId}/marks/${studentId}`)
        .set(auth(adminToken))
        .expect(200);
    });

    it('staff can see marks for a draft exam', async () => {
      await request(app.getHttpServer())
        .get(`/api/exams/${examId}/marks/${studentId}`)
        .set(auth(staffToken))
        .expect(200);
    });

    it('parent CANNOT see marks for a draft exam (404)', async () => {
      await request(app.getHttpServer())
        .get(`/api/exams/${examId}/marks/${studentId}`)
        .set(auth(parentToken))
        .expect(404);
    });

    it('student CANNOT see marks for a draft exam (404)', async () => {
      await request(app.getHttpServer())
        .get(`/api/exams/${examId}/marks/${studentId}`)
        .set(auth(studentToken))
        .expect(404);
    });

    it('parent CANNOT see draft exam in list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/exams')
        .set(auth(parentToken))
        .expect(200);

      const exams = res.body as ExamResponse[];
      expect(exams.find((e) => e.id === examId)).toBeUndefined();
    });

    it('student CANNOT see draft exam in list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/exams')
        .set(auth(studentToken))
        .expect(200);

      const exams = res.body as ExamResponse[];
      expect(exams.find((e) => e.id === examId)).toBeUndefined();
    });

    it('admin publishes the exam', async () => {
      await request(app.getHttpServer())
        .post(`/api/exams/${examId}/publish`)
        .set(auth(adminToken))
        .expect(201);

      // Verify via GET.
      const res = await request(app.getHttpServer())
        .get(`/api/exams/${examId}`)
        .set(auth(adminToken))
        .expect(200);
      const body = res.body as ExamResponse;
      expect(body.status).toBe('published');
    });

    it('publish is idempotent', async () => {
      await request(app.getHttpServer())
        .post(`/api/exams/${examId}/publish`)
        .set(auth(adminToken))
        .expect(201);
    });

    it('staff cannot publish an exam (403)', async () => {
      // Create a new draft exam.
      const createRes = await request(app.getHttpServer())
        .post('/api/exams')
        .set(auth(adminToken))
        .send({
          name: 'Draft Exam',
          examDate: '2026-09-01',
          subjects: [{ subjectId: mathSubjectId, maxMarks: 50 }],
        })
        .expect(201);
      const draftId = (createRes.body as ExamResponse).id;

      await request(app.getHttpServer())
        .post(`/api/exams/${draftId}/publish`)
        .set(auth(staffToken))
        .expect(403);

      // Clean up.
      await request(app.getHttpServer())
        .delete(`/api/exams/${draftId}`)
        .set(auth(adminToken))
        .expect(200);
    });

    it('parent CAN now see marks for the published exam', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/exams/${examId}/marks/${studentId}`)
        .set(auth(parentToken))
        .expect(200);

      const summary = res.body as StudentMarksSummary;
      expect(summary.examName).toBe('Unit Test 1');
      expect(summary.overallGrade).toBe('A2');
    });

    it('student CAN now see their own marks for the published exam', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/exams/${examId}/marks/${studentId}`)
        .set(auth(studentToken))
        .expect(200);

      const summary = res.body as StudentMarksSummary;
      expect(summary.examName).toBe('Unit Test 1');
    });

    it('other parent CANNOT see this student\'s marks (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/exams/${examId}/marks/${studentId}`)
        .set(auth(otherParentToken))
        .expect(403);
    });

    it('parent can see published exam in list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/exams')
        .set(auth(parentToken))
        .expect(200);

      const exams = res.body as ExamResponse[];
      expect(exams.find((e) => e.id === examId)).toBeDefined();
    });

    it('student can see published exam in list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/exams')
        .set(auth(studentToken))
        .expect(200);

      const exams = res.body as ExamResponse[];
      expect(exams.find((e) => e.id === examId)).toBeDefined();
    });

    it('cannot enter marks for a published exam (400)', async () => {
      await request(app.getHttpServer())
        .post(`/api/exams/${examId}/marks`)
        .set(auth(adminToken))
        .send({
          studentId,
          subjectId: mathSubjectId,
          marksObtained: 99,
        })
        .expect(400);
    });

    it('updates an exam (200)', async () => {
      // Create a new exam to update.
      const createRes = await request(app.getHttpServer())
        .post('/api/exams')
        .set(auth(adminToken))
        .send({
          name: 'Half-Yearly Exam',
          examDate: '2026-10-15',
          subjects: [{ subjectId: mathSubjectId, maxMarks: 100 }],
        })
        .expect(201);
      const updateId = (createRes.body as ExamResponse).id;

      const res = await request(app.getHttpServer())
        .patch(`/api/exams/${updateId}`)
        .set(auth(adminToken))
        .send({ name: 'Half-Yearly Exam (Updated)' })
        .expect(200);

      const body = res.body as ExamResponse;
      expect(body.name).toBe('Half-Yearly Exam (Updated)');

      // Clean up.
      await request(app.getHttpServer())
        .delete(`/api/exams/${updateId}`)
        .set(auth(adminToken))
        .expect(200);
    });

    it('deletes an exam (200)', async () => {
      // Create an exam to delete.
      const createRes = await request(app.getHttpServer())
        .post('/api/exams')
        .set(auth(adminToken))
        .send({
          name: 'To Delete',
          examDate: '2026-11-01',
          subjects: [{ subjectId: mathSubjectId, maxMarks: 50 }],
        })
        .expect(201);
      const toDeleteId = (createRes.body as ExamResponse).id;

      await request(app.getHttpServer())
        .delete(`/api/exams/${toDeleteId}`)
        .set(auth(adminToken))
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/exams/${toDeleteId}`)
        .set(auth(adminToken))
        .expect(404);
    });

    it('returns 404 for non-existent exam', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .get(`/api/exams/${fakeId}`)
        .set(auth(adminToken))
        .expect(404);
    });

    // ──────────────────────────────────────────────────────────────
    // Aggregate calculation: ungraded subjects excluded from denominator
    // ──────────────────────────────────────────────────────────────

    describe('Aggregate calculation edge cases', () => {
      it('returns null overallPercentage when ZERO subjects have marks entered', async () => {
        // Create an exam with 2 subjects but enter NO marks for student2.
        const createRes = await request(app.getHttpServer())
          .post('/api/exams')
          .set(auth(adminToken))
          .send({
            name: 'Empty Marks Exam',
            examDate: '2026-12-01',
            gradingScaleId,
            subjects: [
              { subjectId: mathSubjectId, maxMarks: 100 },
              { subjectId: scienceSubjectId, maxMarks: 100 },
            ],
          })
          .expect(201);
        const emptyExamId = (createRes.body as ExamResponse).id;

        // Publish so admin/staff can read (and to mirror real workflow).
        await request(app.getHttpServer())
          .post(`/api/exams/${emptyExamId}/publish`)
          .set(auth(adminToken))
          .expect(201);

        // student2 has zero marks entered for this exam.
        const res = await request(app.getHttpServer())
          .get(`/api/exams/${emptyExamId}/marks/${student2Id}`)
          .set(auth(adminToken))
          .expect(200);

        const summary = res.body as StudentMarksSummary;

        // Both subjects should show as ungraded.
        expect(summary.subjects.length).toBe(2);
        for (const s of summary.subjects) {
          expect(s.marksObtained).toBeNull();
          expect(s.percentage).toBeNull();
          expect(s.grade).toBeNull();
        }

        // Aggregate must be null — NOT 0 / lowest grade band.
        expect(summary.overallPercentage).toBeNull();
        expect(summary.overallGrade).toBeNull();
        expect(summary.totalMarksObtained).toBe(0);
        expect(summary.totalMaxMarks).toBe(0);
        expect(summary.gradedSubjectsCount).toBe(0);
        expect(summary.totalSubjectsCount).toBe(2);
      });

      it('returns percentage from GRADED subjects only when some subjects are ungraded', async () => {
        // Create an exam with 3 subjects but only enter marks for 2.
        // We need a third subject — reuse 'English Literature' created earlier.
        const subjectsList = await request(app.getHttpServer())
          .get('/api/subjects')
          .set(auth(adminToken))
          .expect(200);
        const allSubjects = subjectsList.body as SubjectResponse[];
        const englishSubject = allSubjects.find(
          (s) => s.name === 'English Literature',
        );
        if (!englishSubject) {
          throw new Error('English Literature subject not found');
        }

        const createRes = await request(app.getHttpServer())
          .post('/api/exams')
          .set(auth(adminToken))
          .send({
            name: 'Partial Marks Exam',
            examDate: '2026-12-02',
            gradingScaleId,
            subjects: [
              { subjectId: mathSubjectId, maxMarks: 100 },
              { subjectId: scienceSubjectId, maxMarks: 100 },
              { subjectId: englishSubject.id, maxMarks: 50 },
            ],
          })
          .expect(201);
        const partialExamId = (createRes.body as ExamResponse).id;

        // Enter marks for Math (80/100) and Science (40/100) but NOT English.
        await request(app.getHttpServer())
          .post(`/api/exams/${partialExamId}/marks`)
          .set(auth(adminToken))
          .send({
            studentId: student2Id,
            subjectId: mathSubjectId,
            marksObtained: 80,
          })
          .expect(201);

        await request(app.getHttpServer())
          .post(`/api/exams/${partialExamId}/marks`)
          .set(auth(adminToken))
          .send({
            studentId: student2Id,
            subjectId: scienceSubjectId,
            marksObtained: 40,
          })
          .expect(201);

        // English: NO marks entered.

        const res = await request(app.getHttpServer())
          .get(`/api/exams/${partialExamId}/marks/${student2Id}`)
          .set(auth(adminToken))
          .expect(200);

        const summary = res.body as StudentMarksSummary;

        // Only 2 of 3 subjects are graded.
        expect(summary.gradedSubjectsCount).toBe(2);
        expect(summary.totalSubjectsCount).toBe(3);

        // Percentage should be computed from graded subjects only:
        // (80 + 40) / (100 + 100) * 100 = 60%
        // NOT (80 + 40) / (100 + 100 + 50) * 100 = 48% (wrong)
        expect(summary.overallPercentage).toBeCloseTo(60, 0);
        expect(summary.totalMarksObtained).toBe(120);
        expect(summary.totalMaxMarks).toBe(200);

        // 60% on CBSE scale → C1 (51-60)
        expect(summary.overallGrade).toBe('C1');

        // English should show as ungraded.
        const englishResult = summary.subjects.find(
          (s) => s.subjectName === 'English Literature',
        );
        expect(englishResult).toBeDefined();
        expect(englishResult!.marksObtained).toBeNull();
        expect(englishResult!.percentage).toBeNull();
        expect(englishResult!.grade).toBeNull();
      });
    });
  });
});
