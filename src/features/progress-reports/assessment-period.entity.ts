import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Tenant-scoped AssessmentPeriod entity.
 * Lives inside each tenant's own schema (not public).
 * Queried via TenantConnectionService's queryRunner with search_path set.
 *
 * Defines the reporting periods for a school (e.g. "Term 1", "Half-Yearly",
 * "Term 2", "Annual"). Different boards/schools use different naming
 * conventions, so this is a free-form admin-configurable list rather than
 * a fixed enum.
 */
@Entity({ name: 'assessment_periods' })
@Unique(['name', 'academicYear'])
export class AssessmentPeriod {
  @ApiProperty({
    description: 'Unique assessment period identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description:
      'Period name (e.g. "Term 1", "Half-Yearly", "Term 2", "Annual")',
    example: 'Term 1',
  })
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @ApiProperty({
    description: 'Academic year (e.g. "2026-27")',
    example: '2026-27',
  })
  @Column({ type: 'varchar', length: 20 })
  academicYear: string;

  @ApiProperty({
    description: 'Period start date (ISO 8601 date)',
    example: '2026-04-01',
  })
  @Column({ type: 'date' })
  startDate: string;

  @ApiProperty({
    description: 'Period end date (ISO 8601 date)',
    example: '2026-09-30',
  })
  @Column({ type: 'date' })
  endDate: string;

  @ApiProperty({ description: 'Timestamp when the record was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({ description: 'Timestamp when the record was last updated' })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
