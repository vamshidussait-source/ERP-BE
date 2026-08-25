import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionService } from '../tenants/tenant-connection.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { Student, StudentStatus } from './student.entity';

/** Student profile returned by the self-service endpoint. */
export interface StudentProfile {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  sectionId: string | null;
  sectionName: string | null;
  className: string | null;
  status: StudentStatus;
  dateOfBirth: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class StudentsService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  /**
   * Returns a query runner scoped to the current tenant schema via search_path.
   * All queries against the students table must go through this.
   */
  private async queryRunner(): Promise<QueryRunner> {
    return this.tenantConnectionService.getQueryRunner();
  }

  async create(createStudentDto: CreateStudentDto): Promise<Student> {
    const queryRunner = await this.queryRunner();

    try {
      const rows = (await queryRunner.query(
        `INSERT INTO students ("firstName", "lastName", "dateOfBirth", "admissionNumber", "sectionId")
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          createStudentDto.firstName,
          createStudentDto.lastName,
          createStudentDto.dateOfBirth,
          createStudentDto.admissionNumber,
          createStudentDto.sectionId ?? null,
        ],
      )) as Student[];
      return rows[0];
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `A student with admission number "${createStudentDto.admissionNumber}" already exists`,
        );
      }
      if (this.isForeignKeyViolation(error)) {
        throw new NotFoundException(
          `Section with id ${createStudentDto.sectionId} not found`,
        );
      }
      throw error;
    }
  }

  async findAll(
    page = 1,
    limit = 10,
    status?: StudentStatus,
  ): Promise<{ data: Student[]; total: number; page: number; limit: number }> {
    const queryRunner = await this.queryRunner();
    const offset = (page - 1) * limit;
    const whereClause = status ? 'WHERE status = $1' : '';
    const statusFilter = status ? [status] : [];

    const countRows = (await queryRunner.query(
      `SELECT COUNT(*)::int AS total FROM students ${whereClause}`,
      statusFilter,
    )) as Array<{ total: number }>;
    const data = (await queryRunner.query(
      `SELECT * FROM students ${whereClause}
       ORDER BY "createdAt" DESC
       LIMIT $${status ? 2 : 1} OFFSET $${status ? 3 : 2}`,
      status ? [status, limit, offset] : [limit, offset],
    )) as Student[];

    const total = countRows[0]?.total ?? 0;
    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Student> {
    const queryRunner = await this.queryRunner();
    const rows = (await queryRunner.query(
      `SELECT * FROM students WHERE id = $1`,
      [id],
    )) as Student[];
    if (!rows[0]) {
      throw new NotFoundException(`Student with id ${id} not found`);
    }
    return rows[0];
  }

  async update(
    id: string,
    updateStudentDto: UpdateStudentDto,
  ): Promise<Student> {
    const existing = await this.findOne(id);

    const assignments: ReadonlyArray<readonly [string, unknown]> = [
      ['firstName', updateStudentDto.firstName],
      ['lastName', updateStudentDto.lastName],
      ['dateOfBirth', updateStudentDto.dateOfBirth],
      ['admissionNumber', updateStudentDto.admissionNumber],
      ['sectionId', updateStudentDto.sectionId],
      ['status', updateStudentDto.status],
    ];

    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [column, value] of assignments) {
      if (value !== undefined) {
        setClauses.push(`"${column}" = $${setClauses.length + 1}`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) {
      // Nothing to update — return the current row unchanged.
      return existing;
    }

    setClauses.push('"updatedAt" = now()');

    try {
      const queryRunner = await this.queryRunner();
      const [rows] = (await queryRunner.query(
        `UPDATE students SET ${setClauses.join(', ')}
         WHERE id = $${setClauses.length}
         RETURNING *`,
        [...values, id],
      )) as [Student[], number];
      return rows[0];
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `A student with admission number "${updateStudentDto.admissionNumber}" already exists`,
        );
      }
      if (this.isForeignKeyViolation(error)) {
        throw new NotFoundException(
          `Section with id ${updateStudentDto.sectionId} not found`,
        );
      }
      throw error;
    }
  }

  /**
   * Soft delete: sets status to 'inactive' rather than removing the row.
   */
  async softDelete(id: string): Promise<Student> {
    const queryRunner = await this.queryRunner();
    const [rows] = (await queryRunner.query(
      `UPDATE students SET status = $1, "updatedAt" = now()
       WHERE id = $2
       RETURNING *`,
      [StudentStatus.Inactive, id],
    )) as [Student[], number];
    if (!rows[0]) {
      throw new NotFoundException(`Student with id ${id} not found`);
    }
    return rows[0];
  }  /**
   * Returns the linkedStudentId for a given user, or null if the user
   * account has no student record linked.
   */
  async getLinkedStudentId(userId: string): Promise<string | null> {
    const qr = await this.queryRunner();
    const rows = (await qr.query(
      `SELECT "linkedStudentId" FROM users WHERE id = $1`,
      [userId],
    )) as Array<{ linkedStudentId: string | null }>;
    return rows[0]?.linkedStudentId ?? null;
  }

  /**
   * Resolves the authenticated user's linkedStudentId and returns the
   * student profile enriched with section/class names.
   */
  async getMyProfile(userId: string): Promise<StudentProfile> {
    const linkedStudentId = await this.getLinkedStudentId(userId);

    if (!linkedStudentId) {
      throw new NotFoundException(
        'Your account is not linked to a student record — contact your school administrator.',
      );
    }

    const qr = await this.queryRunner();
    const rows = (await qr.query(
      `SELECT
         s.*, sec.name AS "sectionName",
         c.name AS "className"
       FROM students s
       LEFT JOIN sections sec ON sec.id = s."sectionId"
       LEFT JOIN classes c ON c.id = sec."classId"
       WHERE s.id = $1`,
      [linkedStudentId],
    )) as Array<Record<string, unknown>>;

    if (!rows[0]) {
      throw new NotFoundException(
        `Student with id ${linkedStudentId} not found`,
      );
    }

    const row = rows[0];
    return {
      id: row.id as string,
      firstName: row.firstName as string,
      lastName: row.lastName as string,
      admissionNumber: row.admissionNumber as string,
      sectionId: (row.sectionId as string) ?? null,
      sectionName: (row.sectionName as string) ?? null,
      className: (row.className as string) ?? null,
      status: row.status as StudentStatus,
      dateOfBirth: row.dateOfBirth as string,
      createdAt: row.createdAt as Date,
      updatedAt: row.updatedAt as Date,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' && error !== null &&
      (error as { code?: string }).code === '23505'
    );
  }

  private isForeignKeyViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === '23503'
    );
  }
}
