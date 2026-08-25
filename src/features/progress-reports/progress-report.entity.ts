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
 * Tenant-scoped ProgressReport entity.
 * Lives inside each tenant's own schema (not public).
 * Queried via TenantConnectionService's queryRunner with search_path set.
 *
 * One report per student per assessment period. Reports go through a
 * draft → published lifecycle: only published reports are visible to
 * parent and student roles.
 */
@Entity({ name: 'progress_reports' })
@Unique(['studentId', 'assessmentPeriodId'])
export class ProgressReport {
  @ApiProperty({
    description: 'Unique progress report identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Student this report belongs to (FK to students.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @Column({ type: 'uuid' })
  studentId: string;

  @ApiProperty({
    description:
      'Assessment period this report is for (FK to assessment_periods.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @Column({ type: 'uuid' })
  assessmentPeriodId: string;

  @ApiProperty({
    description: 'Class teacher remarks (free-text)',
    example: 'Grace is a diligent student who participates actively in class.',
    nullable: true,
  })
  @Column({ type: 'text', nullable: true })
  classTeacherRemarks: string | null;

  @ApiProperty({
    description:
      'Attendance percentage snapshot for this period (0–100, may be entered or calculated)',
    example: 95.5,
    nullable: true,
  })
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  attendancePercentage: number | null;

  @ApiProperty({
    description:
      'Staff member who prepared this report (FK to staff.id, nullable)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  preparedByStaffId: string | null;

  @ApiProperty({
    description:
      "Report status — 'draft' (visible only to admin/staff) or 'published' (visible to parents/students)",
    enum: ['draft', 'published'],
    example: 'draft',
  })
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: 'draft' | 'published';

  @ApiProperty({ description: 'Timestamp when the record was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({ description: 'Timestamp when the record was last updated' })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
