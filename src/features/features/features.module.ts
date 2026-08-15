import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedAuthModule } from '../auth/shared-auth.module';
import { PlatformAdminAuthModule } from '../platform-admin/platform-admin-auth.module';
import { Tenant } from '../tenants/tenant.entity';
import { Feature } from './feature.entity';
import { FeaturesController } from './features.controller';
import { FeaturesService } from './features.service';
import { PlanTierFeature } from './plan-tier-feature.entity';
import { TenantFeatureOverride } from './tenant-feature-override.entity';

/**
 * Platform-level feature entitlement management.
 *
 * All entities live in the PUBLIC schema and are queried via plain TypeORM
 * repositories — no TenantMiddleware, no TenantConnectionService, no
 * X-Tenant-ID header. Routes are platform-admin-only (JwtAuthGuard +
 * PlatformAdminGuard), exactly like TenantsController.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Feature,
      PlanTierFeature,
      TenantFeatureOverride,
      Tenant,
    ]),
    // Provides JwtAuthGuard for pairing with PlatformAdminGuard.
    SharedAuthModule,
    // Exports PlatformAdminGuard.
    PlatformAdminAuthModule,
  ],
  controllers: [FeaturesController],
  providers: [FeaturesService],
  exports: [FeaturesService],
})
export class FeaturesModule {}
