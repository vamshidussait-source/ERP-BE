import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionService } from '../tenants/tenant-connection.service';
import { SchoolClass } from './class.entity';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

@Injectable()
export class ClassesService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  /**
   * Returns a query runner scoped to the current tenant schema via search_path.
   * All queries against the classes/sections tables must go through this.
   */
  private async queryRunner(): Promise<QueryRunner> {
    return this.tenantConnectionService.getQueryRunner();
  }

  async create(createClassDto: CreateClassDto): Promise<SchoolClass> {
    const queryRunner = await this.queryRunner();

    try {
      const rows = (await queryRunner.query(
        `INSERT INTO classes (name, "displayOrder")
         VALUES ($1, $2)
         RETURNING *`,
        [createClassDto.name, createClassDto.displayOrder],
      )) as SchoolClass[];
      return rows[0];
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `A class with name "${createClassDto.name}" already exists`,
        );
      }
      throw error;
    }
  }

  async findAll(): Promise<SchoolClass[]> {
    const queryRunner = await this.queryRunner();
    return (await queryRunner.query(
      `SELECT * FROM classes ORDER BY "displayOrder" ASC, name ASC`,
    )) as SchoolClass[];
  }

  async findOne(id: string): Promise<SchoolClass> {
    const queryRunner = await this.queryRunner();
    const rows = (await queryRunner.query(
      `SELECT * FROM classes WHERE id = $1`,
      [id],
    )) as SchoolClass[];
    if (!rows[0]) {
      throw new NotFoundException(`Class with id ${id} not found`);
    }
    return rows[0];
  }

  async update(
    id: string,
    updateClassDto: UpdateClassDto,
  ): Promise<SchoolClass> {
    const existing = await this.findOne(id);

    const assignments: ReadonlyArray<readonly [string, unknown]> = [
      ['name', updateClassDto.name],
      ['displayOrder', updateClassDto.displayOrder],
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
        `UPDATE classes SET ${setClauses.join(', ')}
         WHERE id = $${setClauses.length}
         RETURNING *`,
        [...values, id],
      )) as [SchoolClass[], number];
      return rows[0];
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `A class with name "${updateClassDto.name}" already exists`,
        );
      }
      throw error;
    }
  }

  /**
   * Hard delete. Blocked with a ConflictException when the class still has
   * sections (the FK ON DELETE RESTRICT in the schema is the DB-level backstop).
   */
  async remove(id: string): Promise<SchoolClass> {
    const queryRunner = await this.queryRunner();

    const sectionCount = (await queryRunner.query(
      `SELECT COUNT(*)::int AS total FROM sections WHERE "classId" = $1`,
      [id],
    )) as Array<{ total: number }>;
    if (sectionCount[0]?.total > 0) {
      throw new ConflictException(
        `Cannot delete class ${id}: it still has ${sectionCount[0].total} section(s). Delete or reassign its sections first.`,
      );
    }

    try {
      const [rows] = (await queryRunner.query(
        `DELETE FROM classes WHERE id = $1 RETURNING *`,
        [id],
      )) as [SchoolClass[], number];
      if (!rows[0]) {
        throw new NotFoundException(`Class with id ${id} not found`);
      }
      return rows[0];
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          `Cannot delete class ${id}: it still has sections referencing it. Delete or reassign its sections first.`,
        );
      }
      throw error;
    }
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
