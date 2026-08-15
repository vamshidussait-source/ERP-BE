import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, TenantPlanTier } from '../tenants/tenant.entity';
import { Feature } from './feature.entity';
import { PlanTierFeature } from './plan-tier-feature.entity';
import { TenantFeatureOverride } from './tenant-feature-override.entity';

/** Map of featureKey -> enabled for a tenant. */
export type EffectiveFeatureMap = Record<string, boolean>;

/**
 * Feature entitlement queries for the platform admin portal.
 *
 * All queries go through plain TypeORM repositories on the PUBLIC schema —
 * features, tier defaults, and tenant overrides are system-level data, not
 * tenant-schema data, so no TenantConnectionService / search_path handling is
 * involved (same pattern as TenantsService).
 */
@Injectable()
export class FeaturesService {
  constructor(
    @InjectRepository(Feature)
    private readonly featureRepository: Repository<Feature>,
    @InjectRepository(PlanTierFeature)
    private readonly planTierFeatureRepository: Repository<PlanTierFeature>,
    @InjectRepository(TenantFeatureOverride)
    private readonly overrideRepository: Repository<TenantFeatureOverride>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  /**
   * Computes the effective feature set for a tenant: start from the plan
   * tier's defaults, then apply any tenant-specific overrides on top — an
   * override ALWAYS wins over the tier default.
   */
  async getEffectiveFeatures(tenantId: string): Promise<EffectiveFeatureMap> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with id ${tenantId} not found`);
    }

    const [tierDefaults, overrides] = await Promise.all([
      this.planTierFeatureRepository.find({
        where: { planTier: tenant.planTier },
      }),
      this.overrideRepository.find({ where: { tenantId } }),
    ]);

    const merged: EffectiveFeatureMap = {};
    for (const row of tierDefaults) {
      merged[row.featureKey] = row.enabled;
    }
    for (const row of overrides) {
      merged[row.featureKey] = row.enabled;
    }
    return merged;
  }

  /** Creates or updates (upserts) a tenant override for a single feature. */
  async setTenantOverride(
    tenantId: string,
    featureKey: string,
    enabled: boolean,
  ): Promise<TenantFeatureOverride> {
    await this.assertTenantExists(tenantId);
    await this.assertFeatureExists(featureKey);

    await this.overrideRepository.upsert(
      { tenantId, featureKey, enabled },
      { conflictPaths: ['tenantId', 'featureKey'] },
    );

    const override = await this.overrideRepository.findOne({
      where: { tenantId, featureKey },
    });
    if (!override) {
      // Cannot happen after a successful upsert; guard for type-safety.
      throw new NotFoundException(
        `Override for tenant ${tenantId} feature ${featureKey} not found after upsert`,
      );
    }
    return override;
  }

  /**
   * Deletes a tenant override, reverting that tenant back to their tier's
   * default for the feature. Idempotent: removing a non-existent override is
   * a no-op (returns removed: false) — the end state is the same.
   */
  async removeTenantOverride(
    tenantId: string,
    featureKey: string,
  ): Promise<{ removed: boolean }> {
    await this.assertTenantExists(tenantId);

    const result = await this.overrideRepository.delete({
      tenantId,
      featureKey,
    });

    return { removed: (result.affected ?? 0) > 0 };
  }

  /** Returns all feature catalog rows (for admin UI dropdowns/checklists). */
  listAllFeatures(): Promise<Feature[]> {
    return this.featureRepository.find({ order: { key: 'ASC' } });
  }

  /** Returns the default feature set for a given plan tier. */
  listPlanTierDefaults(planTier: TenantPlanTier): Promise<PlanTierFeature[]> {
    return this.planTierFeatureRepository.find({
      where: { planTier },
      order: { featureKey: 'ASC' },
    });
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with id ${tenantId} not found`);
    }
  }

  private async assertFeatureExists(featureKey: string): Promise<void> {
    const feature = await this.featureRepository.findOne({
      where: { key: featureKey },
    });
    if (!feature) {
      throw new NotFoundException(`Feature with key "${featureKey}" not found`);
    }
  }
}
