import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionService } from '../tenants/tenant-connection.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { Subject } from './subject.entity';

@Injectable()
export class SubjectsService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  private async queryRunner(): Promise<QueryRunner> {
    return this.tenantConnectionService.getQueryRunner();
  }

  async create(dto: CreateSubjectDto): Promise<Subject> {
    const qr = await this.queryRunner();
    try {
      const rows = (await qr.query(
        `INSERT INTO subjects (name) VALUES ($1) RETURNING *`,
        [dto.name],
      )) as Subject[];
      return rows[0];
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `A subject named "${dto.name}" already exists`,
        );
      }
      throw error;
    }
  }

  async findAll(): Promise<Subject[]> {
    const qr = await this.queryRunner();
    return (await qr.query(
      `SELECT * FROM subjects ORDER BY name ASC`,
    )) as Subject[];
  }

  async findOne(id: string): Promise<Subject> {
    const qr = await this.queryRunner();
    const rows = (await qr.query(
      `SELECT * FROM subjects WHERE id = $1`,
      [id],
    )) as Subject[];
    if (!rows[0]) {
      throw new NotFoundException(`Subject with id ${id} not found`);
    }
    return rows[0];
  }

  async update(id: string, dto: UpdateSubjectDto): Promise<Subject> {
    await this.findOne(id);
    const qr = await this.queryRunner();

    if (dto.name !== undefined) {
    try {
      const [rows] = (await qr.query(
        `UPDATE subjects SET name = $1, "updatedAt" = now()
         WHERE id = $2
         RETURNING *`,
        [dto.name, id],
      )) as [Subject[], number];
      return rows[0];
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          throw new ConflictException(
            `A subject named "${dto.name}" already exists`,
          );
        }
        throw error;
      }
    }

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const qr = await this.queryRunner();
    const existing = (await qr.query(
      `SELECT id FROM subjects WHERE id = $1`,
      [id],
    )) as Array<{ id: string }>;
    if (!existing[0]) {
      throw new NotFoundException(`Subject with id ${id} not found`);
    }
    await qr.query(`DELETE FROM subjects WHERE id = $1`, [id]);
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === '23505'
    );
  }
}
