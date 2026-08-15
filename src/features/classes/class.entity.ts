import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Tenant-scoped Class entity (named SchoolClass to avoid confusion with the
 * reserved word). Lives inside each tenant's own schema (not public).
 * Queried via TenantConnectionService's queryRunner with search_path set.
 */
@Entity({ name: 'classes' })
export class SchoolClass {
  @ApiProperty({
    description: 'Unique class identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Class name, unique within the tenant schema',
    example: 'Grade 8',
  })
  @Column({ type: 'varchar', length: 255, unique: true })
  name: string;

  @ApiProperty({
    description: 'Logical sort order (e.g. 1 for Grade 1, 2 for Grade 2)',
    example: 8,
  })
  @Column({ type: 'integer', default: 0 })
  displayOrder: number;

  @ApiProperty({ description: 'Timestamp when the class was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({ description: 'Timestamp when the class was last updated' })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
