import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AnnouncementAudienceType {
  AllStaff = 'all_staff',
  AllParents = 'all_parents',
  AllStudents = 'all_students',
  SpecificSections = 'specific_sections',
}

export enum AnnouncementPriority {
  Normal = 'normal',
  Important = 'important',
  Urgent = 'urgent',
}

export enum AnnouncementStatus {
  Draft = 'draft',
  Scheduled = 'scheduled',
  Sent = 'sent',
}

/**
 * Tenant-scoped Announcement entity.
 * Lives inside each tenant's own schema (not public).
 * Queried via TenantConnectionService's queryRunner with search_path set.
 *
 * Lifecycle: draft → scheduled → sent. Only sent announcements ever appear
 * in a non-admin role's feed (draft-gating mirrors ProgressReportsService).
 */
@Entity({ name: 'announcements' })
export class Announcement {
  @ApiProperty({
    description: 'Unique announcement identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Announcement title', example: 'Sports Day' })
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @ApiProperty({
    description: 'Announcement body (free-text)',
    example: 'Annual Sports Day is on October 12th. Parents are welcome.',
  })
  @Column({ type: 'text' })
  message: string;

  @ApiProperty({
    description:
      "Audience this announcement targets — 'all_staff' | 'all_parents' | " +
      "'all_students' | 'specific_sections'. When specific_sections, only " +
      'students and parents associated with audienceSectionIds are targeted ' +
      '(staff always see everything).',
    enum: AnnouncementAudienceType,
    example: AnnouncementAudienceType.AllParents,
  })
  @Column({ type: 'varchar', length: 30 })
  audienceType: AnnouncementAudienceType;

  @ApiProperty({
    description:
      'Section IDs targeted when audienceType is specific_sections (ignored otherwise)',
    example: ['f47ac10b-58cc-4372-a567-0e02b2c3d479'],
    nullable: true,
    type: [String],
  })
  @Column({ type: 'uuid', array: true, nullable: true })
  audienceSectionIds: string[] | null;

  @ApiProperty({
    description: "Priority — 'normal' | 'important' | 'urgent'",
    enum: AnnouncementPriority,
    example: AnnouncementPriority.Normal,
  })
  @Column({ type: 'varchar', length: 20, default: AnnouncementPriority.Normal })
  priority: AnnouncementPriority;

  @ApiProperty({
    description:
      "Status — 'draft' | 'scheduled' | 'sent'. Draft/scheduled are invisible " +
      'to every non-admin role.',
    enum: AnnouncementStatus,
    example: AnnouncementStatus.Draft,
  })
  @Column({ type: 'varchar', length: 20, default: AnnouncementStatus.Draft })
  status: AnnouncementStatus;

  @ApiProperty({
    description:
      'When the announcement is scheduled to go out (optional; informational ' +
      'in v1 — publishing is still a manual action)',
    nullable: true,
  })
  @Column({ type: 'timestamp with time zone', nullable: true })
  scheduledFor: Date | null;

  @ApiProperty({
    description: 'When the announcement was actually sent (null until sent)',
    nullable: true,
  })
  @Column({ type: 'timestamp with time zone', nullable: true })
  sentAt: Date | null;

  @ApiProperty({
    description: 'Staff member who authored this announcement (FK to staff.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  createdByStaffId: string | null;

  @ApiProperty({ description: 'Timestamp when the record was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({ description: 'Timestamp when the record was last updated' })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
