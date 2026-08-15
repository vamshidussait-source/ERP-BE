import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * System-level platform administrator.
 *
 * Lives in the PUBLIC schema (same scope as Tenant), NOT inside any tenant
 * schema. Platform admins are application-wide operators (not school users)
 * and are deliberately NOT scoped to any school/tenant.
 *
 * Queried via a plain TypeORM repository — no TenantConnectionService or
 * search_path handling is involved.
 */
@Entity({ name: 'platform_admins', schema: 'public' })
export class PlatformAdmin {
  @ApiProperty({
    description: 'Unique platform admin identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Platform admin email address (unique across the whole system)',
    example: 'platform-admin@school-erp.com',
  })
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @ApiProperty({
    description: 'Bcrypt hash of the platform admin password (never exposed)',
    writeOnly: true,
  })
  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @ApiProperty({
    description: 'Display name of the platform admin',
    example: 'Platform Operations Team',
  })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({
    description: 'Whether the platform admin account is active',
    example: true,
  })
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @ApiProperty({ description: 'Timestamp when the platform admin was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp when the platform admin was last updated',
  })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
