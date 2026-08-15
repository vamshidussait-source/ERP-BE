import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionService } from '../tenants/tenant-connection.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { Section } from './section.entity';

@Injectable()
export class SectionsService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  /**
   * Returns a query runner scoped to the current tenant schema via search_path.
   * All queries against the sections table must go through this.
   */
  private async queryRunner(): Promise<QueryRunner> {
    return this.tenantConnectionService.getQueryRunner();
  }

  private async assertClassExists(classId: string): Promise<void> {
    const queryRunner = await this.queryRunner();
    const classRows = (await queryRunner.query(
      `SELECT id FROM classes WHERE id = $1`,
      [classId],
    )) as Array<{ id: string }>;
    if (!classRows[0]) {
      throw new NotFoundException(`Class with id ${classId} not found`);
    }
  }

  async create(
    classId: string,
    createSectionDto: CreateSectionDto,
  ): Promise<Section> {
    await this.assertClassExists(classId);
    const queryRunner = await this.queryRunner();

    try {
      const rows = (await queryRunner.query(
        `INSERT INTO sections ("classId", name, capacity)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [classId, createSectionDto.name, createSectionDto.capacity ?? null],
      )) as Section[];
      return rows[0];
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `A section named "${createSectionDto.name}" already exists in class ${classId}`,
        );
      }
      if (this.isForeignKeyViolation(error)) {
        // Class deleted between the existence check and the INSERT.
        throw new NotFoundException(`Class with id ${classId} not found`);
      }
      throw error;
    }
  }

  async findAllByClass(classId: string): Promise<Section[]> {
    await this.assertClassExists(classId);
    const queryRunner = await this.queryRunner();
    return (await queryRunner.query(
      `SELECT * FROM sections WHERE "classId" = $1 ORDER BY name ASC`,
      [classId],
    )) as Section[];
  }

  async findOne(id: string): Promise<Section> {
    const queryRunner = await this.queryRunner();
    const rows = (await queryRunner.query(
      `SELECT * FROM sections WHERE id = $1`,
      [id],
    )) as Section[];
    if (!rows[0]) {
      throw new NotFoundException(`Section with id ${id} not found`);
    }
    return rows[0];
  }

  async update(
    id: string,
    updateSectionDto: UpdateSectionDto,
  ): Promise<Section> {
    const existing = await this.findOne(id);

    const assignments: ReadonlyArray<readonly [string, unknown]> = [
      ['name', updateSectionDto.name],
      ['capacity', updateSectionDto.capacity],
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
      const queryRunner = await this.queryRunner();
      const [rows] = (await queryRunner.query(
        `UPDATE sections SET ${setClauses.join(', ')}
         WHERE id = $${setClauses.length}
         RETURNING *`,
        [...values, id],
      )) as [Section[], number];
      return rows[0];
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `A section named "${updateSectionDto.name}" already exists in this class`,
        );
      }
      throw error;
    }
  }

  /**
   * Hard delete. Blocked with a ConflictException when students are still
   * assigned to this section (students become unassigned, never deleted).
   */
  async remove(id: string): Promise<Section> {
    const queryRunner = await this.queryRunner();

    // Prevent deletion if any active students are assigned to this section.
    // Soft-deleted (inactive) students don't block deletion — they're
    // effectively unassigned.
    const studentCount = (await queryRunner.query(
      `SELECT COUNT(*)::int AS total FROM students
       WHERE "sectionId" = $1 AND status <> 'inactive'`,
      [id],
    )) as Array<{ total: number }>;
    if (studentCount[0]?.total > 0) {
      throw new ConflictException(
        `Cannot delete section ${id}: it still has ${studentCount[0].total} student(s) assigned. Unassign them first.`,
      );
    }

    const [rows] = (await queryRunner.query(
      `DELETE FROM sections WHERE id = $1 RETURNING *`,
      [id],
    )) as [Section[], number];
    if (!rows[0]) {
      throw new NotFoundException(`Section with id ${id} not found`);
    }
    return rows[0];
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
