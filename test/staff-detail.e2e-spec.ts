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
  email: string;
  designation: string;
  employeeId: string;
  status: string;
  departmentName: string | null;
  employmentType: string | null;
  officeRoom: string | null;
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
}

interface AcademicLoadResponse {
  assignedClasses: string[];
  subjects: string[];
  weeklyPeriods: number;
}

interface ErrorResponse {
  message: string;
}

describe('Staff detail — academic load & quick info (e2e)', () => {
  const TENANT_SCHEMA = 'e2estaffdetail';
  const TENANT_SUBDOMAIN = 'e2estaffdetail';
  const SEED_PASSWORD = 'E2ePassw0rd!';
  const ADMIN_EMAIL = 'staffdetail-admin@example.com';
  const STAFF_EMAIL = 'staffdetail-staff@example.com';
  const PLATFORM_ADMIN_EMAIL = 'staff-detail-e2e-platform@example.com';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let staffToken: string;
  let platformAdminToken: string;
  let busyStaffId: string;
  let idleStaffId: string;

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

    // 1. Seed a platform admin (provisioning requires a platform-admin JWT).
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
    //    including the new quick-info columns on staff).
    const provisionRes = await request(app.getHttpServer())
      .post('/api/admin/tenants/provision')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        name: 'E2E Staff Detail Test School',
        schemaName: TENANT_SCHEMA,
        subdomain: TENANT_SUBDOMAIN,
        // Timetable writes are behind the 'timetable' feature flag, which
        // requires the premium tier (mirrors timetable.e2e-spec.ts).
        planTier: 'premium',
      })
      .expect(201);
    const tenant = provisionRes.body as TenantResponse;
    expect(tenant.schemaName).toBe(TENANT_SCHEMA);

    // 3. Seed users: school_admin and plain staff.
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO "${TENANT_SCHEMA}".users
         (email, "passwordHash", role, "isActive")
       VALUES ($1, $2, $3, true), ($4, $5, $6, true)`,
      [
        ADMIN_EMAIL,
        passwordHash,
        'school_admin',
        STAFF_EMAIL,
        passwordHash,
        'staff',
      ],
    );

    // 4. Log in both users.
    adminToken = await login(ADMIN_EMAIL);
    staffToken = await login(STAFF_EMAIL);

    // 5. Create classes/sections for the timetable fixtures.
    const classRes = await request(app.getHttpServer())
      .post('/api/classes')
      .set(auth(adminToken))
      .send({ name: 'Grade 10', displayOrder: 10 })
      .expect(201);
    const grade10 = classRes.body as ClassResponse;

    const class11Res = await request(app.getHttpServer())
      .post('/api/classes')
      .set(auth(adminToken))
      .send({ name: 'Grade 11', displayOrder: 11 })
      .expect(201);
    const grade11 = class11Res.body as ClassResponse;

    const grade10SectionIds: string[] = [];
    for (const sectionName of ['A', 'B']) {
      const sectionRes = await request(app.getHttpServer())
        .post(`/api/classes/${grade10.id}/sections`)
        .set(auth(adminToken))
        .send({ name: sectionName, capacity: 40 })
        .expect(201);
      grade10SectionIds.push((sectionRes.body as SectionResponse).id);
    }

    const grade11SectionRes = await request(app.getHttpServer())
      .post(`/api/classes/${grade11.id}/sections`)
      .set(auth(adminToken))
      .send({ name: 'A', capacity: 35 })
      .expect(201);
    const grade11SectionId = (grade11SectionRes.body as SectionResponse).id;

    // 6. Create two staff members: one with timetable entries, one without.
    const busyRes = await request(app.getHttpServer())
      .post('/api/staff')
      .set(auth(adminToken))
      .send({
        firstName: 'Alice',
        lastName: 'Teacher',
        email: 'alice.busy@staffdetail.edu',
        designation: 'Math Teacher',
        employeeId: 'EMP-SD-001',
        departmentName: 'Mathematics',
        employmentType: 'full_time',
        officeRoom: 'B-204',
      })
      .expect(201);
    busyStaffId = (busyRes.body as StaffResponse).id;

    const idleRes = await request(app.getHttpServer())
      .post('/api/staff')
      .set(auth(adminToken))
      .send({
        firstName: 'Bob',
        lastName: 'Newhire',
        email: 'bob.idle@staffdetail.edu',
        designation: 'Substitute Teacher',
        employeeId: 'EMP-SD-002',
      })
      .expect(201);
    idleStaffId = (idleRes.body as StaffResponse).id;

    // 7. Build Alice's timetable: entries across two Grade 10 sections and
    //    one Grade 11 section, with a duplicate subject to test dedup.
    const fixtures: Array<{
      sectionId: string;
      dayOfWeek: string;
      periodNumber: number;
      subject: string;
    }> = [
      { sectionId: grade10SectionIds[0], dayOfWeek: 'monday', periodNumber: 1, subject: 'Mathematics' },
      { sectionId: grade10SectionIds[0], dayOfWeek: 'monday', periodNumber: 2, subject: 'Mathematics' },
      { sectionId: grade10SectionIds[0], dayOfWeek: 'tuesday', periodNumber: 1, subject: 'Physics' },
      { sectionId: grade10SectionIds[1], dayOfWeek: 'wednesday', periodNumber: 1, subject: 'Mathematics' },
      { sectionId: grade11SectionId, dayOfWeek: 'thursday', periodNumber: 3, subject: 'Physics' },
    ];
    for (const fixture of fixtures) {
      await request(app.getHttpServer())
        .post('/api/timetable')
        .set(auth(adminToken))
        .send({
          ...fixture,
          staffId: busyStaffId,
          startTime: '08:00',
          endTime: '08:45',
        })
        .expect(201);
    }
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
    return body.accessToken;
  }

  /** Headers required by every tenant-scoped route, for a given token. */
  function auth(token: string) {
    return {
      'X-Tenant-ID': TENANT_SCHEMA,
      Authorization: `Bearer ${token}`,
    };
  }

  // ── Academic load aggregation ──────────────────────────────────────

  it('aggregates classes, subjects, and weekly periods for a staff member with timetable entries', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/staff/${busyStaffId}/academic-load`)
      .set(auth(adminToken))
      .expect(200);

    const body = res.body as AcademicLoadResponse;
    // Distinct classes joined through sections → classes, deduplicated
    // across both Grade 10 sections.
    expect(body.assignedClasses).toEqual(['Grade 10', 'Grade 11']);
    // Distinct subjects — 'Mathematics' appears 3 times but lists once.
    expect(body.subjects).toEqual(['Mathematics', 'Physics']);
    // One COUNT per timetable entry across the whole week.
    expect(body.weeklyPeriods).toBe(5);
  });

  it('returns empty arrays and 0 for a staff member with no timetable entries', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/staff/${idleStaffId}/academic-load`)
      .set(auth(adminToken))
      .expect(200);

    const body = res.body as AcademicLoadResponse;
    expect(body.assignedClasses).toEqual([]);
    expect(body.subjects).toEqual([]);
    expect(body.weeklyPeriods).toBe(0);
  });

  it('lets a plain staff-role user view academic load (open to any tenant role)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/staff/${busyStaffId}/academic-load`)
      .set(auth(staffToken))
      .expect(200);

    const body = res.body as AcademicLoadResponse;
    expect(body.weeklyPeriods).toBe(5);
    expect(body.assignedClasses).toContain('Grade 10');
  });

  it('returns 404 for academic load of a non-existent staff member', async () => {
    const res = await request(app.getHttpServer())
      .get(
        '/api/staff/00000000-0000-0000-0000-000000000000/academic-load',
      )
      .set(auth(adminToken))
      .expect(404);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('not found');
  });

  it('rejects unauthenticated academic load requests (401)', async () => {
    await request(app.getHttpServer())
      .get(`/api/staff/${busyStaffId}/academic-load`)
      .set('X-Tenant-ID', TENANT_SCHEMA)
      .expect(401);
  });

  // ── Quick info fields: create / read / update ──────────────────────

  it('saves and returns the three quick-info fields on create', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/staff')
      .set(auth(adminToken))
      .send({
        firstName: 'Carol',
        lastName: 'Parttimer',
        email: 'carol@staffdetail.edu',
        designation: 'Lab Assistant',
        employeeId: 'EMP-SD-003',
        departmentName: 'Science',
        employmentType: 'part_time',
        officeRoom: 'LAB-1',
      })
      .expect(201);

    const created = createRes.body as StaffResponse;
    expect(created.departmentName).toBe('Science');
    expect(created.employmentType).toBe('part_time');
    expect(created.officeRoom).toBe('LAB-1');

    // And GET /staff/:id returns them too.
    const getRes = await request(app.getHttpServer())
      .get(`/api/staff/${created.id}`)
      .set(auth(adminToken))
      .expect(200);
    const fetched = getRes.body as StaffResponse;
    expect(fetched.departmentName).toBe('Science');
    expect(fetched.employmentType).toBe('part_time');
    expect(fetched.officeRoom).toBe('LAB-1');
  });

  it('omits the quick-info fields gracefully on create (null, not error)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/staff')
      .set(auth(adminToken))
      .send({
        firstName: 'Dave',
        lastName: 'Minimal',
        email: 'dave@staffdetail.edu',
        designation: 'Counselor',
        employeeId: 'EMP-SD-004',
      })
      .expect(201);

    const body = res.body as StaffResponse;
    expect(body.departmentName).toBeNull();
    expect(body.employmentType).toBeNull();
    expect(body.officeRoom).toBeNull();
  });

  it('updates the quick-info fields via PATCH and reflects them on GET', async () => {
    const patchRes = await request(app.getHttpServer())
      .patch(`/api/staff/${idleStaffId}`)
      .set(auth(adminToken))
      .send({
        departmentName: 'Sports',
        employmentType: 'part_time',
        officeRoom: 'GYM-2',
      })
      .expect(200);

    const patched = patchRes.body as StaffResponse;
    expect(patched.departmentName).toBe('Sports');
    expect(patched.employmentType).toBe('part_time');
    expect(patched.officeRoom).toBe('GYM-2');

    const getRes = await request(app.getHttpServer())
      .get(`/api/staff/${idleStaffId}`)
      .set(auth(adminToken))
      .expect(200);
    const fetched = getRes.body as StaffResponse;
    expect(fetched.departmentName).toBe('Sports');
    expect(fetched.employmentType).toBe('part_time');
    expect(fetched.officeRoom).toBe('GYM-2');
  });

  it('clears quick-info fields when patched with null', async () => {
    const patchRes = await request(app.getHttpServer())
      .patch(`/api/staff/${busyStaffId}`)
      .set(auth(adminToken))
      .send({ officeRoom: null })
      .expect(200);

    const body = patchRes.body as StaffResponse;
    expect(body.officeRoom).toBeNull();
    // Untouched fields stay intact.
    expect(body.departmentName).toBe('Mathematics');
    expect(body.employmentType).toBe('full_time');
  });

  it('rejects a staff-role user patching quick-info fields (403)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/staff/${busyStaffId}`)
      .set(auth(staffToken))
      .send({ departmentName: 'Hacked Dept' })
      .expect(403);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('school_admin');
  });
});
