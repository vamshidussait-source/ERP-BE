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

interface StaffResponse {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  designation: string;
  employeeId: string;
  status: string;
}

interface ErrorResponse {
  message: string;
}

describe('Staff RBAC (e2e)', () => {
  const TENANT_SCHEMA = 'e2estaff';
  const TENANT_SUBDOMAIN = 'e2estaff';
  const SEED_PASSWORD = 'E2ePassw0rd!';
  const ADMIN_EMAIL = 'rbac-admin@example.com';
  const STAFF_EMAIL = 'rbac-staff@example.com';
  const PLATFORM_ADMIN_EMAIL = 'staff-rbac-e2e-platform@example.com';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let staffToken: string;
  let staffId: string;
  let platformAdminToken: string;

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
        name: 'E2E RBAC Test School',
        schemaName: TENANT_SCHEMA,
        subdomain: TENANT_SUBDOMAIN,
      })
      .expect(201);
    const tenant = provisionRes.body as TenantResponse;
    expect(tenant.schemaName).toBe(TENANT_SCHEMA);

    // 3. Seed two users directly in the tenant schema (same known bcrypt
    //    hash): one school_admin and one plain staff member.
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

    // 4. Log in as both users and keep their JWTs for the tenant-scoped
    //    requests.
    adminToken = await login(ADMIN_EMAIL);
    staffToken = await login(STAFF_EMAIL);
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

  it('lets a school_admin create a staff member (201)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/staff')
      .set(auth(adminToken))
      .send({
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace.hopper@rbac.edu',
        designation: 'Computer Science Teacher',
        employeeId: 'EMP-RBAC-001',
      })
      .expect(201);

    const body = res.body as StaffResponse;
    expect(body.firstName).toBe('Grace');
    expect(body.employeeId).toBe('EMP-RBAC-001');
    expect(body.status).toBe('active');
    staffId = body.id;
    expect(staffId).toBeDefined();
  });

  it('rejects a staff-role user creating a staff member (403)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/staff')
      .set(auth(staffToken))
      .send({
        firstName: 'Unauthorized',
        lastName: 'User',
        email: 'unauthorized@rbac.edu',
        designation: 'Teacher',
        employeeId: 'EMP-RBAC-002',
      })
      .expect(403);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('school_admin');
  });

  it('lets a staff-role user list the staff directory (200)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/staff')
      .set(auth(staffToken))
      .expect(200);

    const body = res.body as { data: StaffResponse[]; total: number };
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.data.some((member) => member.id === staffId)).toBe(true);
  });

  it('lets a school_admin update a staff member (200)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/staff/${staffId}`)
      .set(auth(adminToken))
      .send({ designation: 'Head of Computer Science' })
      .expect(200);

    const body = res.body as StaffResponse;
    expect(body.id).toBe(staffId);
    expect(body.designation).toBe('Head of Computer Science');
  });

  it('lets a school_admin soft-delete a staff member (200)', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/staff/${staffId}`)
      .set(auth(adminToken))
      .expect(200);

    const body = res.body as StaffResponse;
    expect(body.id).toBe(staffId);
    expect(body.status).toBe('inactive');
  });

  it('rejects a staff-role user updating a staff member (403)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/staff/${staffId}`)
      .set(auth(staffToken))
      .send({ designation: 'Hacker' })
      .expect(403);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('school_admin');
  });

  it('rejects a staff-role user soft-deleting a staff member (403)', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/staff/${staffId}`)
      .set(auth(staffToken))
      .expect(403);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('school_admin');
  });
});
