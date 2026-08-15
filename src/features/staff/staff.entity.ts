import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum StaffStatus {
  Active = 'active',
  Inactive = 'inactive',
}

/**
 * Tenant-scoped Staff entity.
 * Lives inside each tenant's own schema (not public).
 * Queried via TenantConnectionService's queryRunner with search_path set.
 */
@Entity({ name: 'staff' })
export class Staff {
  @ApiProperty({
    description: 'Unique staff identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Staff first name', example: 'Ada' })
  @Column({ type: 'varchar', length: 255 })
  firstName: string;

  @ApiProperty({ description: 'Staff last name', example: 'Lovelace' })
  @Column({ type: 'varchar', length: 255 })
  lastName: string;

  @ApiProperty({
    description: 'Staff email, unique within the tenant schema',
    example: 'ada@greenwood.edu',
  })
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @ApiProperty({
    description: 'Contact phone number',
    example: '+1-555-0100',
    nullable: true,
  })
  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @ApiProperty({
    description: 'Job designation',
    example: 'Math Teacher',
  })
  @Column({ type: 'varchar', length: 255 })
  designation: string;

  @ApiProperty({
    description: 'Unique employee ID within the tenant schema',
    example: 'EMP-0001',
  })
  @Column({ type: 'varchar', length: 50, unique: true })
  employeeId: string;

  @ApiProperty({
    description: 'Current staff status',
    enum: StaffStatus,
    example: StaffStatus.Active,
  })
  @Column({ type: 'varchar', length: 20, default: StaffStatus.Active })
  status: StaffStatus;

  @ApiProperty({ description: 'Timestamp when the staff member was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp when the staff member was last updated',
  })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
