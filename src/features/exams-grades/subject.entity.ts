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
 * Tenant-scoped Subject entity.
 * Lives inside each tenant's own schema (not public).
 *
 * Defines the subjects taught at a school (e.g. "Mathematics", "Science",
 * "Hindi"). This is a free-text, school-configurable list — not a fixed
 * enum — to accommodate CBSE, State-board, and other curricula.
 */
@Entity({ name: 'subjects' })
@Unique(['name'])
export class Subject {
  @ApiProperty({
    description: 'Unique subject identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description:
      'Subject name (e.g. "Mathematics", "Science", "Hindi") — school-configurable, free text',
    example: 'Mathematics',
  })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({ description: 'Timestamp when the record was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({ description: 'Timestamp when the record was last updated' })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
