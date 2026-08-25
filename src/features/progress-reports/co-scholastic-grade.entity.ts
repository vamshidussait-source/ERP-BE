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
 * Tenant-scoped CoScholasticGrade entity.
 * Lives inside each tenant's own schema (not public).
 * Queried via TenantConnectionService's queryRunner with search_path set.
 *
 * Co-scholastic areas (Discipline, Work Education, Art Education,
 * Health & Physical Education) are graded with simple letter grades
 * (A, B, C, etc.) — not numeric marks — matching CBSE/State-board
 * conventions. The list of areas is school-admin-configurable, not
 * hardcoded as an enum.
 */
@Entity({ name: 'co_scholastic_grades' })
@Unique(['progressReportId', 'area'])
export class CoScholasticGrade {
  @ApiProperty({
    description: 'Unique co-scholastic grade identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description:
      'Progress report this grade belongs to (FK to progress_reports.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @Column({ type: 'uuid' })
  progressReportId: string;

  @ApiProperty({
    description:
      'Co-scholastic area name (e.g. "Discipline", "Work Education", "Art Education", "Health & Physical Education")',
    example: 'Discipline',
  })
  @Column({ type: 'varchar', length: 255 })
  area: string;

  @ApiProperty({
    description: 'Letter grade for this area (e.g. "A", "B", "C")',
    example: 'A',
  })
  @Column({ type: 'varchar', length: 10 })
  grade: string;

  @ApiProperty({ description: 'Timestamp when the record was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({ description: 'Timestamp when the record was last updated' })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
