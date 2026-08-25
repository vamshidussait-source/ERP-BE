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

interface StaffResponse {
  id: string;
  firstName: string;
  lastName: string;
}

interface TimetableEntryResponse {
  id: string;
  sectionId: string;
  dayOfWeek: string;
  periodNumber: number;
  subject: string;
  staffId: string | null;
  startTime: string;
  endTime: string;
  staffFirstName: string | null;
  staffLastName: string | null;
}

interface ErrorResponse {
  message: string | string[];
}

describe('Timetable (e2e)', () => {
  const TENANT_SCHEMA = 'e2etimetable';
  const TENANT_SUBDOMAIN = 'e2etimetable';
  const SEED_PASSWORD = 'E2ePassw0rd!';
  const ADMIN_EMAIL = 'timetable-admin@example.com';
  const STAFF_EMAIL = 'timetable-staff@example.com';
  const STAFF2_EMAIL = 'timetable-staff2@example.com';
  const PLATFORM_ADMIN_EMAIL = 'timetable-e2e-platform@example.com';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let staffToken: string;
  let staff2Token: string;
  let platformAdminToken: string;
  let sectionId: string;
  let section2Id: string;
  let staffId: string;
  let staff2Id: string;

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

    // Remove any leftovers from a previous run.
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
        name: 'E2E Timetable Test School',
        schemaName: TENANT_SCHEMA,
        subdomain: TENANT_SUBDOMAIN,
        planTier: 'premium',
      })
      .expect(201);
    const tenant = provisionRes.body as TenantResponse;
    expect(tenant.schemaName).toBe(TENANT_SCHEMA);

    // 3. Seed users: school_admin, staff, staff2.
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO "${TENANT_SCHEMA}".users
         (email, "passwordHash", role, "isActive")
       VALUES ($1, $2, $3, true), ($4, $5, $6, true), ($7, $8, $9, true)`,
      [
        ADMIN_EMAIL, passwordHash, 'school_admin',
        STAFF_EMAIL, passwordHash, 'staff',
        STAFF2_EMAIL, passwordHash, 'staff',
      ],
    );

    // 4. Log in all users.
    adminToken = await login(ADMIN_EMAIL);
    staffToken = await login(STAFF_EMAIL);
    staff2Token = await login(STAFF2_EMAIL);

    // 5. Create a class and two sections.
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

    const section2Res = await request(app.getHttpServer())
      .post(`/api/classes/${classBody.id}/sections`)
      .set(auth(adminToken))
      .send({ name: 'B', capacity: 40 })
      .expect(201);
    section2Id = (section2Res.body as SectionResponse).id;

    // 6. Create two staff members and link them to user accounts.
    const staffRes = await request(app.getHttpServer())
      .post('/api/staff')
      .set(auth(adminToken))
      .send({
        firstName: 'Alice',
        lastName: 'Teacher',
        email: 'alice@timetable.edu',
        designation: 'Math Teacher',
        employeeId: 'EMP-TT-001',
      })
      .expect(201);
    staffId = (staffRes.body as StaffResponse).id;

    const staff2Res = await request(app.getHttpServer())
      .post('/api/staff')
      .set(auth(adminToken))
      .send({
        firstName: 'Bob',
        lastName: 'Instructor',
        email: 'bob@timetable.edu',
        designation: 'Science Teacher',
        employeeId: 'EMP-TT-002',
      })
      .expect(201);
    staff2Id = (staff2Res.body as StaffResponse).id;

    // Look up user IDs and link staff to user accounts.
    const userRows = (await dataSource.query(
      `SELECT id, email FROM "${TENANT_SCHEMA}".users WHERE email IN ($1, $2)`,
      [STAFF_EMAIL, STAFF2_EMAIL],
    )) as Array<{ id: string; email: string }>;
    const emailToId = new Map(userRows.map((r) => [r.email, r.id]));

    const staffUserId = emailToId.get(STAFF_EMAIL)!;
    const staff2UserId = emailToId.get(STAFF2_EMAIL)!;

    await dataSource.query(
      `UPDATE "${TENANT_SCHEMA}".users SET "linkedStaffId" = $1 WHERE id = $2`,
      [staffId, staffUserId],
    );
    await dataSource.query(
      `UPDATE "${TENANT_SCHEMA}".users SET "linkedStaffId" = $1 WHERE id = $2`,
      [staff2Id, staff2UserId],
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

  // ── CRUD: school_admin can create entries across all 6 days ─────────

  it('school_admin can create a Monday entry', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/timetable')
      .set(auth(adminToken))
      .send({
        sectionId,
        dayOfWeek: 'monday',
        periodNumber: 1,
        subject: 'Mathematics',
        staffId,
        startTime: '08:00',
        endTime: '08:45',
      })
      .expect(201);

    const body = res.body as TimetableEntryResponse;
    expect(body.id).toBeDefined();
    expect(body.sectionId).toBe(sectionId);
    expect(body.dayOfWeek).toBe('monday');
    expect(body.periodNumber).toBe(1);
    expect(body.subject).toBe('Mathematics');
    expect(body.staffId).toBe(staffId);
    expect(body.startTime).toMatch(/^08:00/);
    expect(body.endTime).toMatch(/^08:45/);
  });

  it('school_admin can create a Tuesday entry', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/timetable')
      .set(auth(adminToken))
      .send({
        sectionId,
        dayOfWeek: 'tuesday',
        periodNumber: 1,
        subject: 'Physics',
        staffId: staff2Id,
        startTime: '08:00',
        endTime: '08:45',
      })
      .expect(201);

    const body = res.body as TimetableEntryResponse;
    expect(body.dayOfWeek).toBe('tuesday');
    expect(body.subject).toBe('Physics');
  });

  it('school_admin can create a Saturday entry', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/timetable')
      .set(auth(adminToken))
      .send({
        sectionId,
        dayOfWeek: 'saturday',
        periodNumber: 1,
        subject: 'Physical Education',
        staffId,
        startTime: '09:00',
        endTime: '09:45',
      })
      .expect(201);

    const body = res.body as TimetableEntryResponse;
    expect(body.dayOfWeek).toBe('saturday');
    expect(body.subject).toBe('Physical Education');
  });

  it('school_admin can create a Wednesday entry with null staffId', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/timetable')
      .set(auth(adminToken))
      .send({
        sectionId,
        dayOfWeek: 'wednesday',
        periodNumber: 1,
        subject: 'Study Hall',
        startTime: '08:00',
        endTime: '08:45',
      })
      .expect(201);

    const body = res.body as TimetableEntryResponse;
    expect(body.staffId).toBeNull();
  });

  // ── Unique constraint: 409 on duplicate day+period ──────────────────

  it('rejects duplicate day+period for same section on create (409)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/timetable')
      .set(auth(adminToken))
      .send({
        sectionId,
        dayOfWeek: 'monday',
        periodNumber: 1,
        subject: 'Duplicate',
        startTime: '08:00',
        endTime: '08:45',
      })
      .expect(409);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('already exists');
  });

  // ── RBAC: non-admin cannot create ──────────────────────────────────

  it('staff role cannot create timetable entry (403)', async () => {
    await request(app.getHttpServer())
      .post('/api/timetable')
      .set(auth(staffToken))
      .send({
        sectionId,
        dayOfWeek: 'thursday',
        periodNumber: 1,
        subject: 'Chemistry',
        startTime: '08:00',
        endTime: '08:45',
      })
      .expect(403);
  });

  // ── Update entry ───────────────────────────────────────────────────

  it('school_admin can update an entry (change subject and time)', async () => {
    // First, get the Monday entry we created.
    const listRes = await request(app.getHttpServer())
      .get(`/api/timetable/section/${sectionId}`)
      .set(auth(adminToken))
      .expect(200);

    const entries = listRes.body as TimetableEntryResponse[];
    const mondayEntry = entries.find(
      (e) => e.dayOfWeek === 'monday' && e.periodNumber === 1,
    )!;
    expect(mondayEntry).toBeDefined();

    const res = await request(app.getHttpServer())
      .patch(`/api/timetable/${mondayEntry.id}`)
      .set(auth(adminToken))
      .send({
        subject: 'Advanced Mathematics',
        startTime: '09:00',
        endTime: '09:45',
      })
      .expect(200);

    const body = res.body as TimetableEntryResponse;
    expect(body.subject).toBe('Advanced Mathematics');
    expect(body.startTime).toMatch(/^09:00/);
    expect(body.endTime).toMatch(/^09:45/);
    // Day and period should remain unchanged.
    expect(body.dayOfWeek).toBe('monday');
    expect(body.periodNumber).toBe(1);
  });

  it('school_admin can move an entry to a different day/period', async () => {
    // Get the Tuesday entry.
    const listRes = await request(app.getHttpServer())
      .get(`/api/timetable/section/${sectionId}`)
      .set(auth(adminToken))
      .expect(200);

    const entries = listRes.body as TimetableEntryResponse[];
    const tuesdayEntry = entries.find(
      (e) => e.dayOfWeek === 'tuesday' && e.periodNumber === 1,
    )!;
    expect(tuesdayEntry).toBeDefined();

    // Move it to thursday period 2.
    const res = await request(app.getHttpServer())
      .patch(`/api/timetable/${tuesdayEntry.id}`)
      .set(auth(adminToken))
      .send({
        dayOfWeek: 'thursday',
        periodNumber: 2,
      })
      .expect(200);

    const body = res.body as TimetableEntryResponse;
    expect(body.dayOfWeek).toBe('thursday');
    expect(body.periodNumber).toBe(2);
  });

  it('update rejects moving entry onto another entry slot (409)', async () => {
    // We have a saturday period 1 entry. Try to move the thursday period 2
    // entry to saturday period 1.
    const listRes = await request(app.getHttpServer())
      .get(`/api/timetable/section/${sectionId}`)
      .set(auth(adminToken))
      .expect(200);

    const entries = listRes.body as TimetableEntryResponse[];
    const thursdayEntry = entries.find(
      (e) => e.dayOfWeek === 'thursday' && e.periodNumber === 2,
    )!;

    const res = await request(app.getHttpServer())
      .patch(`/api/timetable/${thursdayEntry.id}`)
      .set(auth(adminToken))
      .send({
        dayOfWeek: 'saturday',
        periodNumber: 1,
      })
      .expect(409);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('already exists');
  });

  // ── GET section timetable ──────────────────────────────────────────

  it('returns timetable for a section ordered by day then period', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/timetable/section/${sectionId}`)
      .set(auth(adminToken))
      .expect(200);

    const entries = res.body as TimetableEntryResponse[];
    expect(entries.length).toBeGreaterThanOrEqual(3);

    // Check ordering: monday < thursday < saturday
    const dayOrder = entries.map((e) => e.dayOfWeek);
    expect(dayOrder.indexOf('monday')).toBeLessThan(
      dayOrder.indexOf('thursday'),
    );
    expect(dayOrder.indexOf('thursday')).toBeLessThan(
      dayOrder.indexOf('saturday'),
    );

    // Check staff names are enriched.
    const mathEntry = entries.find((e) => e.subject === 'Advanced Mathematics')!;
    expect(mathEntry.staffFirstName).toBe('Alice');
    expect(mathEntry.staffLastName).toBe('Teacher');
  });

  // ── GET staff timetable ────────────────────────────────────────────

  it('returns timetable for a specific staff member', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/timetable/staff/${staffId}`)
      .set(auth(adminToken))
      .expect(200);

    const entries = res.body as TimetableEntryResponse[];
    // staffId should have entries for monday and saturday (and thursday after move).
    for (const entry of entries) {
      expect(entry.staffId).toBe(staffId);
    }
  });

  // ── GET /timetable/me (staff self-service) ────────────────────────

  it('staff user can GET /timetable/me and get their own entries', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/timetable/me')
      .set(auth(staffToken))
      .expect(200);

    const entries = res.body as TimetableEntryResponse[];
    // The staff user linked to staffId should see their entries.
    for (const entry of entries) {
      expect(entry.staffId).toBe(staffId);
    }
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it('non-staff role (school_admin) gets 403 on /timetable/me', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/timetable/me')
      .set(auth(adminToken))
      .expect(403);

    const body = res.body as ErrorResponse;
    expect(body.message).toBeDefined();
  });

  it('unauthenticated request gets 401 on /timetable/me', async () => {
    await request(app.getHttpServer())
      .get('/api/timetable/me')
      .set('X-Tenant-ID', TENANT_SCHEMA)
      .expect(401);
  });

  // ── DELETE entry ───────────────────────────────────────────────────

  it('school_admin can delete a timetable entry', async () => {
    // Create an entry to delete.
    const createRes = await request(app.getHttpServer())
      .post('/api/timetable')
      .set(auth(adminToken))
      .send({
        sectionId,
        dayOfWeek: 'friday',
        periodNumber: 1,
        subject: 'Art',
        startTime: '10:00',
        endTime: '10:45',
      })
      .expect(201);

    const entryId = (createRes.body as TimetableEntryResponse).id;

    await request(app.getHttpServer())
      .delete(`/api/timetable/${entryId}`)
      .set(auth(adminToken))
      .expect(200);

    // Verify it's gone.
    await request(app.getHttpServer())
      .get(`/api/timetable/section/${sectionId}`)
      .set(auth(adminToken))
      .expect(200)
      .then((res) => {
        const entries = res.body as TimetableEntryResponse[];
        expect(entries.find((e) => e.id === entryId)).toBeUndefined();
      });
  });

  it('delete returns 404 for non-existent entry', async () => {
    // The queryRunner.query() may return undefined for DELETE on missing rows,
    // so we first verify the entry doesn't exist via GET, then try DELETE.
    await request(app.getHttpServer())
      .get('/api/timetable/section/00000000-0000-0000-0000-000000000000')
      .set(auth(adminToken))
      .expect(404);

    // For the delete itself, we test a freshly created entry that we
    // delete, then try deleting it again.
    const createRes = await request(app.getHttpServer())
      .post('/api/timetable')
      .set(auth(adminToken))
      .send({
        sectionId,
        dayOfWeek: 'friday',
        periodNumber: 3,
        subject: 'Temporary',
        startTime: '11:00',
        endTime: '11:45',
      })
      .expect(201);
    const entryId = (createRes.body as TimetableEntryResponse).id;

    // First delete succeeds.
    await request(app.getHttpServer())
      .delete(`/api/timetable/${entryId}`)
      .set(auth(adminToken))
      .expect(200);

    // Second delete returns 404.
    await request(app.getHttpServer())
      .delete(`/api/timetable/${entryId}`)
      .set(auth(adminToken))
      .expect(404);
  });

  // ── Staff timetable across sections ────────────────────────────────

  it('staff timetable shows entries from multiple sections', async () => {
    // Create an entry in section2 for staffId.
    await request(app.getHttpServer())
      .post('/api/timetable')
      .set(auth(adminToken))
      .send({
        sectionId: section2Id,
        dayOfWeek: 'monday',
        periodNumber: 2,
        subject: 'Mathematics',
        staffId,
        startTime: '09:00',
        endTime: '09:45',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/timetable/staff/${staffId}`)
      .set(auth(adminToken))
      .expect(200);

    const entries = res.body as TimetableEntryResponse[];
    const sectionIds = new Set(entries.map((e) => e.sectionId));
    expect(sectionIds.has(sectionId)).toBe(true);
    expect(sectionIds.has(section2Id)).toBe(true);
  });
});
