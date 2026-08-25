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

interface ParentChildResponse {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  sectionId: string | null;
  status: string;
}

interface ErrorResponse {
  message: string;
}

describe('Parent–student links: my-children (e2e)', () => {
  const TENANT_SCHEMA = 'e2eparentlinks';
  const TENANT_SUBDOMAIN = 'e2eparentlinks';
  const SEED_PASSWORD = 'E2ePassw0rd!';
  const ADMIN_EMAIL = 'pl-admin@example.com';
  const STAFF_EMAIL = 'pl-staff@example.com';
  const PARENT_EMAIL = 'pl-parent@example.com';
  const PARENT_NO_LINK_EMAIL = 'pl-parent-nolink@example.com';
  const PLATFORM_ADMIN_EMAIL = 'pl-e2e-platform@example.com';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let staffToken: string;
  let parentToken: string;
  let parentNoLinkToken: string;
  let platformAdminToken: string;
  let sectionId: string;
  let student1Id: string;
  let student2Id: string;
  let parentUserId: string;

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
        name: 'E2E Parent Links Test School',
        schemaName: TENANT_SCHEMA,
        subdomain: TENANT_SUBDOMAIN,
      })
      .expect(201);
    const tenant = provisionRes.body as TenantResponse;
    expect(tenant.schemaName).toBe(TENANT_SCHEMA);

    // 3. Seed users: school_admin, staff, parent (linked to 2 children),
    //    and a second parent with 0 linked children.
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO "${TENANT_SCHEMA}".users
         (email, "passwordHash", role, "isActive")
       VALUES ($1, $2, $3, true), ($4, $5, $6, true), ($7, $8, $9, true), ($10, $11, $12, true)`,
      [
        ADMIN_EMAIL, passwordHash, 'school_admin',
        STAFF_EMAIL, passwordHash, 'staff',
        PARENT_EMAIL, passwordHash, 'parent',
        PARENT_NO_LINK_EMAIL, passwordHash, 'parent',
      ],
    );

    // Look up the parent user IDs.
    const parentRows = (await dataSource.query(
      `SELECT id, email FROM "${TENANT_SCHEMA}".users WHERE email IN ($1, $2)`,
      [PARENT_EMAIL, PARENT_NO_LINK_EMAIL],
    )) as Array<{ id: string; email: string }>;
    const emailToId = new Map(parentRows.map((r) => [r.email, r.id]));
    parentUserId = emailToId.get(PARENT_EMAIL)!;

    // 4. Log in all users.
    adminToken = await login(ADMIN_EMAIL);
    staffToken = await login(STAFF_EMAIL);
    parentToken = await login(PARENT_EMAIL);
    parentNoLinkToken = await login(PARENT_NO_LINK_EMAIL);

    // 5. Create a class, section, and two students.
    const classRes = await request(app.getHttpServer())
      .post('/api/classes')
      .set(auth(adminToken))
      .send({ name: 'Grade 3', displayOrder: 3 })
      .expect(201);
    const classBody = classRes.body as { id: string };

    const sectionRes = await request(app.getHttpServer())
      .post(`/api/classes/${classBody.id}/sections`)
      .set(auth(adminToken))
      .send({ name: 'B', capacity: 25 })
      .expect(201);
    const sectionBody = sectionRes.body as { id: string };
    sectionId = sectionBody.id;

    const s1Res = await request(app.getHttpServer())
      .post('/api/students')
      .set(auth(adminToken))
      .send({
        firstName: 'Alice',
        lastName: 'Smith',
        dateOfBirth: '2016-05-10',
        admissionNumber: 'ADM-PL-001',
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
        dateOfBirth: '2016-09-22',
        admissionNumber: 'ADM-PL-002',
        sectionId,
      })
      .expect(201);
    student2Id = (s2Res.body as { id: string }).id;

    // 6. Link parent to both students.
    await request(app.getHttpServer())
      .post('/api/parent-links')
      .set(auth(adminToken))
      .send({ parentUserId, studentId: student1Id })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/parent-links')
      .set(auth(adminToken))
      .send({ parentUserId, studentId: student2Id })
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

  // ── Happy path ──────────────────────────────────────────────────────

  it('parent with 2 linked children returns both with enriched info', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/parent-links/my-children')
      .set(auth(parentToken))
      .expect(200);

    const children = res.body as ParentChildResponse[];
    expect(children).toHaveLength(2);

    // Sorted by lastName, firstName — Alice Smith, Bob Jones
    const ids = children.map((c) => c.id);
    expect(ids).toContain(student1Id);
    expect(ids).toContain(student2Id);

    const alice = children.find((c) => c.id === student1Id)!;
    expect(alice.firstName).toBe('Alice');
    expect(alice.lastName).toBe('Smith');
    expect(alice.admissionNumber).toBe('ADM-PL-001');
    expect(alice.sectionId).toBe(sectionId);
    expect(alice.status).toBe('active');

    const bob = children.find((c) => c.id === student2Id)!;
    expect(bob.firstName).toBe('Bob');
    expect(bob.lastName).toBe('Jones');
    expect(bob.admissionNumber).toBe('ADM-PL-002');
    expect(bob.sectionId).toBe(sectionId);
    expect(bob.status).toBe('active');
  });

  // ── Empty state ─────────────────────────────────────────────────────

  it('parent with 0 linked children returns an empty array', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/parent-links/my-children')
      .set(auth(parentNoLinkToken))
      .expect(200);

    const children = res.body as ParentChildResponse[];
    expect(children).toEqual([]);
  });

  // ── RBAC ────────────────────────────────────────────────────────────

  it('non-parent role (school_admin) gets 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/parent-links/my-children')
      .set(auth(adminToken))
      .expect(403);

    const body = res.body as ErrorResponse;
    expect(body.message).toBeDefined();
  });

  it('non-parent role (staff) gets 403', async () => {
    await request(app.getHttpServer())
      .get('/api/parent-links/my-children')
      .set(auth(staffToken))
      .expect(403);
  });

  it('unauthenticated request gets 401', async () => {
    await request(app.getHttpServer())
      .get('/api/parent-links/my-children')
      .set('X-Tenant-ID', TENANT_SCHEMA)
      .expect(401);
  });
});
