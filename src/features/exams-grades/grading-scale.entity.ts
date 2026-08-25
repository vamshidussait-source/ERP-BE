import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Tenant-scoped GradingScale entity.
 * Lives inside each tenant's own schema (not public).
 *
 * Defines a grading scale that can be used across exams. One scale can be
 * marked as the school's default. Schools may maintain multiple scales
 * (e.g. "CBSE 9-Point Scale", "Simple A-F") and assign different scales
 * to different exams.
 */
@Entity({ name: 'grading_scales' })
export class GradingScale {
  @ApiProperty({
    description: 'Unique grading scale identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description:
      'Scale name (e.g. "CBSE 9-Point Scale", "Simple A-F")',
    example: 'CBSE 9-Point Scale',
  })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({
    description:
      'Whether this is the school\'s default grading scale (at most one should be true)',
    default: false,
  })
  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @ApiProperty({ description: 'Timestamp when the record was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({ description: 'Timestamp when the record was last updated' })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
