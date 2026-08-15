import { ApiProperty } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * A platform-level feature that can be granted to tenants.
 *
 * Lives in the PUBLIC schema (same scope as Tenant / PlatformAdmin). Features
 * are system-wide: every tenant's plan tier references them by key, and
 * tenant-specific overrides reference them too. The rows are seeded once by
 * src/scripts/seed-features.ts — the running app never inserts new features.
 */
@Entity({ name: 'features', schema: 'public' })
export class Feature {
  @ApiProperty({
    description: 'Stable feature key (e.g. "attendance") — primary key',
    example: 'attendance',
  })
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key: string;

  @ApiProperty({
    description: 'Human-friendly feature name for admin UIs',
    example: 'Attendance Tracking',
  })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({
    description: 'Optional longer description of what the feature provides',
    example: 'Daily attendance, leave requests, and attendance reports.',
    nullable: true,
  })
  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @ApiProperty({ description: 'Timestamp when the feature was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
