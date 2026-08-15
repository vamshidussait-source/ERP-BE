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
 * Tenant-specific override of a feature's enabled state.
 *
 * Lives in the PUBLIC schema. One row per (tenantId, featureKey) pair. An
 * override ALWAYS wins over the plan tier default when computing effective
 * features: enabled=true turns a feature on even if the tier disables it, and
 * enabled=false turns a feature off even if the tier enables it.
 *
 * Managed exclusively by platform admins (FeaturesController) — a tenant
 * cannot change its own entitlements.
 */
@Entity({ name: 'tenant_feature_overrides', schema: 'public' })
@Unique('UQ_tenant_feature_overrides_tenant_feature', ['tenantId', 'featureKey'])
export class TenantFeatureOverride {
  @ApiProperty({
    description: 'Unique tenant-feature-override row identifier (UUID)',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Tenant this override applies to (FK -> tenants.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @Column({ type: 'uuid' })
  tenantId: string;

  @ApiProperty({
    description: 'Feature key being overridden (FK -> features.key)',
    example: 'fee_management',
  })
  @Column({ type: 'varchar', length: 100 })
  featureKey: string;

  @ApiProperty({
    description:
      'Effective enabled state for this tenant, overriding the tier default',
    example: true,
  })
  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @ApiProperty({ description: 'Timestamp when the override was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({ description: 'Timestamp when the override was last updated' })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
