import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum StudentStatus {
  Active = 'active',
  Inactive = 'inactive',
  Graduated = 'graduated',
}

/**
 * Tenant-scoped Student entity.
 * Lives inside each tenant's own schema (not public).
 * Queried via TenantConnectionService's queryRunner with search_path set.
 */
@Entity({ name: 'students' })
export class Student {
  @ApiProperty({
    description: 'Unique student identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Student first name', example: 'Grace' })
  @Column({ type: 'varchar', length: 255 })
  firstName: string;

  @ApiProperty({ description: 'Student last name', example: 'Hopper' })
  @Column({ type: 'varchar', length: 255 })
  lastName: string;

  @ApiProperty({
    description: 'Student date of birth (ISO 8601 date)',
    example: '2006-04-14',
  })
  @Column({ type: 'date' })
  dateOfBirth: string;

  @ApiProperty({
    description: 'Unique admission number within the tenant schema',
    example: 'ADM-2024-001',
  })
  @Column({ type: 'varchar', length: 50 })
  admissionNumber: string;

  @ApiProperty({
    description: 'Section the student belongs to (foreign key to sections.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  sectionId: string | null;

  @ApiProperty({
    description: 'Current student status',
    enum: StudentStatus,
    example: StudentStatus.Active,
  })
  @Column({ type: 'varchar', length: 20, default: StudentStatus.Active })
  status: StudentStatus;

  @ApiProperty({
    description: 'Timestamp when the student was created',
  })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp when the student was last updated',
  })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
