import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { QueryRunner } from 'typeorm';
import { TenantConnectionService } from '../tenants/tenant-connection.service';
import { GenerateTempPassword } from './temp-password.util';
import {
  AccountAccessType,
  ListAccountAccessQueryDto,
} from './dto/list-account-access-query.dto';
import { IssueLoginDto } from './dto/issue-login.dto';

/** One unified row of the account-access list. */
export interface AccountAccessRow {
  id: string;
  name: string;
  type: AccountAccessType;
  relatedRecord: string | null;
  email: string | null;
  hasLogin: boolean;
  loginStatus: 'active' | 'no_login' | 'password_reset_pending' | 'revoked';
  userId: string | null;
}

export interface IssueLoginResult {
  userId: string;
  email: string;
  temporaryPassword: string;
}

const LOGIN_STATUS_CASE = `
  CASE
    WHEN c."userId" IS NULL THEN 'no_login'
    WHEN c."isActive" = false THEN 'revoked'
    WHEN c."mustChangePassword" = true THEN 'password_reset_pending'
    ELSE 'active'
  END`;

/**
 * Unified credential-management surface over the tenant tables (raw SQL via
 * TenantConnectionService, search_path scoped to the tenant schema).
 *
 * Merges staff, students and parents into one paginated list, and issues /
 * resets / revokes logins in the users table. Temporary passwords are
 * generated with crypto.randomInt, stored ONLY as bcrypt hashes, and
 * returned once in the API response — never logged.
 */
