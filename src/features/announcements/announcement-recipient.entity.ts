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
 * Tenant-scoped AnnouncementRecipient join entity.
 * Lives inside each tenant's own schema (not public).
 *
 * One row per (announcement, recipient user) resolved and written ONCE when
 * the announcement is sent. This is the frozen audience: read stats and the
 * markAsRead audience check count against these rows rather than re-resolving
 * the audience live, so later user/section changes cannot drift the numbers.
 */
@Entity({ name: 'announcement_recipients' })
@Unique(['announcementId', 'userId'])
@Index('IDX_announcement_recipients_userId', ['userId'])
export class AnnouncementRecipient {
  @ApiProperty({
    description: 'Unique recipient-row identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Announcement this recipient was targeted by (FK to announcements.id, cascades on delete)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @Column({ type: 'uuid' })
  announcementId: string;

  @ApiProperty({
    description: 'User targeted at send time (FK to users.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @Column({ type: 'uuid' })
  userId: string;

  @ApiProperty({ description: 'Timestamp when the recipient was recorded (send time)' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
