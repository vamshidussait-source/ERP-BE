import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionService } from '../tenants/tenant-connection.service';
import { CreateTimetableEntryDto } from './dto/create-timetable-entry.dto';
import { UpdateTimetableEntryDto } from './dto/update-timetable-entry.dto';
import { TimetableEntry } from './timetable-entry.entity';

/** Timetable entry enriched with staff name for display. */
export interface TimetableEntryWithStaff extends TimetableEntry {
  staffFirstName: string | null;
  staffLastName: string | null;
}

@Injectable()
export class TimetableService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  /**
   * Returns a query runner scoped to the current tenant schema via search_path.
   * All queries against the timetable table must go through this.
   */
  private async queryRunner(): Promise<QueryRunner> {
    return this.tenantConnectionService.getQueryRunner();
  }

  /**
   * Creates a new timetable entry. This is the "dynamic scheduling" capability:
   * an admin can create a new period entry for any section/day/period at any time.
   * The timetable is a live, editable table of entries, freely addable/removable
   * as the school's schedule changes.
   */
  async createEntry(dto: CreateTimetableEntryDto): Promise<TimetableEntry> {
    const qr = await this.queryRunner();

    // Validate section exists.
    const sectionRows = (await qr.query(
      `SELECT id FROM sections WHERE id = $1`,
      [dto.sectionId],
    )) as Array<{ id: string }>;
    if (!sectionRows[0]) {
      throw new NotFoundException(`Section with id ${dto.sectionId} not found`);
    }

    // Validate staff exists if provided.
    if (dto.staffId) {
      const staffRows = (await qr.query(
        `SELECT id FROM staff WHERE id = $1`,
        [dto.staffId],
      )) as Array<{ id: string }>;
      if (!staffRows[0]) {
        throw new NotFoundException(`Staff member with id ${dto.staffId} not found`);
      }
    }

    try {
      const rows = (await qr.query(
        `INSERT INTO timetable
           ("sectionId", "dayOfWeek", "periodNumber", subject, "staffId", "startTime", "endTime")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          dto.sectionId,
          dto.dayOfWeek,
          dto.periodNumber,
          dto.subject,
          dto.staffId ?? null,
          dto.startTime,
          dto.endTime,
        ],
      )) as TimetableEntry[];
      return rows[0];
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `A timetable entry already exists for section ${dto.sectionId} on ${dto.dayOfWeek} period ${dto.periodNumber}`,
        );
      }
      if (this.isForeignKeyViolation(error)) {
        throw new NotFoundException(
          `Referenced section or staff member not found`,
        );
      }
      throw error;
    }
  }

  /**
   * Updates a timetable entry. Supports changing subject, staffId, startTime,
   * endTime, or even moving an entry to a different day/period. Re-validates
   * the unique constraint on update, handling the case where the update would
   * collide with an existing entry.
   */
  async updateEntry(
    id: string,
    dto: UpdateTimetableEntryDto,
  ): Promise<TimetableEntry> {
    const existing = await this.findOne(id);

    // Validate staff exists if being changed.
    if (dto.staffId !== undefined && dto.staffId !== null) {
      const qr = await this.queryRunner();
      const staffRows = (await qr.query(
        `SELECT id FROM staff WHERE id = $1`,
        [dto.staffId],
      )) as Array<{ id: string }>;
      if (!staffRows[0]) {
        throw new NotFoundException(`Staff member with id ${dto.staffId} not found`);
      }
    }

    // Validate section exists if being changed.
    if (dto.sectionId !== undefined) {
      const qr = await this.queryRunner();
      const sectionRows = (await qr.query(
        `SELECT id FROM sections WHERE id = $1`,
        [dto.sectionId],
      )) as Array<{ id: string }>;
      if (!sectionRows[0]) {
        throw new NotFoundException(`Section with id ${dto.sectionId} not found`);
      }
    }

    const assignments: ReadonlyArray<readonly [string, unknown]> = [
      ['sectionId', dto.sectionId],
      ['dayOfWeek', dto.dayOfWeek],
      ['periodNumber', dto.periodNumber],
      ['subject', dto.subject],
      ['staffId', dto.staffId],
      ['startTime', dto.startTime],
      ['endTime', dto.endTime],
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
      return existing;
    }

    setClauses.push('"updatedAt" = now()');

    try {
      const qr = await this.queryRunner();
      const [rows] = (await qr.query(
        `UPDATE timetable SET ${setClauses.join(', ')}
         WHERE id = $${setClauses.length}
         RETURNING *`,
        [...values, id],
      )) as [TimetableEntry[], number];
      return rows[0];
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const targetSection = dto.sectionId ?? existing.sectionId;
        const targetDay = dto.dayOfWeek ?? existing.dayOfWeek;
        const targetPeriod = dto.periodNumber ?? existing.periodNumber;
        throw new ConflictException(
          `A timetable entry already exists for section ${targetSection} on ${targetDay} period ${targetPeriod}`,
        );
      }
      if (this.isForeignKeyViolation(error)) {
        throw new NotFoundException(
          `Referenced section or staff member not found`,
        );
      }
      throw error;
    }
  }

  /**
   * Hard-deletes a timetable entry.
   */
  async deleteEntry(id: string): Promise<void> {
    const qr = await this.queryRunner();
    // Verify the entry exists first, then delete.
    const existing = (await qr.query(
      `SELECT id FROM timetable WHERE id = $1`,
      [id],
    )) as Array<{ id: string }>;
    if (!existing[0]) {
      throw new NotFoundException(`Timetable entry with id ${id} not found`);
    }
    await qr.query(`DELETE FROM timetable WHERE id = $1`, [id]);
  }

  /**
   * Returns a single timetable entry by id, enriched with staff names.
   */
  async findOne(id: string): Promise<TimetableEntry> {
    const qr = await this.queryRunner();
    const rows = (await qr.query(
      `SELECT t.*,
              s."firstName" AS "staffFirstName",
              s."lastName" AS "staffLastName"
       FROM timetable t
       LEFT JOIN staff s ON s.id = t."staffId"
       WHERE t.id = $1`,
      [id],
    )) as TimetableEntry[];
    if (!rows[0]) {
      throw new NotFoundException(`Timetable entry with id ${id} not found`);
    }
    return rows[0];
  }

  /**
   * Returns the full week's schedule (all 6 days) for a section,
   * ordered by dayOfWeek then periodNumber.
   */
  async getTimetableForSection(
    sectionId: string,
  ): Promise<TimetableEntryWithStaff[]> {
    const qr = await this.queryRunner();

    // Validate section exists.
    const sectionRows = (await qr.query(
      `SELECT id FROM sections WHERE id = $1`,
      [sectionId],
    )) as Array<{ id: string }>;
    if (!sectionRows[0]) {
      throw new NotFoundException(`Section with id ${sectionId} not found`);
    }

    return (await qr.query(
      `SELECT t.*,
              st."firstName" AS "staffFirstName",
              st."lastName" AS "staffLastName"
       FROM timetable t
       LEFT JOIN staff st ON st.id = t."staffId"
       WHERE t."sectionId" = $1
       ORDER BY
         CASE t."dayOfWeek"
           WHEN 'monday' THEN 1
           WHEN 'tuesday' THEN 2
           WHEN 'wednesday' THEN 3
           WHEN 'thursday' THEN 4
           WHEN 'friday' THEN 5
           WHEN 'saturday' THEN 6
         END,
         t."periodNumber" ASC`,
      [sectionId],
    )) as TimetableEntryWithStaff[];
  }

  /**
   * Returns everywhere a given staff member teaches across all sections,
   * for their personal schedule view.
   */
  async getTimetableForStaff(
    staffId: string,
  ): Promise<TimetableEntryWithStaff[]> {
    const qr = await this.queryRunner();

    return (await qr.query(
      `SELECT t.*,
              st."firstName" AS "staffFirstName",
              st."lastName" AS "staffLastName"
       FROM timetable t
       LEFT JOIN staff st ON st.id = t."staffId"
       WHERE t."staffId" = $1
       ORDER BY
         CASE t."dayOfWeek"
           WHEN 'monday' THEN 1
           WHEN 'tuesday' THEN 2
           WHEN 'wednesday' THEN 3
           WHEN 'thursday' THEN 4
           WHEN 'friday' THEN 5
           WHEN 'saturday' THEN 6
         END,
         t."periodNumber" ASC`,
      [staffId],
    )) as TimetableEntryWithStaff[];
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
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
