import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantPlanTier } from '../tenants/tenant.entity';

/**
 * Default feature entitlement for a plan tier ('trial' | 'basic' | 'premium').
 *
 * Lives in the PUBLIC schema. One row per (planTier, featureKey) pair — e.g.
 * the "trial" tier enables students/staff/classes_sections/attendance and
 * disables everything else. Seeded by src/scripts/seed-features.ts.
 *
 * getEffectiveFeatures() starts from these defaults and then layers any
 * tenant-specific TenantFeatureOverride rows on top (an override always wins).
 */
@Entity({ name: 'plan_tier_features', schema: 'public' })
@Unique('UQ_plan_tier_features_tier_feature', ['planTier', 'featureKey'])
export class PlanTierFeature {
  @ApiProperty({ description: 'Unique plan-tier-feature row identifier (UUID)' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Plan tier this default applies to',
    enum: TenantPlanTier,
    example: TenantPlanTier.Trial,
  })
  @Column({ type: 'varchar', length: 20 })
  planTier: TenantPlanTier;

  @ApiProperty({
    description: 'Feature key this default applies to (FK -> features.key)',
    example: 'attendance',
  })
  @Column({ type: 'varchar', length: 100 })
  featureKey: string;

  @ApiProperty({
    description: 'Whether the feature is enabled by default for this tier',
    example: true,
  })
  @Column({ type: 'boolean', default: true })
  enabled: boolean;
}
