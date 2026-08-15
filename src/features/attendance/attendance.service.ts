import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionService } from '../tenants/tenant-connection.service';
import { Attendance } from './attendance.entity';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';

/** An attendance row enriched with the student's names (for teacher views). */
export interface AttendanceWithStudent extends Attendance {
  firstName: string;
  lastName: string;
}

/** Per-student status counts for a section over a date range. */
export interface AttendanceSummaryRow {
  studentId: string;
  firstName: string;
  lastName: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  /**
   * Returns a query runner scoped to the current tenant schema via search_path.
   * All queries against the attendance table must go through this.
   */
  private async queryRunner(): Promise<QueryRunner> {
    return this.tenantConnectionService.getQueryRunner();
  }

  private async assertSectionExists(sectionId: string): Promise<void> {
    const queryRunner = await this.queryRunner();
    const sectionRows = (await queryRunner.query(
      `SELECT id FROM sections WHERE id = $1`,
      [sectionId],
    )) as Array<{ id: string }>;
    if (!sectionRows[0]) {
      throw new NotFoundException(`Section with id ${sectionId} not found`);
    }
  }

  /**
   * Creates a record for a student+date, or updates the existing record if one
   * already exists (teachers often correct same-day mistakes). The sectionId
   * is denormalized from the student's current section so per-section queries
   * stay fast. markedBy is set to the acting user's id only when they have a
   * row in the staff table — a school_admin with no staff row marks as NULL.
   */
  async markAttendance(
    dto: MarkAttendanceDto,
    markedByUserId?: string,
  ): Promise<Attendance> {
    const queryRunner = await this.queryRunner();

    // Resolve the student's current section for the denormalized column.
    const studentRows = (await queryRunner.query(
      `SELECT "sectionId" FROM students WHERE id = $1`,
      [dto.studentId],
    )) as Array<{ sectionId: string | null }>;
    if (!studentRows[0]) {
      throw new NotFoundException(`Student with id ${dto.studentId} not found`);
    }

    // markedBy is an FK to staff.id — only populated when the acting user
    // actually has a staff row; otherwise left NULL.
    let markedBy: string | null = null;
    if (markedByUserId) {
      const staffRows = (await queryRunner.query(
        `SELECT id FROM staff WHERE id = $1`,
        [markedByUserId],
      )) as Array<{ id: string }>;
      if (staffRows[0]) {
        markedBy = markedByUserId;
      }
    }

    try {
      const rows = (await queryRunner.query(
        `INSERT INTO attendance
           ("studentId", "sectionId", date, status, "markedBy", notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ("studentId", date)
         DO UPDATE SET
           "sectionId" = EXCLUDED."sectionId",
           status = EXCLUDED.status,
           "markedBy" = EXCLUDED."markedBy",
           notes = COALESCE(EXCLUDED.notes, attendance.notes),
           "updatedAt" = now()
         RETURNING *`,
        [
          dto.studentId,
          studentRows[0].sectionId,
          dto.date,
          dto.status,
          markedBy,
          dto.notes ?? null,
        ],
      )) as Attendance[];
      return rows[0];
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        // Student deleted between the existence check and the INSERT.
        throw new NotFoundException(
          `Student with id ${dto.studentId} not found`,
        );
      }
      throw error;
    }
  }

  /** All attendance records for a section on a given date. */
  async findByDate(
    sectionId: string,
    date: string,
  ): Promise<AttendanceWithStudent[]> {
    await this.assertSectionExists(sectionId);
    const queryRunner = await this.queryRunner();
    return (await queryRunner.query(
      `SELECT a.*, s."firstName", s."lastName"
       FROM attendance a
       JOIN students s ON s.id = a."studentId"
       WHERE a."sectionId" = $1 AND a.date = $2
       ORDER BY s."lastName" ASC, s."firstName" ASC`,
      [sectionId, date],
    )) as AttendanceWithStudent[];
  }

  /** A student's attendance history, paginated, optionally date-filtered. */
  async findByStudent(
    studentId: string,
    page = 1,
    limit = 10,
    startDate?: string,
    endDate?: string,
  ): Promise<{
    data: Attendance[];
    total: number;
    page: number;
    limit: number;
  }> {
    const queryRunner = await this.queryRunner();
    const offset = (page - 1) * limit;

    const conditions: string[] = ['"studentId" = $1'];
    const params: unknown[] = [studentId];
    if (startDate) {
      params.push(startDate);
      conditions.push(`date >= $${params.length}`);
    }
    if (endDate) {
      params.push(endDate);
      conditions.push(`date <= $${params.length}`);
    }
    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countRows = (await queryRunner.query(
      `SELECT COUNT(*)::int AS total FROM attendance ${whereClause}`,
      params,
    )) as Array<{ total: number }>;

    const data = (await queryRunner.query(
      `SELECT * FROM attendance ${whereClause}
       ORDER BY date DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    )) as Attendance[];

    return {
      data,
      total: countRows[0]?.total ?? 0,
      page,
      limit,
    };
  }

  /**
   * Per-student counts of present/absent/late/excused for a section over a
   * date range. Students in the section with no records appear with 0 counts,
   * which is useful for reports.
   */
  async getAttendanceSummary(
    sectionId: string,
    startDate: string,
    endDate: string,
  ): Promise<AttendanceSummaryRow[]> {
    await this.assertSectionExists(sectionId);
    const queryRunner = await this.queryRunner();
    return (await queryRunner.query(
      `SELECT
         s.id AS "studentId",
         s."firstName",
         s."lastName",
         COUNT(*) FILTER (WHERE a.status = 'present')::int AS present,
         COUNT(*) FILTER (WHERE a.status = 'absent')::int AS absent,
         COUNT(*) FILTER (WHERE a.status = 'late')::int AS late,
         COUNT(*) FILTER (WHERE a.status = 'excused')::int AS excused
       FROM students s
       LEFT JOIN attendance a
         ON a."studentId" = s.id
        AND a."sectionId" = $1
        AND a.date BETWEEN $2 AND $3
       WHERE s."sectionId" = $1 AND s.status <> 'inactive'
       GROUP BY s.id, s."firstName", s."lastName"
       ORDER BY s."lastName" ASC, s."firstName" ASC`,
      [sectionId, startDate, endDate],
    )) as AttendanceSummaryRow[];
  }

  private isForeignKeyViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === '23503'
    );
  }
}
