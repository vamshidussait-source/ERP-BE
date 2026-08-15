import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TenantPlanTier {
  Trial = 'trial',
  Basic = 'basic',
  Premium = 'premium',
}

@Entity({ name: 'tenants', schema: 'public' })
export class Tenant {
  @ApiProperty({
    description: 'Unique tenant identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'School name', example: 'Greenwood High School' })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({
    description: 'Postgres schema name for the tenant',
    example: 'greenwood',
  })
  @Column({ type: 'varchar', length: 255, unique: true })
  schemaName: string;

  @ApiProperty({
    description: 'Subdomain used to resolve the tenant from the Host header',
    example: 'greenwood',
  })
  @Column({ type: 'varchar', length: 255, unique: true })
  subdomain: string;

  @ApiProperty({
    description: 'Plan tier',
    enum: TenantPlanTier,
    example: TenantPlanTier.Trial,
  })
  @Column({
    type: 'varchar',
    length: 20,
    default: TenantPlanTier.Trial,
  })
  planTier: TenantPlanTier;

  @ApiProperty({
    description: 'Whether the tenant account is active',
    example: true,
  })
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @ApiProperty({ description: 'Timestamp when the tenant was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({ description: 'Timestamp when the tenant was last updated' })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
