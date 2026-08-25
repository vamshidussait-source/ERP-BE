import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Tenant-scoped GradeBand entity.
 * Lives inside each tenant's own schema (not public).
 *
 * Defines a single grade band within a grading scale. Each band maps a
 * percentage range to a letter grade (e.g. 91–100 = "A1", 81–90 = "A2").
 * Bands are fully configurable — not hardcoded — to accommodate CBSE,
 * State-board, and other grading conventions.
 */
@Entity({ name: 'grade_bands' })
export class GradeBand {
  @ApiProperty({
    description: 'Unique grade band identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Parent grading scale (FK to grading_scales.id, ON DELETE CASCADE)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @Column({ type: 'uuid' })
  gradingScaleId: string;

  @ApiProperty({
    description: 'Minimum percentage for this band (inclusive)',
    example: 91,
  })
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  minPercentage: number;

  @ApiProperty({
    description: 'Maximum percentage for this band (inclusive)',
    example: 100,
  })
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  maxPercentage: number;

  @ApiProperty({
    description: 'Letter grade for this band (e.g. "A1", "A2", "B1")',
    example: 'A1',
  })
  @Column({ type: 'varchar', length: 10 })
  grade: string;

  @ApiProperty({ description: 'Timestamp when the record was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
