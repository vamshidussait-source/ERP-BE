import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionService } from '../tenants/tenant-connection.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { Staff, StaffStatus } from './staff.entity';

@Injectable()
export class StaffService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  /**
   * Returns a query runner scoped to the current tenant schema via search_path.
   * All queries against the staff table must go through this.
   */
  private async queryRunner(): Promise<QueryRunner> {
    return this.tenantConnectionService.getQueryRunner();
  }

  async create(createStaffDto: CreateStaffDto): Promise<Staff> {
    const queryRunner = await this.queryRunner();

    try {
      const rows = (await queryRunner.query(
        `INSERT INTO staff ("firstName", "lastName", email, phone, designation, "employeeId")
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          createStaffDto.firstName,
          createStaffDto.lastName,
          createStaffDto.email,
          createStaffDto.phone ?? null,
          createStaffDto.designation,
          createStaffDto.employeeId,
        ],
      )) as Staff[];
      return rows[0];
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `A staff member with email "${createStaffDto.email}" or employeeId "${createStaffDto.employeeId}" already exists`,
        );
      }
      throw error;
    }
  }

  async findAll(
    page = 1,
    limit = 10,
  ): Promise<{ data: Staff[]; total: number; page: number; limit: number }> {
    const queryRunner = await this.queryRunner();
    const offset = (page - 1) * limit;

    const countRows = (await queryRunner.query(
      `SELECT COUNT(*)::int AS total FROM staff`,
    )) as Array<{ total: number }>;
    const data = (await queryRunner.query(
      `SELECT * FROM staff
       ORDER BY "createdAt" DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    )) as Staff[];

    return { data, total: countRows[0]?.total ?? 0, page, limit };
  }

  async findOne(id: string): Promise<Staff> {
    const queryRunner = await this.queryRunner();
    const rows = (await queryRunner.query(`SELECT * FROM staff WHERE id = $1`, [
      id,
    ])) as Staff[];
    if (!rows[0]) {
      throw new NotFoundException(`Staff member with id ${id} not found`);
    }
    return rows[0];
  }

  async update(id: string, updateStaffDto: UpdateStaffDto): Promise<Staff> {
    const existing = await this.findOne(id);

    const assignments: ReadonlyArray<readonly [string, unknown]> = [
      ['firstName', updateStaffDto.firstName],
      ['lastName', updateStaffDto.lastName],
      ['email', updateStaffDto.email],
      ['phone', updateStaffDto.phone],
      ['designation', updateStaffDto.designation],
      ['employeeId', updateStaffDto.employeeId],
      ['status', updateStaffDto.status],
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
        `UPDATE staff SET ${setClauses.join(', ')}
         WHERE id = $${setClauses.length}
         RETURNING *`,
        [...values, id],
      )) as [Staff[], number];
      return rows[0];
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `A staff member with email "${updateStaffDto.email}" or employeeId "${updateStaffDto.employeeId}" already exists`,
        );
      }
      throw error;
    }
  }

  /**
   * Soft delete: sets status to 'inactive' rather than removing the row.
   */
  async softDelete(id: string): Promise<Staff> {
    const queryRunner = await this.queryRunner();
    const [rows] = (await queryRunner.query(
      `UPDATE staff SET status = $1, "updatedAt" = now()
       WHERE id = $2
       RETURNING *`,
      [StaffStatus.Inactive, id],
    )) as [Staff[], number];
    if (!rows[0]) {
      throw new NotFoundException(`Staff member with id ${id} not found`);
    }
    return rows[0];
  }

  /**
   * Returns the linkedStaffId for a given user, or null if the user
   * account has no staff record linked.
   */
  async getLinkedStaffId(userId: string): Promise<string | null> {
    const qr = await this.queryRunner();
    const rows = (await qr.query(
      `SELECT "linkedStaffId" FROM users WHERE id = $1`,
      [userId],
    )) as Array<{ linkedStaffId: string | null }>;
    return rows[0]?.linkedStaffId ?? null;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === '23505'
    );
  }
}
