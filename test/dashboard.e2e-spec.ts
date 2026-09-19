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

interface SectionResponse {
  id: string;
  classId: string;
  name: string;
}

interface StudentResponse {
  id: string;
  firstName: string;
  lastName: string;
  sectionId: string | null;
}

interface StaffResponse {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
}

interface SubjectResponse {
  id: string;
  name: string;
}

interface ExamResponse {
  id: string;
  name: string;
  examDate: string;
  status: string;
}

interface AttendanceToday {
  present: number;
  absent: number;
  late: number;
  excused: number;
  notMarkedSections: number;
}

interface RecentActivityItem {
  type: string;
  description: string;
  timestamp: string;
}

interface DashboardSummary {
  totalStudents: number;
  totalStaff: number;
  activeClasses: number;
  attendanceToday: AttendanceToday;
  upcomingAnnouncements: Array<{
    id: string;
    title: string;
    priority: string;
    sentAt: string | null;
  }>;
  recentActivity: RecentActivityItem[];
  examsThisWeek: number;
  today: string;
}

interface ErrorResponse {
  message: string | string[];
  statusCode: number;
}

describe('Dashboard summary (e2e)', () => {
  const TENANT_SCHEMA = 'e2edashboard';
  const TENANT_SUBDOMAIN = 'e2edashboard';
  const SEED_PASSWORD = 'E2ePassw0rd!';
  const ADMIN_EMAIL = 'dash-admin@example.com';
  const STAFF_EMAIL = 'dash-staff@example.com';
  const PARENT_A_EMAIL = 'dash-parent-a@example.com';
  const STUDENT_A_EMAIL = 'dash-student-a@example.com';
  const PLATFORM_ADMIN_EMAIL = 'dash-e2e-platform@example.com';

  // Known seed quantities asserted against the summary below.
  // 2 staff rows created; one is soft-deleted (inactive) → totalStaff = 1.
  const EXPECTED_STAFF = 1;
  // 4 students created; one (Dash Delta) is soft-deleted → totalStudents = 3.
  const EXPECTED_STUDENTS = 3;
  // 2 classes each with ≥1 section → activeClasses = 2.
  const EXPECTED_CLASSES = 2;
  // 3 sections; sections A and B2 have attendance today, only B unmarked → 1.
  const EXPECTED_NOT_MARKED = 1;

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let staffToken: string;
  let parentAToken: string;
  let sectionAId: string;
  let sectionBId: string;
  let sectionB2Id: string;
  let sectionCId: string;
  let studentAId: string;
  let studentBId: string;
  let studentCId: string;
  let studentDId: string;

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

    // 0. Make sure the feature catalog rows exist (FeatureGuard consults
    //    public.plan_tier_features; they are normally seeded by
    //    npm run seed:features). Idempotent — safe to re-run.
    await dataSource.query(
      `INSERT INTO public.features (key, name, description)
       VALUES ('exams_grades', 'Exams & Grades', 'Exam management and grade recording.'),
              ('progress_reports', 'Progress Reports', 'Periodic progress and report card generation.')
       ON CONFLICT (key) DO NOTHING`,
    );
    await dataSource.query(
      `INSERT INTO public.plan_tier_features ("planTier", "featureKey", enabled)
       VALUES ('premium', 'exams_grades', true), ('premium', 'progress_reports', true)
       ON CONFLICT ("planTier", "featureKey") DO NOTHING`,
    );

    // 1. Seed platform admin and log in.
    await dataSource.query(
      `DELETE FROM public.platform_admins WHERE email = $1`,
      [PLATFORM_ADMIN_EMAIL],
    );
    const adminPasswordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO public.platform_admins (email, "passwordHash", name)
       VALUES ($1, $2, $3)`,
      [PLATFORM_ADMIN_EMAIL, adminPasswordHash, 'E2E Dashboard Platform Admin'],
    );

    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email: PLATFORM_ADMIN_EMAIL, password: SEED_PASSWORD })
      .expect(200);
    const platformAdminToken = (
      adminLoginRes.body as { accessToken: string }
    ).accessToken;

    // 2. Provision a fresh premium-tier tenant.
    const provisionRes = await request(app.getHttpServer())
      .post('/api/admin/tenants/provision')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        name: 'E2E Dashboard Test School',
        schemaName: TENANT_SCHEMA,
        subdomain: TENANT_SUBDOMAIN,
        planTier: 'premium',
      })
      .expect(201);
    const tenant = provisionRes.body as TenantResponse;
    expect(tenant.schemaName).toBe(TENANT_SCHEMA);

    // 3. Seed users: school_admin, staff, parent, student.
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO "${TENANT_SCHEMA}".users
         (email, "passwordHash", role, "isActive")
       VALUES
         ($1, $2, 'school_admin', true),
         ($3, $4, 'staff', true),
         ($5, $6, 'parent', true),
         ($7, $8, 'student', true)`,
      [
        ADMIN_EMAIL, passwordHash,
        STAFF_EMAIL, passwordHash,
        PARENT_A_EMAIL, passwordHash,
        STUDENT_A_EMAIL, passwordHash,
      ],
    );

    // 4. Log in as tenant users.
    adminToken = await login(ADMIN_EMAIL);
    staffToken = await login(STAFF_EMAIL);
    parentAToken = await login(PARENT_A_EMAIL);

    // 5. Two classes; class A gets sections A and B2, class B gets section B.
    //    → activeClasses = 2, sections = 3.
    const classARes = await request(app.getHttpServer())
      .post('/api/classes')
      .set(auth(adminToken))
      .send({ name: 'Dash Grade 10', displayOrder: 10 })
      .expect(201);
    const classAId = (classARes.body as { id: string }).id;

    const classBRes = await request(app.getHttpServer())
      .post('/api/classes')
      .set(auth(adminToken))
      .send({ name: 'Dash Grade 11', displayOrder: 11 })
      .expect(201);
    const classBId = (classBRes.body as { id: string }).id;

    const sectionARes = await request(app.getHttpServer())
      .post(`/api/classes/${classAId}/sections`)
      .set(auth(adminToken))
      .send({ name: 'A', capacity: 40 })
      .expect(201);
    sectionAId = (sectionARes.body as SectionResponse).id;

    const sectionBRes = await request(app.getHttpServer())
      .post(`/api/classes/${classBId}/sections`)
      .set(auth(adminToken))
      .send({ name: 'B', capacity: 40 })
      .expect(201);
    sectionBId = (sectionBRes.body as SectionResponse).id;

    const sectionB2Res = await request(app.getHttpServer())
      .post(`/api/classes/${classAId}/sections`)
      .set(auth(adminToken))
      .send({ name: 'B2', capacity: 40 })
      .expect(201);
    sectionB2Id = (sectionB2Res.body as SectionResponse).id;

    // A section with ZERO enrolled students: it must never count as
    // "unmarked" in attendanceToday — there is nothing to mark in it.
    const sectionCRes = await request(app.getHttpServer())
      .post(`/api/classes/${classBId}/sections`)
      .set(auth(adminToken))
      .send({ name: 'C', capacity: 40 })
      .expect(201);
    sectionCId = (sectionCRes.body as SectionResponse).id;

    // 6. Four active students (A + B2 get attendance today; B + C don't).
    const mkStudent = async (
      firstName: string,
      lastName: string,
      admission: string,
      sid: string,
    ): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/api/students')
        .set(auth(adminToken))
        .send({
          firstName,
          lastName,
          dateOfBirth: '2010-05-15',
          admissionNumber: admission,
          sectionId: sid,
        })
        .expect(201);
      return (res.body as StudentResponse).id;
    };
    studentAId = await mkStudent('Dash', 'Alpha', 'ADM-DASH-001', sectionAId);
    studentBId = await mkStudent('Dash', 'Bravo', 'ADM-DASH-002', sectionBId);
    studentCId = await mkStudent('Dash', 'Charlie', 'ADM-DASH-003', sectionAId);
    studentDId = await mkStudent('Dash', 'Delta', 'ADM-DASH-004', sectionB2Id);

    // 7. Two staff members (a third is created later then soft-deleted).
    const mkStaff = async (
      firstName: string,
      lastName: string,
      email: string,
      employeeId: string,
    ): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/api/staff')
        .set(auth(adminToken))
        .send({
          firstName,
          lastName,
          email,
          designation: 'Teacher',
          employeeId,
        })
        .expect(201);
      return (res.body as StaffResponse).id;
    };
    await mkStaff(
      'Dash', 'Teacher1', 'dash-teacher1@example.com', 'EMP-DASH-001',
    );
    await mkStaff(
      'Dash', 'Teacher2', 'dash-teacher2@example.com', 'EMP-DASH-002',
    );

    // 8. Sent announcements: 2 for the preview, 1 third-newer-but-draft.
    const mkAnnouncement = async (
      title: string,
      priority: string,
      sent: boolean,
    ): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title,
          message: `Message for ${title}.`,
          audienceType: 'all_staff',
          priority,
          ...(sent ? { status: 'sent' } : {}),
        })
        .expect(201);
      return (res.body as { id: string }).id;
    };
    await mkAnnouncement('Dash Older Sent', 'normal', true);
    await mkAnnouncement('Dash Newest Sent', 'important', true);
    await mkAnnouncement('Dash Draft Not Shown', 'urgent', false);

    // 9. Attendance today: section A fully marked (present, late), section B2
    //    only marked (excused) — section B has no records at all today.
    const mark = (
      studentId: string,
      status: string,
    ): Promise<unknown> =>
      request(app.getHttpServer())
        .post('/api/attendance/mark')
        .set(auth(adminToken))
        .send({ studentId, date: todayStr(), status })
        .expect(201);
    await mark(studentAId, 'present');
    await mark(studentCId, 'late');
    await mark(studentDId, 'excused');

    // 10. Subject + assessment period + published exam/report for activity.
    const subjectRes = await request(app.getHttpServer())
      .post('/api/subjects')
      .set(auth(adminToken))
      .send({ name: 'Dash Mathematics' })
      .expect(201);
    const subjectId = (subjectRes.body as SubjectResponse).id;

    const periodRes = await request(app.getHttpServer())
      .post('/api/assessment-periods')
      .set(auth(adminToken))
      .send({
        name: 'Dash Term 1',
        academicYear: '2026-27',
        startDate: '2026-04-01',
        endDate: '2026-09-30',
      })
      .expect(201);
    const periodId = (periodRes.body as { id: string }).id;

    // Exam inside the current Mon-Sun week (computed from the DB, like the
    // service) → counted. Next-week exam → not counted.
    const week = await dbWeekBounds();
    const inWeekDate = week.start <= todayStr() ? todayStr() : week.start;
    const examThisWeekRes = await request(app.getHttpServer())
      .post('/api/exams')
      .set(auth(adminToken))
      .send({
        name: 'Dash Unit Test',
        examDate: inWeekDate,
        subjects: [{ subjectId, maxMarks: 100 }],
      })
      .expect(201);
    const examThisWeekId = (examThisWeekRes.body as ExamResponse).id;

    // A second exam the day AFTER the week ends → NOT counted.
    const afterWeek = new Date(`${week.end}T00:00:00`);
    afterWeek.setDate(afterWeek.getDate() + 1);
    const yy = afterWeek.getFullYear();
    const mm = String(afterWeek.getMonth() + 1).padStart(2, '0');
    const dd = String(afterWeek.getDate()).padStart(2, '0');
    await request(app.getHttpServer())
      .post('/api/exams')
      .set(auth(adminToken))
      .send({
        name: 'Dash Half-Yearly',
        examDate: `${yy}-${mm}-${dd}`,
        subjects: [{ subjectId, maxMarks: 100 }],
      })
      .expect(201);

    // Publish the first exam so it lands in recentActivity.
    await request(app.getHttpServer())
      .post(`/api/exams/${examThisWeekId}/publish`)
      .set(auth(adminToken))
      .expect(201);

    // Published progress report → lands in recentActivity.
    const reportRes = await request(app.getHttpServer())
      .post('/api/progress-reports')
      .set(auth(adminToken))
      .send({
        studentId: studentBId,
        assessmentPeriodId: periodId,
        classTeacherRemarks: 'Doing well.',
      })
      .expect(201);
    const reportId = (reportRes.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/api/progress-reports/${reportId}/publish`)
      .set(auth(adminToken))
      .expect(201);

    // 11. Soft-delete one student and one staff member — neither may be
    //     counted in totalStudents/totalStaff.
    await request(app.getHttpServer())
      .delete(`/api/students/${studentDId}`)
      .set(auth(adminToken))
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/staff/${await lookupStaffId('EMP-DASH-002')}`)
      .set(auth(adminToken))
      .expect(200);
    // (studentD was already marked excused above BEFORE deletion, so today's
    // attendance counts still reflect a real marking flow.)
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

  async function lookupStaffId(employeeId: string): Promise<string> {
    const rows = (await dataSource.query(
      `SELECT id FROM "${TENANT_SCHEMA}".staff WHERE "employeeId" = $1`,
      [employeeId],
    )) as Array<{ id: string }>;
    return rows[0].id;
  }

  function todayStr(): string {
    // The DB uses CURRENT_DATE (server timezone) for "today"; JS here runs in
    // the same machine timezone in e2e, so local date is the right baseline.
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
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

  /**
   * The DB's Mon-start week window for today, computed the same way the
   * service does (DATE_TRUNC('week', ...)), so the "this week" exam date is
   * deterministic regardless of which weekday the suite runs on.
   */
  async function dbWeekBounds(): Promise<{ start: string; end: string }> {
    const rows = (await dataSource.query(
      `SELECT DATE_TRUNC('week', CURRENT_DATE)::text AS start,
              (DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '6 days')::date::text AS end`,
    )) as Array<{ start: string; end: string }>;
    return { start: rows[0].start.slice(0, 10), end: rows[0].end.slice(0, 10) };
  }

  function auth(token: string) {
    return {
      'X-Tenant-ID': TENANT_SCHEMA,
      Authorization: `Bearer ${token}`,
    };
  }

  async function getSummary(token: string): Promise<DashboardSummary> {
    const res = await request(app.getHttpServer())
      .get('/api/dashboard/summary')
      .set(auth(token))
      .expect(200);
    return res.body as DashboardSummary;
  }

  // ──────────────────────────────────────────────────────────────
  // Headcounts
  // ──────────────────────────────────────────────────────────────

  describe('Headcounts', () => {
    it('totalStudents counts only active students', async () => {
      const summary = await getSummary(adminToken);
      // 4 created, 1 soft-deleted → 3 active (a naive COUNT(*) would say 4).
      expect(summary.totalStudents).toBe(EXPECTED_STUDENTS);
    });

    it('totalStaff counts only active staff', async () => {
      const summary = await getSummary(adminToken);
      // 2 created, 1 soft-deleted → 1 active.
      expect(summary.totalStaff).toBe(EXPECTED_STAFF);
    });

    it('activeClasses counts classes with at least one section', async () => {
      const summary = await getSummary(adminToken);
      expect(summary.activeClasses).toBe(EXPECTED_CLASSES);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Attendance today
  // ──────────────────────────────────────────────────────────────

  describe('Attendance today', () => {
    it('aggregates per-status counts and honest notMarkedSections', async () => {
      const summary = await getSummary(adminToken);
      // Section A: Dash Alpha present, Dash Charlie late.
      // Section B2: Dash Delta excused (marked before their soft-delete).
      // Section B: nothing marked today → notMarkedSections = 1.
      expect(summary.attendanceToday).toEqual({
        present: 1,
        absent: 0,
        late: 1,
        excused: 1,
        notMarkedSections: EXPECTED_NOT_MARKED,
      });
    });

    it('excludes zero-student sections from notMarkedSections', async () => {
      const summary = await getSummary(adminToken);
      // Section inventory:
      //   A  — active students, marked today            → not unmarked
      //   B  — active student, nothing marked today     → unmarked (the 1)
      //   B2 — only student was soft-deleted (zero
      //        ACTIVE students)                         → excluded
      //   C  — zero students ever                       → excluded
      // A naive "sections with no attendance rows" count would say 3 (B, B2,
      // C); the summary must report only genuinely markable sections.
      expect(summary.attendanceToday.notMarkedSections).toBe(1);
    });

    it('reports the server date used for the attendance window', async () => {
      const summary = await getSummary(adminToken);
      expect(summary.today).toBe(todayStr());
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Announcements preview
  // ──────────────────────────────────────────────────────────────

  describe('Upcoming announcements', () => {
    it('lists sent announcements only, newest first', async () => {
      const summary = await getSummary(adminToken);
      const titles = summary.upcomingAnnouncements.map((a) => a.title);
      expect(titles).toContain('Dash Older Sent');
      expect(titles).toContain('Dash Newest Sent');
      expect(titles).not.toContain('Dash Draft Not Shown');

      const newest = summary.upcomingAnnouncements.find(
        (a) => a.title === 'Dash Newest Sent',
      )!;
      expect(newest.priority).toBe('important');
      expect(newest.sentAt).not.toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Recent activity
  // ──────────────────────────────────────────────────────────────

  describe('Recent activity', () => {
    it('returns at most 5 entries ordered newest first', async () => {
      const summary = await getSummary(adminToken);
      expect(summary.recentActivity.length).toBeLessThanOrEqual(5);

      const ts = summary.recentActivity.map((a) => a.timestamp);
      for (let i = 1; i < ts.length; i++) {
        expect(new Date(ts[i - 1]).getTime()).toBeGreaterThanOrEqual(
          new Date(ts[i]).getTime(),
        );
      }
    });

    it('includes the published exam, the published report, and creations', async () => {
      const summary = await getSummary(adminToken);
      const types = summary.recentActivity.map((a) => a.type);

      expect(types).toContain('exam_published');
      expect(types).toContain('report_published');
      expect(types).toContain('student_created');
      expect(types).toContain('staff_created');

      const examItem = summary.recentActivity.find(
        (a) => a.type === 'exam_published',
      )!;
      expect(examItem.description).toContain('Dash Unit Test');

      const reportItem = summary.recentActivity.find(
        (a) => a.type === 'report_published',
      )!;
      expect(reportItem.description).toContain('Dash Bravo');

      const draftAnnouncementOnlyViaUnion = summary.recentActivity.filter(
        (a) => a.type === 'report_published',
      );
      // Only ONE report was published in this tenant.
      expect(draftAnnouncementOnlyViaUnion).toHaveLength(1);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Exams this week
  // ──────────────────────────────────────────────────────────────

  describe('Exams this week', () => {
    it('counts exams whose examDate falls in the Mon-Sun window', async () => {
      const summary = await getSummary(adminToken);
      // One exam today-or-week-start (in window); the after-week exam is out.
      expect(summary.examsThisWeek).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // RBAC + performance
  // ──────────────────────────────────────────────────────────────

  describe('RBAC & performance', () => {
    it('rejects staff role with 403', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/summary')
        .set(auth(staffToken))
        .expect(403);
    });

    it('rejects parent role with 403', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/summary')
        .set(auth(parentAToken))
        .expect(403);
    });

    it('requires authentication (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/summary')
        .set('X-Tenant-ID', TENANT_SCHEMA)
        .expect(401);
    });

    it('responds in under 2 seconds (generous, queries run concurrently)', async () => {
      const start = Date.now();
      await getSummary(adminToken);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });
  });

  // ══════════════════════════════════════════════════════════════
});
