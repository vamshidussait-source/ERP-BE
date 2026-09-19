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

interface AnnouncementResponse {
  id: string;
  title: string;
  message: string;
  audienceType: string;
  audienceSectionIds: string[] | null;
  priority: string;
  status: string;
  scheduledFor: string | null;
  sentAt: string | null;
  createdAt: string;
  createdByStaffId: string | null;
  createdByStaffName?: string | null;
  isRead?: boolean;
}

interface AdminListItemResponse extends AnnouncementResponse {
  readCount: number;
  recipientCount: number;
}

interface AdminListResponse {
  data: AdminListItemResponse[];
  total: number;
  page: number;
  limit: number;
}

interface ErrorResponse {
  message: string | string[];
  statusCode: number;
}

describe('Announcements (e2e)', () => {
  const TENANT_SCHEMA = 'e2eannouncements';
  const TENANT_SUBDOMAIN = 'e2eannouncements';
  const SEED_PASSWORD = 'E2ePassw0rd!';
  const ADMIN_EMAIL = 'ann-admin@example.com';
  const STAFF_EMAIL = 'ann-staff@example.com';
  const PARENT_A_EMAIL = 'ann-parent-a@example.com';
  const PARENT_B_EMAIL = 'ann-parent-b@example.com';
  const STUDENT_A_EMAIL = 'ann-student-a@example.com';
  const STUDENT_B_EMAIL = 'ann-student-b@example.com';
  const PARENT_C_EMAIL = 'ann-parent-c@example.com';
  const PARENT_D_EMAIL = 'ann-parent-d@example.com';
  const PLATFORM_ADMIN_EMAIL = 'ann-e2e-platform@example.com';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let staffToken: string;
  let parentAToken: string;
  let parentBToken: string;
  let studentAToken: string;
  let studentBToken: string;
  let platformAdminToken: string;
  let sectionAId: string;
  let sectionBId: string;
  let studentAId: string;
  let studentBId: string;
  let parentAUserId: string;
  let parentBUserId: string;
  let studentAUserId: string;
  let unreadCountFixtureId: string;

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
    platformAdminToken = (adminLoginRes.body as { accessToken: string })
      .accessToken;

    // 2. Provision a fresh tenant (runs all tenant-schema migrations,
    //    including the new announcements tables).
    const provisionRes = await request(app.getHttpServer())
      .post('/api/admin/tenants/provision')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        name: 'E2E Announcements Test School',
        schemaName: TENANT_SCHEMA,
        subdomain: TENANT_SUBDOMAIN,
        planTier: 'premium',
      })
      .expect(201);
    const tenant = provisionRes.body as TenantResponse;
    expect(tenant.schemaName).toBe(TENANT_SCHEMA);

    // 3. Seed users: school_admin, staff, two parents, two students.
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO "${TENANT_SCHEMA}".users
         (email, "passwordHash", role, "isActive")
       VALUES
         ($1, $2, 'school_admin', true),
         ($3, $4, 'staff', true),
         ($5, $6, 'parent', true),
         ($7, $8, 'parent', true),
         ($9, $10, 'student', true),
         ($11, $12, 'student', true)`,
      [
        ADMIN_EMAIL, passwordHash,
        STAFF_EMAIL, passwordHash,
        PARENT_A_EMAIL, passwordHash,
        PARENT_B_EMAIL, passwordHash,
        STUDENT_A_EMAIL, passwordHash,
        STUDENT_B_EMAIL, passwordHash,
      ],
    );

    // Look up user IDs.
    const userRows = (await dataSource.query(
      `SELECT id, email FROM "${TENANT_SCHEMA}".users WHERE email = ANY($1)`,
      [
        [ADMIN_EMAIL, STAFF_EMAIL, PARENT_A_EMAIL, PARENT_B_EMAIL,
          STUDENT_A_EMAIL, STUDENT_B_EMAIL],
      ],
    )) as Array<{ id: string; email: string }>;
    const userMap = new Map(userRows.map((r) => [r.email, r.id]));
    parentAUserId = userMap.get(PARENT_A_EMAIL)!;
    parentBUserId = userMap.get(PARENT_B_EMAIL)!;
    studentAUserId = userMap.get(STUDENT_A_EMAIL)!;

    // 4. Log in as all users.
    adminToken = await login(ADMIN_EMAIL);
    staffToken = await login(STAFF_EMAIL);
    parentAToken = await login(PARENT_A_EMAIL);
    parentBToken = await login(PARENT_B_EMAIL);
    studentAToken = await login(STUDENT_A_EMAIL);
    studentBToken = await login(STUDENT_B_EMAIL);

    // 5. Create class with two sections.
    const classRes = await request(app.getHttpServer())
      .post('/api/classes')
      .set(auth(adminToken))
      .send({ name: 'Grade 10', displayOrder: 10 })
      .expect(201);
    const classId = (classRes.body as { id: string }).id;

    const sectionARes = await request(app.getHttpServer())
      .post(`/api/classes/${classId}/sections`)
      .set(auth(adminToken))
      .send({ name: 'A', capacity: 40 })
      .expect(201);
    sectionAId = (sectionARes.body as SectionResponse).id;

    const sectionBRes = await request(app.getHttpServer())
      .post(`/api/classes/${classId}/sections`)
      .set(auth(adminToken))
      .send({ name: 'B', capacity: 40 })
      .expect(201);
    sectionBId = (sectionBRes.body as SectionResponse).id;

    // 6. Create one student per section.
    const studentARes = await request(app.getHttpServer())
      .post('/api/students')
      .set(auth(adminToken))
      .send({
        firstName: 'Aarav',
        lastName: 'Sharma',
        dateOfBirth: '2010-05-15',
        admissionNumber: 'ADM-ANN-001',
        sectionId: sectionAId,
      })
      .expect(201);
    studentAId = (studentARes.body as StudentResponse).id;

    const studentBRes = await request(app.getHttpServer())
      .post('/api/students')
      .set(auth(adminToken))
      .send({
        firstName: 'Diya',
        lastName: 'Patel',
        dateOfBirth: '2010-08-20',
        admissionNumber: 'ADM-ANN-002',
        sectionId: sectionBId,
      })
      .expect(201);
    studentBId = (studentBRes.body as StudentResponse).id;

    // 7. Link parents to students.
    await request(app.getHttpServer())
      .post('/api/parent-links')
      .set(auth(adminToken))
      .send({ parentUserId: parentAUserId, studentId: studentAId })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/parent-links')
      .set(auth(adminToken))
      .send({ parentUserId: parentBUserId, studentId: studentBId })
      .expect(201);

    // Link student users to their own student records.
    await dataSource.query(
      `UPDATE "${TENANT_SCHEMA}".users SET "linkedStudentId" = $1 WHERE id = $2`,
      [studentAId, studentAUserId],
    );
    const studentBUserId = userMap.get(STUDENT_B_EMAIL)!;
    await dataSource.query(
      `UPDATE "${TENANT_SCHEMA}".users SET "linkedStudentId" = $1 WHERE id = $2`,
      [studentBId, studentBUserId],
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

  function feedIds(token: string): Promise<AnnouncementResponse[]> {
    return request(app.getHttpServer())
      .get('/api/announcements/me')
      .set(auth(token))
      .expect(200)
      .then((res) => res.body as AnnouncementResponse[]);
  }

  // ──────────────────────────────────────────────────────────────────
  // Creation + RBAC
  // ──────────────────────────────────────────────────────────────────

  describe('Creation & RBAC', () => {
    it('school_admin creates a draft announcement (201, status draft)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'Draft Announcement',
          message: 'This is a draft.',
          audienceType: 'all_parents',
        })
        .expect(201);

      const body = res.body as AnnouncementResponse;
      expect(body.id).toBeDefined();
      expect(body.status).toBe('draft');
      expect(body.priority).toBe('normal');
      expect(body.sentAt).toBeNull();
    });

    it('school_admin creates and sends immediately (status sent, sentAt set)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'Immediate Send',
          message: 'Sent at creation time.',
          audienceType: 'all_staff',
          status: 'sent',
        })
        .expect(201);

      const body = res.body as AnnouncementResponse;
      expect(body.status).toBe('sent');
      expect(body.sentAt).not.toBeNull();
    });

    it('school_admin creating a draft with scheduledFor marks it scheduled', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'Scheduled Announcement',
          message: 'Scheduled for later.',
          audienceType: 'all_students',
          scheduledFor: '2026-12-01T09:00:00.000Z',
        })
        .expect(201);

      const body = res.body as AnnouncementResponse;
      expect(body.status).toBe('scheduled');
      expect(body.scheduledFor).not.toBeNull();
    });

    it('rejects specific_sections with no section ids (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'Bad Sections',
          message: 'No sections given.',
          audienceType: 'specific_sections',
        })
        .expect(400);
      const body = res.body as ErrorResponse;
      expect(String(body.message)).toContain('audienceSectionIds');
    });

    it('rejects specific_sections with an unknown section id (404)', async () => {
      await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'Bad Sections',
          message: 'Unknown section.',
          audienceType: 'specific_sections',
          audienceSectionIds: ['00000000-0000-4000-8000-000000000009'],
        })
        .expect(404);
    });

    it('staff cannot create an announcement (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(staffToken))
        .send({
          title: 'Staff Attempt',
          message: 'Should not be allowed.',
          audienceType: 'all_parents',
        })
        .expect(403);
    });

    it('parent cannot create an announcement (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(parentAToken))
        .send({
          title: 'Parent Attempt',
          message: 'Should not be allowed.',
          audienceType: 'all_staff',
        })
        .expect(403);
    });

    it('student cannot create an announcement (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(studentAToken))
        .send({
          title: 'Student Attempt',
          message: 'Should not be allowed.',
          audienceType: 'all_students',
        })
        .expect(403);
    });

    it('non-admin roles cannot list announcements (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/announcements')
        .set(auth(staffToken))
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/announcements')
        .set(auth(parentAToken))
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/announcements')
        .set(auth(studentAToken))
        .expect(403);
    });

    it('non-admin roles cannot publish an announcement (403)', async () => {
      // Create a dedicated draft to attempt publishing against.
      const createRes = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'Publish Target',
          message: 'For publish RBAC checks.',
          audienceType: 'all_parents',
        })
        .expect(201);
      const draftId = (createRes.body as AnnouncementResponse).id;

      await request(app.getHttpServer())
        .post(`/api/announcements/${draftId}/publish`)
        .set(auth(staffToken))
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/announcements/${draftId}/publish`)
        .set(auth(parentAToken))
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/announcements/${draftId}/publish`)
        .set(auth(studentAToken))
        .expect(403);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Feed visibility + draft gating
  // ──────────────────────────────────────────────────────────────────

  describe('Feed visibility', () => {
    let draftId: string;
    let allParentsId: string;
    let allStudentsId: string;
    let allStaffId: string;
    let sectionAId_ann: string;

    beforeAll(async () => {
      // A draft that must NEVER appear in any non-admin feed.
      const draftRes = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E Draft — invisible',
          message: 'Must not appear in any feed.',
          audienceType: 'all_parents',
        })
        .expect(201);
      draftId = (draftRes.body as AnnouncementResponse).id;

      // Published: all_parents.
      const allParentsRes = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E All Parents',
          message: 'For every parent.',
          audienceType: 'all_parents',
          status: 'sent',
        })
        .expect(201);
      allParentsId = (allParentsRes.body as AnnouncementResponse).id;

      // Published: all_students.
      const allStudentsRes = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E All Students',
          message: 'For every student.',
          audienceType: 'all_students',
          status: 'sent',
        })
        .expect(201);
      allStudentsId = (allStudentsRes.body as AnnouncementResponse).id;

      // Published: all_staff.
      const allStaffRes = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E All Staff',
          message: 'For every staff member.',
          audienceType: 'all_staff',
          status: 'sent',
        })
        .expect(201);
      allStaffId = (allStaffRes.body as AnnouncementResponse).id;

      // Published: specific_sections [A].
      const sectionARes = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E Section A Only',
          message: 'Only for section A students and parents.',
          audienceType: 'specific_sections',
          audienceSectionIds: [sectionAId],
          status: 'sent',
        })
        .expect(201);
      sectionAId_ann = (sectionARes.body as AnnouncementResponse).id;
    });

    it('draft does not appear in any non-admin feed (staff, parent, student)', async () => {
      const staffFeed = await feedIds(staffToken);
      expect(staffFeed.map((a) => a.id)).not.toContain(draftId);

      const parentAFeed = await feedIds(parentAToken);
      expect(parentAFeed.map((a) => a.id)).not.toContain(draftId);

      const studentAFeed = await feedIds(studentAToken);
      expect(studentAFeed.map((a) => a.id)).not.toContain(draftId);
    });

    it('draft IS visible in the admin list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/announcements?status=drafts')
        .set(auth(adminToken))
        .expect(200);
      const body = res.body as AdminListResponse;
      expect(body.data.map((a) => a.id)).toContain(draftId);
    });

    it('all_parents announcement appears for parents only (not staff/students)', async () => {
      const parentAFeed = await feedIds(parentAToken);
      expect(parentAFeed.map((a) => a.id)).toContain(allParentsId);

      const parentBFeed = await feedIds(parentBToken);
      expect(parentBFeed.map((a) => a.id)).toContain(allParentsId);

      // Staff are not recipients of an all_parents announcement, so it must
      // not appear in their feed either (feed == stored recipients).
      const staffFeed = await feedIds(staffToken);
      expect(staffFeed.map((a) => a.id)).not.toContain(allParentsId);

      const studentAFeed = await feedIds(studentAToken);
      expect(studentAFeed.map((a) => a.id)).not.toContain(allParentsId);
    });

    it('all_students announcement appears for students, not parents', async () => {
      const studentAFeed = await feedIds(studentAToken);
      expect(studentAFeed.map((a) => a.id)).toContain(allStudentsId);

      const studentBFeed = await feedIds(studentBToken);
      expect(studentBFeed.map((a) => a.id)).toContain(allStudentsId);

      const parentAFeed = await feedIds(parentAToken);
      expect(parentAFeed.map((a) => a.id)).not.toContain(allStudentsId);
    });

    it('all_staff announcement appears for staff, not parents/students', async () => {
      const staffFeed = await feedIds(staffToken);
      expect(staffFeed.map((a) => a.id)).toContain(allStaffId);

      const parentAFeed = await feedIds(parentAToken);
      expect(parentAFeed.map((a) => a.id)).not.toContain(allStaffId);

      const studentAFeed = await feedIds(studentAToken);
      expect(studentAFeed.map((a) => a.id)).not.toContain(allStaffId);
    });

    it('specific_sections [A] appears only for section-A parent/student', async () => {
      const parentAFeed = await feedIds(parentAToken);
      expect(parentAFeed.map((a) => a.id)).toContain(sectionAId_ann);

      const studentAFeed = await feedIds(studentAToken);
      expect(studentAFeed.map((a) => a.id)).toContain(sectionAId_ann);

      // Staff are not recipients of a section-targeted announcement.
      const staffFeed = await feedIds(staffToken);
      expect(staffFeed.map((a) => a.id)).not.toContain(sectionAId_ann);

      // Section B users must NOT see it.
      const parentBFeed = await feedIds(parentBToken);
      expect(parentBFeed.map((a) => a.id)).not.toContain(sectionAId_ann);

      const studentBFeed = await feedIds(studentBToken);
      expect(studentBFeed.map((a) => a.id)).not.toContain(sectionAId_ann);
    });

    it('publishing the draft makes it appear in the audience feed', async () => {
      await request(app.getHttpServer())
        .post(`/api/announcements/${draftId}/publish`)
        .set(auth(adminToken))
        .expect(201);

      const parentAFeed = await feedIds(parentAToken);
      const published = parentAFeed.find((a) => a.id === draftId);
      expect(published).toBeDefined();

      // The draft was all_parents; staff are not recipients of it.
      const staffFeed = await feedIds(staffToken);
      expect(staffFeed.map((a) => a.id)).not.toContain(draftId);
    });

    it('feed is ordered newest first (sentAt descending)', async () => {
      const studentAFeed = await feedIds(studentAToken);
      expect(studentAFeed.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < studentAFeed.length; i++) {
        const prev = new Date(studentAFeed[i - 1].sentAt ?? studentAFeed[i - 1].createdAt).getTime();
        const curr = new Date(studentAFeed[i].sentAt ?? studentAFeed[i].createdAt).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });

    it('feed items carry an isRead flag (initially false)', async () => {
      const parentAFeed = await feedIds(parentAToken);
      expect(parentAFeed.length).toBeGreaterThan(0);
      for (const item of parentAFeed) {
        expect(typeof item.isRead).toBe('boolean');
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Read tracking
  // ──────────────────────────────────────────────────────────────────

  describe('Read tracking', () => {
    let allParentsId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E Read Tracking',
          message: 'Per-user read receipts.',
          audienceType: 'all_parents',
          status: 'sent',
        })
        .expect(201);
      allParentsId = (res.body as AnnouncementResponse).id;
    });

    it('marking read returns the receipt (200)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/announcements/${allParentsId}/read`)
        .set(auth(parentAToken))
        .expect(200);
      const body = res.body as { id: string; announcementId: string; readAt: string };
      expect(body.announcementId).toBe(allParentsId);
      expect(body.readAt).toBeDefined();
    });

    it('isRead is true only for the user who read it', async () => {
      const parentAFeed = await feedIds(parentAToken);
      const marked = parentAFeed.find((a) => a.id === allParentsId);
      expect(marked?.isRead).toBe(true);

      const parentBFeed = await feedIds(parentBToken);
      const unmarked = parentBFeed.find((a) => a.id === allParentsId);
      expect(unmarked?.isRead).toBe(false);
    });

    it('re-marking read is idempotent (still one receipt)', async () => {
      await request(app.getHttpServer())
        .post(`/api/announcements/${allParentsId}/read`)
        .set(auth(parentAToken))
        .expect(200);

      const readRows = (await dataSource.query(
        `SELECT COUNT(*)::int AS count FROM "${TENANT_SCHEMA}".announcement_reads
         WHERE "announcementId" = $1 AND "userId" = $2`,
        [allParentsId, parentAUserId],
      )) as Array<{ count: number }>;
      expect(readRows[0].count).toBe(1);
    });

    it('read stats show recipients vs. reads in the admin list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/announcements?status=sent')
        .set(auth(adminToken))
        .expect(200);
      const body = res.body as AdminListResponse;

      const item = body.data.find((a) => a.id === allParentsId);
      expect(item).toBeDefined();
      // Two active parents in the tenant.
      expect(item!.recipientCount).toBe(2);
      // Only parentA has read it so far.
      expect(item!.readCount).toBe(1);
    });

    it('mark-all-read marks every feed item for the user', async () => {
      const feedBefore = await feedIds(parentAToken);
      const unreadCount = feedBefore.filter((a) => !a.isRead).length;
      expect(unreadCount).toBeGreaterThan(0);

      const res = await request(app.getHttpServer())
        .post('/api/announcements/mark-all-read')
        .set(auth(parentAToken))
        .expect(200);
      const body = res.body as { marked: number };
      expect(body.marked).toBe(unreadCount);

      const feedAfter = await feedIds(parentAToken);
      for (const item of feedAfter) {
        expect(item.isRead).toBe(true);
      }
    });

    it('mark-all-read returns 0 when everything is already read', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/announcements/mark-all-read')
        .set(auth(parentAToken))
        .expect(200);
      const body = res.body as { marked: number };
      expect(body.marked).toBe(0);
    });

    it('cannot mark a draft announcement as read (404)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E Draft Read Target',
          message: 'Not sent yet.',
          audienceType: 'all_parents',
        })
        .expect(201);
      const draftId = (createRes.body as AnnouncementResponse).id;

      await request(app.getHttpServer())
        .post(`/api/announcements/${draftId}/read`)
        .set(auth(parentAToken))
        .expect(404);
    });

    it('marking read requires authentication (401)', async () => {
      await request(app.getHttpServer())
        .post(`/api/announcements/${allParentsId}/read`)
        .set('X-Tenant-ID', TENANT_SCHEMA)
        .expect(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Update / Delete lifecycle rules
  // ──────────────────────────────────────────────────────────────────

  describe('Update & Delete lifecycle', () => {
    let draftId: string;
    let sentId: string;

    beforeAll(async () => {
      const draftRes = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E Editable Draft',
          message: 'Can be edited and deleted.',
          audienceType: 'all_students',
        })
        .expect(201);
      draftId = (draftRes.body as AnnouncementResponse).id;

      const sentRes = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E Immutable Sent',
          message: 'Cannot be edited or deleted.',
          audienceType: 'all_students',
          status: 'sent',
        })
        .expect(201);
      sentId = (sentRes.body as AnnouncementResponse).id;
    });

    it('updates a draft announcement (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/announcements/${draftId}`)
        .set(auth(adminToken))
        .send({ title: 'E2E Edited Draft', priority: 'urgent' })
        .expect(200);
      const body = res.body as AnnouncementResponse;
      expect(body.title).toBe('E2E Edited Draft');
      expect(body.priority).toBe('urgent');
    });

    it('cannot edit a sent announcement (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/announcements/${sentId}`)
        .set(auth(adminToken))
        .send({ title: 'Should Fail' })
        .expect(403);
    });

    it('non-admin roles cannot update or delete (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/announcements/${draftId}`)
        .set(auth(staffToken))
        .send({ title: 'Nope' })
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/api/announcements/${draftId}`)
        .set(auth(parentAToken))
        .expect(403);
    });

    it('deletes a draft announcement (200)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/announcements/${draftId}`)
        .set(auth(adminToken))
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/announcements?status=all')
        .set(auth(adminToken))
        .expect(200);
      const body = res.body as AdminListResponse;
      expect(body.data.map((a) => a.id)).not.toContain(draftId);
    });

    it('cannot delete a sent announcement (403)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/announcements/${sentId}`)
        .set(auth(adminToken))
        .expect(403);
    });

    it('publish is idempotent for an already-sent announcement', async () => {
      const firstRes = await request(app.getHttpServer())
        .post(`/api/announcements/${sentId}/publish`)
        .set(auth(adminToken))
        .expect(201);
      const firstBody = firstRes.body as AnnouncementResponse;
      expect(firstBody.status).toBe('sent');

      const secondRes = await request(app.getHttpServer())
        .post(`/api/announcements/${sentId}/publish`)
        .set(auth(adminToken))
        .expect(201);
      const secondBody = secondRes.body as AnnouncementResponse;
      expect(secondBody.id).toBe(sentId);
      expect(new Date(secondBody.sentAt!).getTime()).toBe(
        new Date(firstBody.sentAt!).getTime(),
      );
    });

    it('returns 404 for an unknown announcement id', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .post(`/api/announcements/${fakeId}/publish`)
        .set(auth(adminToken))
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/announcements/${fakeId}/read`)
        .set(auth(parentAToken))
        .expect(404);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Recipient capture, audience enforcement & param validation
  // ──────────────────────────────────────────────────────────────────

  describe('Recipient capture & audience enforcement', () => {
    let allStaffSentId: string;

    it('school_admin is part of the all_staff audience and sees it in their feed', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E All Staff incl. admin',
          message: 'Staff and school_admin are recipients.',
          audienceType: 'all_staff',
          status: 'sent',
        })
        .expect(201);
      allStaffSentId = (res.body as AnnouncementResponse).id;

      const adminFeed = await feedIds(adminToken);
      expect(adminFeed.map((a) => a.id)).toContain(allStaffSentId);

      const listRes = await request(app.getHttpServer())
        .get('/api/announcements?status=sent')
        .set(auth(adminToken))
        .expect(200);
      const item = (listRes.body as AdminListResponse).data.find(
        (a) => a.id === allStaffSentId,
      );
      // school_admin + staff = 2 recipients captured at send time.
      expect(item!.recipientCount).toBe(2);
    });

    it('a non-recipient cannot mark an announcement as read (403)', async () => {
      // all_staff announcement — a student is not a recipient.
      await request(app.getHttpServer())
        .post(`/api/announcements/${allStaffSentId}/read`)
        .set(auth(studentAToken))
        .expect(403);

      // all_students announcement — a parent is not a recipient.
      const res = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E Students Only Read Guard',
          message: 'Students only.',
          audienceType: 'all_students',
          status: 'sent',
        })
        .expect(201);
      const studentsId = (res.body as AnnouncementResponse).id;

      await request(app.getHttpServer())
        .post(`/api/announcements/${studentsId}/read`)
        .set(auth(parentAToken))
        .expect(403);
    });

    it('read stats use the recipient list captured at send time (no drift)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E Frozen Recipients',
          message: 'Audience frozen at send time.',
          audienceType: 'all_parents',
          status: 'sent',
        })
        .expect(201);
      const frozenId = (res.body as AnnouncementResponse).id;

      const findItem = async () => {
        const listRes = await request(app.getHttpServer())
          .get('/api/announcements?status=sent')
          .set(auth(adminToken))
          .expect(200);
        return (listRes.body as AdminListResponse).data.find(
          (a) => a.id === frozenId,
        );
      };

      // Captured at send time: both active parents.
      expect((await findItem())!.recipientCount).toBe(2);

      // Deactivating a targeted user must NOT change the captured count.
      await dataSource.query(
        `UPDATE "${TENANT_SCHEMA}".users SET "isActive" = false WHERE id = $1`,
        [parentBUserId],
      );
      expect((await findItem())!.recipientCount).toBe(2);

      // A brand-new parent added afterwards must NOT be counted either.
      const newParentHash = await bcrypt.hash(SEED_PASSWORD, 10);
      await dataSource.query(
        `INSERT INTO "${TENANT_SCHEMA}".users
           (email, "passwordHash", role, "isActive")
         VALUES ($1, $2, 'parent', true)`,
        [PARENT_C_EMAIL, newParentHash],
      );
      expect((await findItem())!.recipientCount).toBe(2);

      // Restore parentB for anything that follows.
      await dataSource.query(
        `UPDATE "${TENANT_SCHEMA}".users SET "isActive" = true WHERE id = $1`,
        [parentBUserId],
      );
    });

    it('updating a draft to specific_sections with an empty array is rejected (400)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E Audience Switch',
          message: 'Switching audience.',
          audienceType: 'all_students',
        })
        .expect(201);
      const draftId = (createRes.body as AnnouncementResponse).id;

      await request(app.getHttpServer())
        .patch(`/api/announcements/${draftId}`)
        .set(auth(adminToken))
        .send({ audienceType: 'specific_sections', audienceSectionIds: [] })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/api/announcements/${draftId}`)
        .set(auth(adminToken))
        .send({ audienceType: 'specific_sections' })
        .expect(400);

      // A valid switch still works and persists the sections.
      const okRes = await request(app.getHttpServer())
        .patch(`/api/announcements/${draftId}`)
        .set(auth(adminToken))
        .send({ audienceType: 'specific_sections', audienceSectionIds: [sectionAId] })
        .expect(200);
      const okBody = okRes.body as AnnouncementResponse;
      expect(okBody.audienceType).toBe('specific_sections');
      expect(okBody.audienceSectionIds).toEqual([sectionAId]);

      // Switching back away clears stale section ids.
      const clearedRes = await request(app.getHttpServer())
        .patch(`/api/announcements/${draftId}`)
        .set(auth(adminToken))
        .send({ audienceType: 'all_students' })
        .expect(200);
      expect((clearedRes.body as AnnouncementResponse).audienceSectionIds).toBeNull();
    });

    it('non-UUID ids return 400 (not 500) on every :id route', async () => {
      const bad = 'not-a-uuid';
      await request(app.getHttpServer())
        .post(`/api/announcements/${bad}/publish`)
        .set(auth(adminToken))
        .expect(400);
      await request(app.getHttpServer())
        .post(`/api/announcements/${bad}/read`)
        .set(auth(parentAToken))
        .expect(400);
      await request(app.getHttpServer())
        .patch(`/api/announcements/${bad}`)
        .set(auth(adminToken))
        .send({ title: 'x' })
        .expect(400);
      await request(app.getHttpServer())
        .delete(`/api/announcements/${bad}`)
        .set(auth(adminToken))
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Feed/read consistency & recipient-scoped mark-all-read
  // ──────────────────────────────────────────────────────────────────

  describe('Feed/read consistency & recipient-scoped mark-all-read', () => {
    it('switching audienceType away from specific_sections nulls audienceSectionIds (verified via GET)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E Section Clear Draft',
          message: 'Was section-targeted, then re-targeted.',
          audienceType: 'specific_sections',
          audienceSectionIds: [sectionAId],
        })
        .expect(201);
      const id = (createRes.body as AnnouncementResponse).id;

      const findItem = async () => {
        const res = await request(app.getHttpServer())
          .get('/api/announcements?status=all&limit=100')
          .set(auth(adminToken))
          .expect(200);
        return (res.body as AdminListResponse).data.find((a) => a.id === id);
      };

      // Stored section ids are present while it is still specific_sections.
      expect((await findItem())!.audienceSectionIds).toEqual([sectionAId]);

      await request(app.getHttpServer())
        .patch(`/api/announcements/${id}`)
        .set(auth(adminToken))
        .send({ audienceType: 'all_parents' })
        .expect(200);

      // Verified via a follow-up GET, not just the PATCH response.
      const after = await findItem();
      expect(after!.audienceType).toBe('all_parents');
      expect(after!.audienceSectionIds).toBeNull();
    });

    it('markAllRead skips announcements the caller is not a stored recipient of', async () => {
      // P1 is sent while parentD does not exist yet, so parentD is not a
      // recipient of it. (Existing parents ARE recipients.)
      const p1Res = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E Non-recipient Mark All',
          message: 'parentD is not a recipient.',
          audienceType: 'all_parents',
          status: 'sent',
        })
        .expect(201);
      const p1Id = (p1Res.body as AnnouncementResponse).id;

      // Add a parent AFTER the send — a feed-visible role, but never targeted.
      const hash = await bcrypt.hash(SEED_PASSWORD, 10);
      await dataSource.query(
        `INSERT INTO "${TENANT_SCHEMA}".users
           (email, "passwordHash", role, "isActive")
         VALUES ($1, $2, 'parent', true)
         ON CONFLICT (email) DO NOTHING`,
        [PARENT_D_EMAIL, hash],
      );
      const dRows = (await dataSource.query(
        `SELECT id FROM "${TENANT_SCHEMA}".users WHERE email = $1`,
        [PARENT_D_EMAIL],
      )) as Array<{ id: string }>;
      const parentDUserId = dRows[0].id;
      const parentDToken = await login(PARENT_D_EMAIL);

      // parentD's feed must NOT include an announcement they weren't targeted by,
      // even though their role (parent) matches the announcement's audience.
      const feed = await feedIds(parentDToken);
      expect(feed.map((a) => a.id)).not.toContain(p1Id);

      // mark-all-read is a no-op for parentD and writes no read receipt for P1.
      const res = await request(app.getHttpServer())
        .post('/api/announcements/mark-all-read')
        .set(auth(parentDToken))
        .expect(200);
      expect((res.body as { marked: number }).marked).toBe(0);

      const dReads = (await dataSource.query(
        `SELECT COUNT(*)::int AS count FROM "${TENANT_SCHEMA}".announcement_reads
         WHERE "announcementId" = $1 AND "userId" = $2`,
        [p1Id, parentDUserId],
      )) as Array<{ count: number }>;
      expect(dReads[0].count).toBe(0);

      // A real recipient (parentA) DOES mark it via mark-all-read.
      await request(app.getHttpServer())
        .post('/api/announcements/mark-all-read')
        .set(auth(parentAToken))
        .expect(200);
      const aReads = (await dataSource.query(
        `SELECT COUNT(*)::int AS count FROM "${TENANT_SCHEMA}".announcement_reads
         WHERE "announcementId" = $1 AND "userId" = $2`,
        [p1Id, parentAUserId],
      )) as Array<{ count: number }>;
      expect(aReads[0].count).toBe(1);
    });
  });
  // ──────────────────────────────────────────────────────────────────
  // Unread count endpoint (GET /announcements/unread-count)
  // ──────────────────────────────────────────────────────────────────

  describe('Unread count endpoint', () => {
    // Fresh parent with no reads yet, so unread-count math is exact.
    const PARENT_E_EMAIL = 'ann-parent-e@example.com';
    let parentEToken: string;

    beforeAll(async () => {
      // Seed parentE (no parent links → not a recipient of anything
      // section-targeted, but IS a recipient of all_parents sends).
      const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
      await dataSource.query(
        `INSERT INTO "${TENANT_SCHEMA}".users
           (email, "passwordHash", role, "isActive")
         VALUES ($1, $2, 'parent', true)`,
        [PARENT_E_EMAIL, passwordHash],
      );
      parentEToken = await login(PARENT_E_EMAIL);

      // A dedicated all_parents announcement so this block owns its own
      // fixture and does not depend on counts mutated by earlier blocks.
      const res = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E Unread Count Fixture',
          message: 'Own fixture for unread-count tests.',
          audienceType: 'all_parents',
          status: 'sent',
        })
        .expect(201);
      unreadCountFixtureId = (res.body as AnnouncementResponse).id;
    });

    it('a user with 3 unread + 2 read stored recipient announcements gets { count: 3 }', async () => {
      // Arrange: two MORE all_parents sends (parentE is a stored
      // recipient of each). Together with the fixture that makes 3
      // unread; parentE then reads 2 of them.
      const extraIds: string[] = [];
      for (let i = 0; i < 2; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/announcements')
          .set(auth(adminToken))
          .send({
            title: `E2E Unread Extra ${i + 1}`,
            message: 'Counted while unread.',
            audienceType: 'all_parents',
            status: 'sent',
          })
          .expect(201);
        extraIds.push((res.body as AnnouncementResponse).id);
      }

      // parentE has 3 unread at this point (fixture + 2 extras).
      const before = await request(app.getHttpServer())
        .get('/api/announcements/unread-count')
        .set(auth(parentEToken))
        .expect(200)
        .then((res) => (res.body as { count: number }).count);
      expect(before).toBe(3);

      // Read two of the three.
      await request(app.getHttpServer())
        .post(`/api/announcements/${extraIds[0]}/read`)
        .set(auth(parentEToken))
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/announcements/${extraIds[1]}/read`)
        .set(auth(parentEToken))
        .expect(200);

      const after = await request(app.getHttpServer())
        .get('/api/announcements/unread-count')
        .set(auth(parentEToken))
        .expect(200)
        .then((res) => (res.body as { count: number }).count);
      expect(after).toBe(3 - 2);
    });

    it('marking one as read decrements the count on a subsequent call', async () => {
      const countBefore = await request(app.getHttpServer())
        .get('/api/announcements/unread-count')
        .set(auth(parentEToken))
        .expect(200)
        .then((res) => (res.body as { count: number }).count);
      expect(countBefore).toBe(1); // only the fixture remains unread

      await request(app.getHttpServer())
        .post(`/api/announcements/${unreadCountFixtureId}/read`)
        .set(auth(parentEToken))
        .expect(200);

      const countAfter = await request(app.getHttpServer())
        .get('/api/announcements/unread-count')
        .set(auth(parentEToken))
        .expect(200)
        .then((res) => (res.body as { count: number }).count);
      expect(countAfter).toBe(countBefore - 1);
    });

    it('a user with zero announcements gets { count: 0 }', async () => {
      // parentE has read everything; their count is now 0.
      const res = await request(app.getHttpServer())
        .get('/api/announcements/unread-count')
        .set(auth(parentEToken))
        .expect(200);
      expect((res.body as { count: number }).count).toBe(0);

      // Also true for a user with NO feed rows at all: a brand-new staff
      // user targeted by nothing sent yet.
      const STAFF_NO_FEED_EMAIL = 'ann-staff-nofeed@example.com';
      const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
      await dataSource.query(
        `INSERT INTO "${TENANT_SCHEMA}".users
           (email, "passwordHash", role, "isActive")
         VALUES ($1, $2, 'staff', true)`,
        [STAFF_NO_FEED_EMAIL, passwordHash],
      );
      const noFeedToken = await login(STAFF_NO_FEED_EMAIL);
      const emptyRes = await request(app.getHttpServer())
        .get('/api/announcements/unread-count')
        .set(auth(noFeedToken))
        .expect(200);
      expect((emptyRes.body as { count: number }).count).toBe(0);
    });

    it('count agrees with counting unread items client-side from GET /announcements/me', async () => {
      // Fresh user + fresh sends so both numbers are exact and equal.
      const PARENT_F_EMAIL = 'ann-parent-f@example.com';
      const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
      await dataSource.query(
        `INSERT INTO "${TENANT_SCHEMA}".users
           (email, "passwordHash", role, "isActive")
         VALUES ($1, $2, 'parent', true)`,
        [PARENT_F_EMAIL, passwordHash],
      );
      const parentFToken = await login(PARENT_F_EMAIL);

      // Two all_parents sends → parentF is a stored recipient of both.
      for (let i = 0; i < 2; i++) {
        await request(app.getHttpServer())
          .post('/api/announcements')
          .set(auth(adminToken))
          .send({
            title: `E2E Consistency ${i + 1}`,
            message: 'Badge vs feed agreement.',
            audienceType: 'all_parents',
            status: 'sent',
          })
          .expect(201);
      }

      const [countRes, feedRes] = await Promise.all([
        request(app.getHttpServer())
          .get('/api/announcements/unread-count')
          .set(auth(parentFToken))
          .expect(200),
        request(app.getHttpServer())
          .get('/api/announcements/me')
          .set(auth(parentFToken))
          .expect(200),
      ]);

      const apiCount = (countRes.body as { count: number }).count;
      const clientSideCount = (
        feedRes.body as Array<{ isRead: boolean }>
      ).filter((a) => !a.isRead).length;

      // The badge must never disagree with the feed list.
      expect(apiCount).toBe(clientSideCount);
      expect(apiCount).toBe(2);
    });

    it('unread-count requires authentication (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/announcements/unread-count')
        .set('X-Tenant-ID', TENANT_SCHEMA)
        .expect(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Read stats endpoint (GET /announcements/:id/read-stats)
  // ──────────────────────────────────────────────────────────────────

  describe('Read stats endpoint', () => {
    let statsFixtureId: string;

    beforeAll(async () => {
      // Own fixture: specific_sections [A] → recipients are exactly parentA
      // and studentA's user (2), independent of parents/staff created by
      // earlier blocks (they have no section-A links).
      const res = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E Read Stats Fixture',
          message: 'Known recipient/read counts.',
          audienceType: 'specific_sections',
          audienceSectionIds: [sectionAId],
          status: 'sent',
        })
        .expect(201);
      statsFixtureId = (res.body as AnnouncementResponse).id;

      // Exactly one of the two recipients reads it.
      await request(app.getHttpServer())
        .post(`/api/announcements/${statsFixtureId}/read`)
        .set(auth(parentAToken))
        .expect(200);
    });

    it('returns counts matching GET /announcements inline computation', async () => {
      const [statsRes, listRes] = await Promise.all([
        request(app.getHttpServer())
          .get(`/api/announcements/${statsFixtureId}/read-stats`)
          .set(auth(adminToken))
          .expect(200),
        request(app.getHttpServer())
          .get('/api/announcements?status=all&limit=100')
          .set(auth(adminToken))
          .expect(200),
      ]);

      const stats = statsRes.body as { recipientCount: number; readCount: number };
      // Both active parents were captured at send time.
      expect(stats.recipientCount).toBe(2);
      // Only parentA has read it.
      expect(stats.readCount).toBe(1);

      // Both endpoints must agree — they count the same thing two ways.
      const listItem = (listRes.body as AdminListResponse).data.find(
        (a) => a.id === statsFixtureId,
      );
      expect(listItem).toBeDefined();
      expect(stats.recipientCount).toBe(listItem!.recipientCount);
      expect(stats.readCount).toBe(listItem!.readCount);
    });

    it('returns 404 for a non-existent announcement id', async () => {
      await request(app.getHttpServer())
        .get('/api/announcements/00000000-0000-4000-8000-000000000000/read-stats')
        .set(auth(adminToken))
        .expect(404);
    });

    it('rejects a non-UUID id (400) and non-admin roles (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/announcements/not-a-uuid/read-stats')
        .set(auth(adminToken))
        .expect(400);
      await request(app.getHttpServer())
        .get(`/api/announcements/${statsFixtureId}/read-stats`)
        .set(auth(staffToken))
        .expect(403);
      await request(app.getHttpServer())
        .get(`/api/announcements/${statsFixtureId}/read-stats`)
        .set(auth(parentAToken))
        .expect(403);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Feed author-name enrichment (createdByStaffName)
  // ──────────────────────────────────────────────────────────────

  describe('Feed author-name enrichment', () => {
    it('feed items for a staff-authored announcement show the concatenated author name', async () => {
      // Create a known staff member via the API (requires school_admin).
      const staffRes = await request(app.getHttpServer())
        .post('/api/staff')
        .set(auth(adminToken))
        .send({
          firstName: 'Amara',
          lastName: 'Osei',
          email: 'ann-author-amara.osei@example.com',
          designation: 'Head of Mathematics',
          employeeId: 'EMP-ANN-AUTHOR-1',
        })
        .expect(201);
      const authorStaffId = (staffRes.body as { id: string }).id;

      // Admin authors an announcement attributed to that staff member.
      const annRes = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E Authored Announcement',
          message: 'Authored by a known staff member.',
          audienceType: 'all_staff',
          status: 'sent',
          createdByStaffId: authorStaffId,
        })
        .expect(201);
      const announcementId = (annRes.body as AnnouncementResponse).id;

      // A staff user is a recipient of an all_staff announcement.
      const feed = await feedIds(staffToken);
      const item = feed.find((a) => a.id === announcementId);
      expect(item).toBeDefined();
      expect(item!.createdByStaffId).toBe(authorStaffId);
      expect(item!.createdByStaffName).toBe('Amara Osei');
    });

    it('feed items with no createdByStaffId return createdByStaffName: null', async () => {
      const annRes = await request(app.getHttpServer())
        .post('/api/announcements')
        .set(auth(adminToken))
        .send({
          title: 'E2E Anonymous Announcement',
          message: 'No author attributed.',
          audienceType: 'all_staff',
          status: 'sent',
        })
        .expect(201);
      const announcementId = (annRes.body as AnnouncementResponse).id;

      const feed = await feedIds(staffToken);
      const item = feed.find((a) => a.id === announcementId);
      expect(item).toBeDefined();
      expect(item!.createdByStaffId).toBeNull();
      expect(item!.createdByStaffName).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
});
