import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionService } from '../tenants/tenant-connection.service';
import { AssessmentPeriod } from './assessment-period.entity';
import { CreateAssessmentPeriodDto } from './dto/create-assessment-period.dto';
import { UpdateAssessmentPeriodDto } from './dto/update-assessment-period.dto';

@Injectable()
export class AssessmentPeriodsService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  private async queryRunner(): Promise<QueryRunner> {
    return this.tenantConnectionService.getQueryRunner();
  }

  async create(dto: CreateAssessmentPeriodDto): Promise<AssessmentPeriod> {
    const qr = await this.queryRunner();
    try {
      const rows = (await qr.query(
        `INSERT INTO assessment_periods (name, "academicYear", "startDate", "endDate")
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [dto.name, dto.academicYear, dto.startDate, dto.endDate],
      )) as AssessmentPeriod[];
      return rows[0];
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `An assessment period named "${dto.name}" already exists for academic year "${dto.academicYear}"`,
        );
      }
      throw error;
    }
  }

  async findAll(): Promise<AssessmentPeriod[]> {
    const qr = await this.queryRunner();
    return (await qr.query(
      `SELECT * FROM assessment_periods ORDER BY "startDate" ASC`,
    )) as AssessmentPeriod[];
  }

  async findOne(id: string): Promise<AssessmentPeriod> {
    const qr = await this.queryRunner();
    const rows = (await qr.query(
      `SELECT * FROM assessment_periods WHERE id = $1`,
      [id],
    )) as AssessmentPeriod[];
    if (!rows[0]) {
      throw new NotFoundException(`Assessment period with id ${id} not found`);
    }
    return rows[0];
  }

  async update(
    id: string,
    dto: UpdateAssessmentPeriodDto,
  ): Promise<AssessmentPeriod> {
    await this.findOne(id); // ensure exists
    const qr = await this.queryRunner();

    const assignments: ReadonlyArray<readonly [string, unknown]> = [
      ['name', dto.name],
      ['academicYear', dto.academicYear],
      ['startDate', dto.startDate],
      ['endDate', dto.endDate],
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
      return this.findOne(id);
    }

    setClauses.push('"updatedAt" = now()');

    try {
      const [rows] = (await qr.query(
        `UPDATE assessment_periods SET ${setClauses.join(', ')}
         WHERE id = $${setClauses.length}
         RETURNING *`,
        [...values, id],
      )) as [AssessmentPeriod[], number];
      return rows[0];
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `An assessment period with the same name and academic year already exists`,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const qr = await this.queryRunner();
    const existing = (await qr.query(
      `SELECT id FROM assessment_periods WHERE id = $1`,
      [id],
    )) as Array<{ id: string }>;
    if (!existing[0]) {
      throw new NotFoundException(`Assessment period with id ${id} not found`);
    }
    await qr.query(`DELETE FROM assessment_periods WHERE id = $1`, [id]);
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === '23505'
    );
  }
}
