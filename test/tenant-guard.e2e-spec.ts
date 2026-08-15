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

interface AdminLoginResponse {
  accessToken: string;
}

interface ErrorResponse {
  message: string;
}

describe('TenantGuard (e2e)', () => {
  const TENANT_A_SCHEMA = 'guardtenanta';
  const TENANT_A_SUBDOMAIN = 'guardtenanta';
  const TENANT_B_SCHEMA = 'guardtenantb';
  const TENANT_B_SUBDOMAIN = 'guardtenantb';
  const SEED_EMAIL = 'guard-e2e-admin@example.com';
  const SEED_PASSWORD = 'E2ePassw0rd!';
  const PLATFORM_ADMIN_EMAIL = 'guard-e2e-platform@example.com';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let tenantAId: string;
  let tenantBId: string;
  let tenantAToken: string;
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
    await dropTenants();

    // 1. Seed a platform admin (clean slate for a known password) and log in.
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
    const adminLogin = adminLoginRes.body as AdminLoginResponse;
    expect(adminLogin.accessToken).toBeDefined();
    platformAdminToken = adminLogin.accessToken;

    // 2. Provision two tenants so we can prove cross-tenant rejection: a
    //    token scoped to tenant A must be rejected when requesting tenant B.
    const tenantARes = await request(app.getHttpServer())
      .post('/api/admin/tenants/provision')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        name: 'Guard Test School A',
        schemaName: TENANT_A_SCHEMA,
        subdomain: TENANT_A_SUBDOMAIN,
      })
      .expect(201);
    const tenantA = tenantARes.body as TenantResponse;
    tenantAId = tenantA.id;
    expect(tenantAId).toBeDefined();

    const tenantBRes = await request(app.getHttpServer())
      .post('/api/admin/tenants/provision')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        name: 'Guard Test School B',
        schemaName: TENANT_B_SCHEMA,
        subdomain: TENANT_B_SUBDOMAIN,
      })
      .expect(201);
    const tenantB = tenantBRes.body as TenantResponse;
    tenantBId = tenantB.id;
    expect(tenantBId).toBeDefined();

    // 3. Seed a login user in tenant A's schema and log in to get a
    //    tenant-scoped JWT (its payload carries tenantId = tenantAId).
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await dataSource.query(
      `INSERT INTO "${TENANT_A_SCHEMA}".users (email, "passwordHash", role, "isActive")
       VALUES ($1, $2, $3, true)`,
      [SEED_EMAIL, passwordHash, 'school_admin'],
    );

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Tenant-ID', TENANT_A_SCHEMA)
      .send({ email: SEED_EMAIL, password: SEED_PASSWORD })
      .expect(200);
    const login = loginRes.body as LoginResponse;
    expect(login.accessToken).toBeDefined();
    tenantAToken = login.accessToken;
  });

  afterAll(async () => {
    await dropTenants();
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

  /** Drops the test tenants' schemas and removes their rows from public.tenants. */
  async function dropTenants() {
    if (!dataSource) {
      return;
    }
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      for (const schema of [TENANT_A_SCHEMA, TENANT_B_SCHEMA]) {
        await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await queryRunner.query(
          `DELETE FROM public.tenants WHERE "schemaName" = $1`,
          [schema],
        );
      }
    } finally {
      await queryRunner.release();
    }
  }

  it('allows a platform admin token to list tenants', async () => {
    // Platform admin JWTs carry no tenantId claim, and TenantGuard skips the
    // tenant-matching check entirely for role === 'platform_admin'. The
    // X-Tenant-ID header here points at tenant B — the token isn't scoped to
    // any tenant, so it must not be rejected.
    const res = await request(app.getHttpServer())
      .get('/api/tenants')
      .set('X-Tenant-ID', TENANT_B_SCHEMA)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);

    const body = res.body as { data: unknown[]; total: number };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  it("allows a platform admin token to read another tenant's detail", async () => {
    // Cross-tenant access: the platform admin token (no tenant claims) can
    // read tenant B even though the request resolves the tenant context to A.
    const res = await request(app.getHttpServer())
      .get(`/api/tenants/${tenantBId}`)
      .set('X-Tenant-ID', TENANT_A_SCHEMA)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);

    expect((res.body as TenantResponse).id).toBe(tenantBId);
  });

  it('rejects a tenant-scoped user token for a different tenant', async () => {
    // tenantAToken's JWT carries tenantId = tenantAId. Requesting tenant B's
    // context must be rejected by TenantGuard with 403 (original behavior).
    const res = await request(app.getHttpServer())
      .get('/api/tenants')
      .set('X-Tenant-ID', TENANT_B_SCHEMA)
      .set('Authorization', `Bearer ${tenantAToken}`)
      .expect(403);

    const body = res.body as ErrorResponse;
    expect(body.message).toContain('tenant');
  });

  it('still allows a tenant-scoped user token for its own tenant', async () => {
    // Sanity check: the original TenantGuard behavior for matching tenants is
    // unchanged.
    const res = await request(app.getHttpServer())
      .get('/api/tenants')
      .set('X-Tenant-ID', TENANT_A_SCHEMA)
      .set('Authorization', `Bearer ${tenantAToken}`)
      .expect(200);

    const body = res.body as { data: unknown[]; total: number };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(2);
  });
});
