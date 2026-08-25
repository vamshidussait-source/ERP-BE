import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionService } from '../tenants/tenant-connection.service';
import { CreateGradeBandDto } from './dto/create-grade-band.dto';
import { CreateGradingScaleDto } from './dto/create-grading-scale.dto';
import { UpdateGradeBandDto } from './dto/update-grade-band.dto';
import { UpdateGradingScaleDto } from './dto/update-grading-scale.dto';
import { GradeBand } from './grade-band.entity';
import { GradingScale } from './grading-scale.entity';

export interface GradingScaleDetail extends GradingScale {
  bands: GradeBand[];
}

@Injectable()
export class GradingScalesService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  private async queryRunner(): Promise<QueryRunner> {
    return this.tenantConnectionService.getQueryRunner();
  }

  // ── Grading Scale CRUD ──────────────────────────────────────────

  async create(dto: CreateGradingScaleDto): Promise<GradingScale> {
    const qr = await this.queryRunner();

    // If this scale is marked default, unset any existing default first.
    if (dto.isDefault) {
      await qr.query(
        `UPDATE grading_scales SET "isDefault" = false, "updatedAt" = now() WHERE "isDefault" = true`,
      );
    }

    const rows = (await qr.query(
      `INSERT INTO grading_scales (name, "isDefault")
       VALUES ($1, $2)
       RETURNING *`,
      [dto.name, dto.isDefault ?? false],
    )) as GradingScale[];
    return rows[0];
  }

  async findAll(): Promise<GradingScale[]> {
    const qr = await this.queryRunner();
    return (await qr.query(
      `SELECT * FROM grading_scales ORDER BY name ASC`,
    )) as GradingScale[];
  }

  async findOne(id: string): Promise<GradingScaleDetail> {
    const qr = await this.queryRunner();
    const rows = (await qr.query(
      `SELECT * FROM grading_scales WHERE id = $1`,
      [id],
    )) as GradingScale[];
    if (!rows[0]) {
      throw new NotFoundException(`Grading scale with id ${id} not found`);
    }
    const bands = (await qr.query(
      `SELECT * FROM grade_bands WHERE "gradingScaleId" = $1
       ORDER BY "minPercentage" DESC`,
      [id],
    )) as GradeBand[];
    return { ...rows[0], bands };
  }

  async update(
    id: string,
    dto: UpdateGradingScaleDto,
  ): Promise<GradingScale> {
    await this.findOne(id);
    const qr = await this.queryRunner();

    if (dto.isDefault) {
      await qr.query(
        `UPDATE grading_scales SET "isDefault" = false, "updatedAt" = now() WHERE "isDefault" = true AND id != $1`,
        [id],
      );
    }

    const assignments: ReadonlyArray<readonly [string, unknown]> = [
      ['name', dto.name],
      ['isDefault', dto.isDefault],
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
      const result = await this.findOne(id);
      return result;
    }

    setClauses.push('"updatedAt" = now()');

    const [rows] = (await qr.query(
      `UPDATE grading_scales SET ${setClauses.join(', ')}
       WHERE id = $${setClauses.length}
       RETURNING *`,
      [...values, id],
    )) as [GradingScale[], number];
    return rows[0];
  }

  async remove(id: string): Promise<void> {
    const qr = await this.queryRunner();
    const existing = (await qr.query(
      `SELECT id FROM grading_scales WHERE id = $1`,
      [id],
    )) as Array<{ id: string }>;
    if (!existing[0]) {
      throw new NotFoundException(`Grading scale with id ${id} not found`);
    }
    await qr.query(`DELETE FROM grading_scales WHERE id = $1`, [id]);
  }

  // ── Grade Band CRUD (nested under grading scale) ────────────────

  async addBand(
    scaleId: string,
    dto: CreateGradeBandDto,
  ): Promise<GradeBand> {
    await this.findOne(scaleId); // ensure scale exists
    const qr = await this.queryRunner();
    const rows = (await qr.query(
      `INSERT INTO grade_bands ("gradingScaleId", "minPercentage", "maxPercentage", grade)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [scaleId, dto.minPercentage, dto.maxPercentage, dto.grade],
    )) as GradeBand[];
    return rows[0];
  }

  async getBands(scaleId: string): Promise<GradeBand[]> {
    await this.findOne(scaleId); // ensure scale exists
    const qr = await this.queryRunner();
    return (await qr.query(
      `SELECT * FROM grade_bands WHERE "gradingScaleId" = $1
       ORDER BY "minPercentage" DESC`,
      [scaleId],
    )) as GradeBand[];
  }

  async updateBand(
    scaleId: string,
    bandId: string,
    dto: UpdateGradeBandDto,
  ): Promise<GradeBand> {
    await this.findOne(scaleId); // ensure scale exists
    const qr = await this.queryRunner();

    const existing = (await qr.query(
      `SELECT * FROM grade_bands WHERE id = $1 AND "gradingScaleId" = $2`,
      [bandId, scaleId],
    )) as GradeBand[];
    if (!existing[0]) {
      throw new NotFoundException(
        `Grade band with id ${bandId} not found in scale ${scaleId}`,
      );
    }

    const assignments: ReadonlyArray<readonly [string, unknown]> = [
      ['minPercentage', dto.minPercentage],
      ['maxPercentage', dto.maxPercentage],
      ['grade', dto.grade],
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
      return existing[0];
    }

    const [rows] = (await qr.query(
      `UPDATE grade_bands SET ${setClauses.join(', ')}
       WHERE id = $${setClauses.length + 1} AND "gradingScaleId" = $${setClauses.length + 2}
       RETURNING *`,
      [...values, bandId, scaleId],
    )) as [GradeBand[], number];
    return rows[0];
  }

  async removeBand(scaleId: string, bandId: string): Promise<void> {
    await this.findOne(scaleId); // ensure scale exists
    const qr = await this.queryRunner();
    const existing = (await qr.query(
      `SELECT id FROM grade_bands WHERE id = $1 AND "gradingScaleId" = $2`,
      [bandId, scaleId],
    )) as Array<{ id: string }>;
    if (!existing[0]) {
      throw new NotFoundException(
        `Grade band with id ${bandId} not found in scale ${scaleId}`,
      );
    }
    await qr.query(`DELETE FROM grade_bands WHERE id = $1`, [bandId]);
  }

  // ── Helpers ─────────────────────────────────────────────────────

  /**
   * Resolves the effective grading scale for an exam: uses the exam's
   * gradingScaleId if set, otherwise falls back to the school's default.
   * Returns the bands ordered from highest minPercentage to lowest.
   */
  async resolveGradingScale(
    gradingScaleId: string | null,
  ): Promise<{ scale: GradingScale; bands: GradeBand[] } | null> {
    const qr = await this.queryRunner();

    let scaleId = gradingScaleId;

    if (!scaleId) {
      // Fall back to the default scale.
      const defaultRows = (await qr.query(
        `SELECT id FROM grading_scales WHERE "isDefault" = true LIMIT 1`,
      )) as Array<{ id: string }>;
      scaleId = defaultRows[0]?.id ?? null;
    }

    if (!scaleId) {
      return null;
    }

    const scaleRows = (await qr.query(
      `SELECT * FROM grading_scales WHERE id = $1`,
      [scaleId],
    )) as GradingScale[];
    if (!scaleRows[0]) {
      return null;
    }

    const bands = (await qr.query(
      `SELECT * FROM grade_bands WHERE "gradingScaleId" = $1
       ORDER BY "minPercentage" DESC`,
      [scaleId],
    )) as GradeBand[];

    return { scale: scaleRows[0], bands };
  }

  /**
   * Given a percentage and an ordered list of grade bands (descending by
   * minPercentage), returns the matching grade or null if no band matches.
   */
  lookupGrade(
    percentage: number,
    bands: GradeBand[],
  ): string | null {
    for (const band of bands) {
      const min = Number(band.minPercentage);
      const max = Number(band.maxPercentage);
      if (percentage >= min && percentage <= max) {
        return band.grade;
      }
    }
    return null;
  }
}