@Injectable()
export class AccountAccessService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  private async queryRunner(): Promise<QueryRunner> {
    return this.tenantConnectionService.getQueryRunner();
  }

  // ── 1. Unified, paginated list ─────────────────────────────────────────

  async findAll(query: ListAccountAccessQueryDto): Promise<{
    data: AccountAccessRow[];
    total: number;
    page: number;
    limit: number;
  }> {
    const qr = await this.queryRunner();
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;

    const params: unknown[] = [];
    const addParam = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    // Each branch SELECTs the same normalized shape so the three sources can
    // be UNION ALL-ed. Staff/student rows come from their profile tables
    // (LEFT JOIN users = login may not exist yet); parent rows come from
    // users (a parent's only identity IS their login — parents are linked
    // to children via parent_student_links, with no separate profile
    // record), so parents always have hasLogin=true.
    const branches: string[] = [];

    if (!query.type || query.type === 'staff') {
      branches.push(`
        SELECT
          s.id,
          CONCAT(s."firstName", ' ', s."lastName") AS name,
          'staff'::text AS type,
          s."employeeId" AS "relatedRecord",
          u.email,
          u.id AS "userId",
          u."isActive",
          u."mustChangePassword"
        FROM staff s
        LEFT JOIN users u
          ON u."linkedStaffId" = s.id AND u.role = 'staff'`);
    }

    if (!query.type || query.type === 'student') {
      branches.push(`
        SELECT
          st.id,
          CONCAT(st."firstName", ' ', st."lastName") AS name,
          'student'::text AS type,
          st."admissionNumber" AS "relatedRecord",
          u.email,
          u.id AS "userId",
          u."isActive",
          u."mustChangePassword"
        FROM students st
        LEFT JOIN users u
          ON u."linkedStudentId" = st.id AND u.role = 'student'`);
    }

    if (!query.type || query.type === 'parent') {
      // Display name is derived from the first linked child (parents have no
      // name fields of their own); falls back to the login email.
      branches.push(`
        SELECT
          u.id,
          COALESCE(
            (SELECT 'Parent of ' || st2."firstName" || ' ' || st2."lastName"
             FROM parent_student_links psl
             JOIN students st2 ON st2.id = psl."studentId"
             WHERE psl."parentUserId" = u.id
             ORDER BY psl."createdAt" ASC
             LIMIT 1),
            u.email) AS name,
          'parent'::text AS type,
          NULL::varchar AS "relatedRecord",
          u.email,
          u.id AS "userId",
          u."isActive",
          u."mustChangePassword"
        FROM users u
        WHERE u.role = 'parent'`);
    }

    const innerSql = branches.join('\n        UNION ALL\n');

    const whereClauses: string[] = [];
    if (query.search) {
      const p = addParam(`%${query.search}%`);
      whereClauses.push(
        `(x.name ILIKE ${p} OR COALESCE(x.email, '') ILIKE ${p})`,
      );
    }
    if (query.hasLogin !== undefined) {
      const p = addParam(query.hasLogin === 'true');
      whereClauses.push(`(x."userId" IS NOT NULL) = ${p}::boolean`);
    }
    if (query.loginStatus) {
      const p = addParam(query.loginStatus);
      whereClauses.push(`x."loginStatus" = ${p}::text`);
    }
    const whereSql = whereClauses.length
      ? `WHERE ${whereClauses.join(' AND ')}`
      : '';

    const limitParam = addParam(limit);
    const offsetParam = addParam(offset);

    const dataSql = `
      SELECT x.id, x.name, x.type, x."relatedRecord", x.email,
             x."userId", x."loginStatus"
      FROM (
        SELECT c.*, ${LOGIN_STATUS_CASE} AS "loginStatus"
        FROM (
          ${innerSql}
        ) c
      ) x
      ${whereSql}
      ORDER BY x.name ASC, x.type ASC
      LIMIT ${limitParam} OFFSET ${offsetParam}`;

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT c.*, ${LOGIN_STATUS_CASE} AS "loginStatus"
        FROM (
          ${innerSql}
        ) c
      ) x
      ${whereSql}`;

    const rows = (await qr.query(dataSql, params)) as Array<{
      id: string;
      name: string;
      type: AccountAccessType;
      relatedRecord: string | null;
      email: string | null;
      userId: string | null;
      loginStatus: AccountAccessRow['loginStatus'];
    }>;

    // Count uses the same filters but not the LIMIT/OFFSET params.
    const countRows = (await qr.query(
      countSql,
      params.slice(0, params.length - 2),
    )) as Array<{ total: number }>;

    return {
      total: countRows[0]?.total ?? 0,
      page,
      limit,
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        relatedRecord: row.relatedRecord,
        email: row.email,
        hasLogin: row.userId !== null,
        loginStatus: row.loginStatus,
        userId: row.userId,
      })),
    };
  }

  // ── 2. Issue login ─────────────────────────────────────────────────────

  async issueLogin(dto: IssueLoginDto): Promise<IssueLoginResult> {
    const qr = await this.queryRunner();
    await qr.startTransaction();
    try {
      let result: IssueLoginResult;
      if (dto.targetType === 'staff') {
        result = await this.issueStaffLogin(qr, dto);
      } else if (dto.targetType === 'student') {
        result = await this.issueStudentLogin(qr, dto);
      } else {
        result = await this.issueParentLogin(qr, dto);
      }
      await qr.commitTransaction();
      return result;
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    }
  }

  /**
   * Creates the users row for a freshly issued login. The temporary password
   * is hashed with bcrypt before it touches the database; the plain text is
   * returned to the caller exactly once and never logged.
   */
  private async insertUserWithTempPassword(
    qr: QueryRunner,
    email: string,
    role: 'staff' | 'student' | 'parent',
    link: { column: 'linkedStaffId' | 'linkedStudentId'; value: string } | null,
  ): Promise<{ userId: string; temporaryPassword: string }> {
    const temporaryPassword = GenerateTempPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    // Parents have no linked profile record, so no link column is set.
    const linkColumnSql = link ? `, "${link.column}"` : '';
    const linkPlaceholderSql = link ? `, $4` : '';
    const linkValue = link ? link.value : null;

    try {
      const inserted = (await qr.query(
        `INSERT INTO users
           (email, "passwordHash", role, "isActive", "mustChangePassword"${linkColumnSql})
         VALUES ($1, $2, $3, true, true${linkPlaceholderSql})
         RETURNING id`,
        link ? [email, passwordHash, role, linkValue] : [email, passwordHash, role],
      )) as Array<{ id: string }>;
      return { userId: inserted[0].id, temporaryPassword };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `A user with email "${email}" already exists in this school`,
        );
      }
      throw error;
    }
  }

  private async issueStaffLogin(
    qr: QueryRunner,
    dto: IssueLoginDto,
  ): Promise<IssueLoginResult> {
    const staffRows = (await qr.query(
      `SELECT id FROM staff WHERE id = $1`,
      [dto.targetId],
    )) as Array<{ id: string }>;
    if (!staffRows[0]) {
      throw new NotFoundException(
        `Staff member with id ${dto.targetId} not found`,
      );
    }

    // A staff member can only have one login — refuse to re-issue.
    const existing = (await qr.query(
      `SELECT id FROM users WHERE "linkedStaffId" = $1 AND role = 'staff'`,
      [dto.targetId],
    )) as Array<{ id: string }>;
    if (existing[0]) {
      throw new ConflictException(
        'This staff member already has a login. Use reset-password instead.',
      );
    }

    const { userId, temporaryPassword } = await this.insertUserWithTempPassword(
      qr,
      dto.email,
      'staff',
      { column: 'linkedStaffId', value: dto.targetId },
    );
    return { userId, email: dto.email, temporaryPassword };
  }

  private async issueStudentLogin(
    qr: QueryRunner,
    dto: IssueLoginDto,
  ): Promise<IssueLoginResult> {
    const studentRows = (await qr.query(
      `SELECT id FROM students WHERE id = $1`,
      [dto.targetId],
    )) as Array<{ id: string }>;
    if (!studentRows[0]) {
      throw new NotFoundException(`Student with id ${dto.targetId} not found`);
    }

    // A student can only have one login — refuse to re-issue.
    const existing = (await qr.query(
      `SELECT id FROM users WHERE "linkedStudentId" = $1 AND role = 'student'`,
      [dto.targetId],
    )) as Array<{ id: string }>;
    if (existing[0]) {
      throw new ConflictException(
        'This student already has a login. Use reset-password instead.',
      );
    }

    const { userId, temporaryPassword } = await this.insertUserWithTempPassword(
      qr,
      dto.email,
      'student',
      { column: 'linkedStudentId', value: dto.targetId },
    );
    return { userId, email: dto.email, temporaryPassword };
  }

  private async issueParentLogin(
    qr: QueryRunner,
    dto: IssueLoginDto,
  ): Promise<IssueLoginResult> {
    if (!dto.linkedStudentIds || dto.linkedStudentIds.length === 0) {
      throw new BadRequestException(
        'linkedStudentIds is required and must contain at least one student id when targetType is "parent"',
      );
    }

    // Dedupe, then validate that every student exists before inserting.
    const studentIds = Array.from(new Set(dto.linkedStudentIds));
    const studentRows = (await qr.query(
      `SELECT id FROM students WHERE id = ANY($1::uuid[])`,
      [studentIds],
    )) as Array<{ id: string }>;
    if (studentRows.length !== studentIds.length) {
      const found = new Set(studentRows.map((s) => s.id));
      const missing = studentIds.filter((id) => !found.has(id));
      throw new NotFoundException(`Student(s) not found: ${missing.join(', ')}`);
    }

    const { userId, temporaryPassword } = await this.insertUserWithTempPassword(
      qr,
      dto.email,
      'parent',
      null,
    );

    // Link the parent to every child in one statement (idempotent on the
    // unique (parentUserId, studentId) constraint).
    await qr.query(
      `INSERT INTO parent_student_links ("parentUserId", "studentId")
       SELECT $1, x FROM unnest($2::uuid[]) AS x
       ON CONFLICT ("parentUserId", "studentId") DO NOTHING`,
      [userId, studentIds],
    );

    return { userId, email: dto.email, temporaryPassword };
  }

  // ── 3. Reset password ──────────────────────────────────────────────────

  /**
   * Rotates the user's password to a new temporary password and re-arms the
   * mustChangePassword flag.
   *
   * NOTE on session invalidation: this app issues stateless JWTs (24h expiry)
   * with no token blacklist, so previously issued access tokens technically
   * remain valid until they expire. The attacker's path is still closed
   * because the *password* has been rotated; short JWT lifetime limits any
   * residual exposure. Introducing a token version/jti blacklist would be a
   * separate, system-wide change.
   */
  async resetPassword(userId: string): Promise<IssueLoginResult> {
    const qr = await this.queryRunner();

    const rows = (await qr.query(
      `SELECT id, email FROM users WHERE id = $1`,
      [userId],
    )) as Array<{ id: string; email: string }>;
    const user = rows[0];
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    const temporaryPassword = GenerateTempPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    await qr.query(
      `UPDATE users
       SET "passwordHash" = $1, "mustChangePassword" = true, "updatedAt" = now()
       WHERE id = $2`,
      [passwordHash, userId],
    );

    return { userId: user.id, email: user.email, temporaryPassword };
  }

  // ── 4. Revoke login ────────────────────────────────────────────────────

  /**
   * Deactivates the login (isActive = false) without deleting the row, so
   * the user can be re-activated / re-issued later. Login rejects inactive
   * accounts with 401.
   */
  async revoke(userId: string): Promise<{
    userId: string;
    email: string;
    isActive: boolean;
  }> {
    const qr = await this.queryRunner();

    // NOTE: TypeORM's Postgres driver returns UPDATE queries as a
    // [rowsArray, affectedCount] tuple (unlike SELECT/INSERT which return the
    // plain rows array), so destructure the first element before indexing.
    const [rows] = (await qr.query(
      `UPDATE users
       SET "isActive" = false, "updatedAt" = now()
       WHERE id = $1
       RETURNING id, email, "isActive"`,
      [userId],
    )) as [Array<{ id: string; email: string; isActive: boolean }>, number];

    if (!rows[0]) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    return {
      userId: rows[0].id,
      email: rows[0].email,
      isActive: rows[0].isActive,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === '23505'
    );
  }
}
