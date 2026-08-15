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
  sectionId: string | null;
  status: string;
}

interface ErrorResponse {
  message: string;
}

describe('Tenant lifecycle (e2e)', () => {
  const TENANT_SCHEMA = 'e2etest';
  const TENANT_SUBDOMAIN = 'e2etest';
  const SEED_EMAIL = 'e2e-admin@example.com';
  const SEED_PASSWORD = 'E2ePassw0rd!';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let tenantId: string;
  let accessToken: string;
  let classId: string;
  let sectionId: string;
  let studentId: string;

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

    // 1. Provision a fresh tenant through the public admin endpoint.
    const provisionRes = await request(app.getHttpServer())
      .post('/api/admin/tenants/provision')
      .send({
        name: 'E2E Test School',
        schemaName: TENANT_SCHEMA,
        subdomain: TENANT_SUBDOMAIN,
      })
      .expect(201);
    const tenant = provisionRes.body as TenantResponse;
    expect(tenant.schemaName).toBe(TENANT_SCHEMA);
    tenantId = tenant.id;
    expect(tenantId).toBeDefined();

    // 2. Seed a login user directly in the tenant schema (known bcrypt hash).
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO "${TENANT_SCHEMA}".users (email, "passwordHash", role, "isActive")
       VALUES ($1, $2, $3, true)`,
      [SEED_EMAIL, passwordHash, 'school_admin'],
    );

    // 3. Log in and keep the JWT for the tenant-scoped requests.
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Tenant-ID', TENANT_SCHEMA)
      .send({ email: SEED_EMAIL, password: SEED_PASSWORD })
      .expect(200);
    const login = loginRes.body as LoginResponse;
    expect(login.accessToken).toBeDefined();
    expect(login.user).toBeDefined();
    expect(login.user.id).toBeDefined();
    expect(login.user.email).toBe(SEED_EMAIL);
    expect(login.user.role).toBeDefined();
    accessToken = login.accessToken;
  });

  afterAll(async () => {
    await dropTenant();
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

  /** Headers required by every tenant-scoped route. */
  function auth() {
    return {
      'X-Tenant-ID': TENANT_SCHEMA,
      Authorization: `Bearer ${accessToken}`,
    };
  }

  it('creates a class', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/classes')
      .set(auth())
      .send({ name: 'Grade 8', displayOrder: 8 })
      .expect(201);

    const body = res.body as ClassResponse;
    expect(body.name).toBe('Grade 8');
    expect(body.displayOrder).toBe(8);
    classId = body.id;
    expect(classId).toBeDefined();
  });

  it('creates a section under that class', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/classes/${classId}/sections`)
      .set(auth())
      .send({ name: 'A', capacity: 30 })
      .expect(201);

    const body = res.body as SectionResponse;
    expect(body.classId).toBe(classId);
    expect(body.name).toBe('A');
    sectionId = body.id;
    expect(sectionId).toBeDefined();
  });

  it('creates a student assigned to that section', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/students')
      .set(auth())
      .send({
        firstName: 'Grace',
        lastName: 'Hopper',
        dateOfBirth: '2006-04-14',
        admissionNumber: 'ADM-E2E-001',
        sectionId,
      })
      .expect(201);

    const body = res.body as StudentResponse;
    expect(body.sectionId).toBe(sectionId);
    studentId = body.id;
    expect(studentId).toBeDefined();
  });

  it('rejects deleting a section that still has students (409)', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/sections/${sectionId}`)
      .set(auth())
      .expect(409);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('student');
  });

  it('deletes the student first (soft delete)', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/students/${studentId}`)
      .set(auth())
      .expect(200);

    const body = res.body as StudentResponse;
    expect(body.id).toBe(studentId);
    expect(body.status).toBe('inactive');
  });

  it('deletes the section once its student is gone', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/sections/${sectionId}`)
      .set(auth())
      .expect(200);

    const body = res.body as SectionResponse;
    expect(body.id).toBe(sectionId);
  });

  it('deactivates then reactivates the tenant via the reactivate endpoint', async () => {
    // 1. Deactivate the tenant.
    const deactivatedRes = await request(app.getHttpServer())
      .patch(`/api/tenants/${tenantId}/deactivate`)
      .set(auth())
      .expect(200);
    expect(deactivatedRes.body.id).toBe(tenantId);
    expect(deactivatedRes.body.isActive).toBe(false);

    // 2. Reactivate it via the new endpoint.
    const reactivatedRes = await request(app.getHttpServer())
      .post(`/api/tenants/${tenantId}/reactivate`)
      .set(auth())
      .expect(200);
    expect(reactivatedRes.body.id).toBe(tenantId);
    expect(reactivatedRes.body.isActive).toBe(true);

    // 3. Confirm the change persisted.
    const fetchedRes = await request(app.getHttpServer())
      .get(`/api/tenants/${tenantId}`)
      .set(auth())
      .expect(200);
    expect(fetchedRes.body.isActive).toBe(true);
  });
});
