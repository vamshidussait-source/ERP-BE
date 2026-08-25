import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Tenant-scoped Exam entity.
 * Lives inside each tenant's own schema (not public).
 *
 * Represents an exam (e.g. "Unit Test 1", "Half-Yearly Exam"). Exams go
 * through a draft → published lifecycle: only published exams have their
 * marks visible to parent and student roles.
 *
 * An exam can optionally tie to an assessment period (term) already built
 * in Progress Reports, but isn't required to. It can also optionally
 * specify which grading scale to use — falling back to the school's
 * default scale if none is set.
 */
@Entity({ name: 'exams' })
export class Exam {
  @ApiProperty({
    description: 'Unique exam identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Exam name (e.g. "Unit Test 1", "Half-Yearly Exam")',
    example: 'Unit Test 1',
  })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({
    description:
      'Optional assessment period (FK to assessment_periods.id, ON DELETE SET NULL)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  assessmentPeriodId: string | null;

  @ApiProperty({
    description: 'Exam date (ISO 8601 date)',
    example: '2026-08-15',
  })
  @Column({ type: 'date' })
  examDate: string;

  @ApiProperty({
    description:
      "Exam status — 'draft' (visible only to admin/staff) or 'published' (visible to parents/students)",
    enum: ['draft', 'published'],
    example: 'draft',
  })
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: 'draft' | 'published';

  @ApiProperty({
    description:
      'Optional grading scale (FK to grading_scales.id, ON DELETE SET NULL). Falls back to the school default if null.',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  gradingScaleId: string | null;

  @ApiProperty({ description: 'Timestamp when the record was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({ description: 'Timestamp when the record was last updated' })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
