import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the feature entitlement tables in the public schema:
 *   1. public.features                    — the catalog of all platform features
 *   2. public.plan_tier_features          — per-tier default enabled state
 *   3. public.tenant_feature_overrides    — per-tenant overrides (always win)
 *
 * Dependency order: features first, because both other tables reference
 * features.key. tenant_feature_overrides also references tenants.id (created
 * by 1710000000000-CreateTenantsTable).
 *
 * Rows are populated by src/scripts/seed-features.ts (npm run seed:features).
 */
export class CreateFeatureEntitlementTables1730000000000
  implements MigrationInterface
{
  name = 'CreateFeatureEntitlementTables1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.features (
        key character varying(100) NOT NULL,
        name character varying(255) NOT NULL,
        description character varying(500),
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_features" PRIMARY KEY (key)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE public.plan_tier_features (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        "planTier" character varying(20) NOT NULL,
        "featureKey" character varying(100) NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_plan_tier_features" PRIMARY KEY (id),
        CONSTRAINT "UQ_plan_tier_features_tier_feature" UNIQUE ("planTier", "featureKey"),
        CONSTRAINT "FK_plan_tier_features_feature" FOREIGN KEY ("featureKey")
          REFERENCES public.features (key) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE public.tenant_feature_overrides (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenantId" uuid NOT NULL,
        "featureKey" character varying(100) NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_feature_overrides" PRIMARY KEY (id),
        CONSTRAINT "UQ_tenant_feature_overrides_tenant_feature" UNIQUE ("tenantId", "featureKey"),
        CONSTRAINT "FK_tenant_feature_overrides_tenant" FOREIGN KEY ("tenantId")
          REFERENCES public.tenants (id) ON DELETE CASCADE,
        CONSTRAINT "FK_tenant_feature_overrides_feature" FOREIGN KEY ("featureKey")
          REFERENCES public.features (key) ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.tenant_feature_overrides`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.plan_tier_features`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.features`);
  }
}
