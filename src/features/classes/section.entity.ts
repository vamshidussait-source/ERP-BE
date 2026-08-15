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
 * Tenant-scoped Section entity. A section belongs to exactly one class
 * (e.g. "Grade 8 - A"). Lives inside each tenant's own schema (not public).
 * Queried via TenantConnectionService's queryRunner with search_path set.
 */
@Entity({ name: 'sections' })
@Unique(['classId', 'name'])
export class Section {
  @ApiProperty({
    description: 'Unique section identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Class the section belongs to (foreign key to classes.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @Column({ type: 'uuid' })
  classId: string;

  @ApiProperty({
    description:
      'Section name, unique per class (e.g. "Grade 8 - A" only once)',
    example: 'A',
  })
  @Column({ type: 'varchar', length: 50 })
  name: string;

  @ApiProperty({
    description: 'Maximum number of students (optional for now)',
    example: 30,
    nullable: true,
  })
  @Column({ type: 'integer', nullable: true })
  capacity: number | null;

  @ApiProperty({ description: 'Timestamp when the section was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({ description: 'Timestamp when the section was last updated' })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
