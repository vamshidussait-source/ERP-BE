import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * Tenant-scoped AnnouncementRead entity.
 * Lives inside each tenant's own schema (not public).
 * Queried via TenantConnectionService's queryRunner with search_path set.
 *
 * One row per (announcement, user) recording when that user read the
 * announcement. Unique constraint makes markAsRead idempotent.
 */
@Entity({ name: 'announcement_reads' })
@Unique(['announcementId', 'userId'])
@Index('IDX_announcement_reads_userId', ['userId'])
export class AnnouncementRead {
  @ApiProperty({
    description: 'Unique read-receipt identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Announcement that was read (FK to announcements.id, cascades on delete)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @Column({ type: 'uuid' })
  announcementId: string;

  @ApiProperty({
    description: 'User who read the announcement (FK to users.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @Column({ type: 'uuid' })
  userId: string;

  @ApiProperty({ description: 'Timestamp when the announcement was read' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  readAt: Date;
}
