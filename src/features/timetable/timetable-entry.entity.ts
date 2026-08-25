import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export enum DayOfWeek {
  Monday = 'monday',
  Tuesday = 'tuesday',
  Wednesday = 'wednesday',
  Thursday = 'thursday',
  Friday = 'friday',
  Saturday = 'saturday',
}

/**
 * Tenant-scoped TimetableEntry entity.
 * Lives inside each tenant's own schema (not public).
 * Queried via TenantConnectionService's queryRunner with search_path set.
 *
 * One record per section+day+period slot. The timetable is a fully dynamic,
 * editable table — entries can be freely created, modified, or moved to any
 * day/period combination by a school_admin at any time.
 */
@Entity({ name: 'timetable' })
@Unique(['sectionId', 'dayOfWeek', 'periodNumber'])
export class TimetableEntry {
  @ApiProperty({
    description: 'Unique timetable entry identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Section this entry belongs to (FK to sections.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @Column({ type: 'uuid' })
  sectionId: string;

  @ApiProperty({
    description: 'Day of the week',
    enum: DayOfWeek,
    example: DayOfWeek.Monday,
  })
  @Column({ type: 'varchar', length: 20 })
  dayOfWeek: DayOfWeek;

  @ApiProperty({
    description: 'Period number (1-based)',
    example: 1,
  })
  @Column({ type: 'integer' })
  periodNumber: number;

  @ApiProperty({
    description: 'Subject name',
    example: 'Mathematics',
  })
  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @ApiProperty({
    description: 'Staff member teaching this period (FK to staff.id, nullable)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  staffId: string | null;

  @ApiProperty({
    description: 'Period start time (HH:MM)',
    example: '08:00',
  })
  @Column({ type: 'time' })
  startTime: string;

  @ApiProperty({
    description: 'Period end time (HH:MM)',
    example: '08:45',
  })
  @Column({ type: 'time' })
  endTime: string;

  @ApiProperty({ description: 'Timestamp when the record was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({ description: 'Timestamp when the record was last updated' })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
