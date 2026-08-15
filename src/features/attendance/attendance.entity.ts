import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export enum AttendanceStatus {
  Present = 'present',
  Absent = 'absent',
  Late = 'late',
  Excused = 'excused',
}

/**
 * Tenant-scoped Attendance entity.
 * Lives inside each tenant's own schema (not public).
 * Queried via TenantConnectionService's queryRunner with search_path set.
 *
 * One record per student per day (enforced by the unique constraint on
 * (studentId, date)). sectionId is denormalized from the student so
 * per-section queries don't need a JOIN.
 */
@Entity({ name: 'attendance' })
@Unique(['studentId', 'date'])
export class Attendance {
  @ApiProperty({
    description: 'Unique attendance record identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Student this record belongs to (foreign key to students.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @Column({ type: 'uuid' })
  studentId: string;

  @ApiProperty({
    description:
      'Section at the time of marking (denormalized from students.sectionId, foreign key to sections.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  sectionId: string | null;

  @ApiProperty({
    description: 'Attendance date (ISO 8601 date, YYYY-MM-DD)',
    example: '2026-08-01',
  })
  @Column({ type: 'date' })
  date: string;

  @ApiProperty({
    description: 'Attendance status',
    enum: AttendanceStatus,
    example: AttendanceStatus.Present,
  })
  @Column({ type: 'varchar', length: 20 })
  status: AttendanceStatus;

  @ApiProperty({
    description:
      'Staff member who marked this record (foreign key to staff.id; null when marked by a school_admin who has no staff row)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  markedBy: string | null;

  @ApiProperty({
    description: 'Optional note (e.g. reason for absence)',
    example: 'Doctor appointment',
    nullable: true,
  })
  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @ApiProperty({ description: 'Timestamp when the record was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({ description: 'Timestamp when the record was last updated' })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
