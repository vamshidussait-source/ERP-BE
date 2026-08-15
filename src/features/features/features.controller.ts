import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../platform-admin/platform-admin.guard';
import { Feature } from './feature.entity';
import { PlanTierFeature } from './plan-tier-feature.entity';
import { TenantFeatureOverride } from './tenant-feature-override.entity';
import { SetFeatureOverrideDto } from './dto/set-feature-override.dto';
import { FeaturesService } from './features.service';

/**
 * Platform-level feature entitlement management for the admin portal.
 *
 * These routes are NOT tenant-scoped: features and tenant entitlements are
 * system-level data in the public schema, managed only by platform admins
 * (JwtAuthGuard + PlatformAdminGuard). No X-Tenant-ID header is used, and no
 * TenantMiddleware applies — the same access model as TenantsController.
 *
 * The tenant routes are deliberately nested under /tenants/:tenantId/features
 * (rather than /features/:tenantId) because they are tenant-centric reads and
 * writes; the controller declares full paths to keep them exactly where the
 * admin portal expects them.
 */
@ApiTags('features')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller()
export class FeaturesController {
  constructor(private readonly featuresService: FeaturesService) {}

  @Get('features')
  @ApiOperation({
    summary: 'List all features',
    description:
      'PLATFORM-ADMIN-ONLY route — NOT tenant-scoped: requires a Bearer ' +
      "token from POST /admin/auth/login whose payload role is " +
      "'platform_admin' (JwtAuthGuard + PlatformAdminGuard). No X-Tenant-ID " +
      'header is used. Returns the full feature catalog (key, name, ' +
      'description) for populating admin UI dropdowns and checklists.',
  })
  @ApiResponse({
    status: 200,
    description: 'Feature catalog returned',
    type: Feature,
    isArray: true,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden — platform admin privileges required (valid JWT with role 'platform_admin')",
  })
  listAllFeatures() {
    return this.featuresService.listAllFeatures();
  }

  @Get('tenants/:tenantId/features')
  @ApiOperation({
    summary: "Get a tenant's effective features",
    description:
      'PLATFORM-ADMIN-ONLY route — NOT tenant-scoped: requires a Bearer ' +
      "token from POST /admin/auth/login whose payload role is " +
      "'platform_admin' (JwtAuthGuard + PlatformAdminGuard). No X-Tenant-ID " +
      'header is used. Returns the merged map of featureKey -> enabled for a ' +
      'tenant: the plan tier defaults with any tenant-specific overrides ' +
      'applied on top (an override always wins).',
  })
  @ApiResponse({
    status: 200,
    description:
      'Effective features returned as { featureKey: boolean, ... } (e.g. ' +
      '{"attendance": true, "fee_management": false})',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden — platform admin privileges required (valid JWT with role 'platform_admin')",
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  getEffectiveFeatures(@Param('tenantId') tenantId: string) {
    return this.featuresService.getEffectiveFeatures(tenantId);
  }

  @Patch('tenants/:tenantId/features/:featureKey')
  @ApiOperation({
    summary: 'Set a tenant feature override',
    description:
      'PLATFORM-ADMIN-ONLY route — NOT tenant-scoped: requires a Bearer ' +
      "token from POST /admin/auth/login whose payload role is " +
      "'platform_admin' (JwtAuthGuard + PlatformAdminGuard). No X-Tenant-ID " +
      'header is used. Creates or updates a tenant_feature_overrides row, ' +
      'overriding the plan tier default for this feature. Body: ' +
      '{ enabled: boolean }.',
  })
  @ApiResponse({
    status: 200,
    description: 'Override created or updated',
    type: TenantFeatureOverride,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden — platform admin privileges required (valid JWT with role 'platform_admin')",
  })
  @ApiResponse({
    status: 404,
    description: 'Tenant or feature not found',
  })
  setOverride(
    @Param('tenantId') tenantId: string,
    @Param('featureKey') featureKey: string,
    @Body() dto: SetFeatureOverrideDto,
  ) {
    return this.featuresService.setTenantOverride(
      tenantId,
      featureKey,
      dto.enabled,
    );
  }

  @Delete('tenants/:tenantId/features/:featureKey')
  @ApiOperation({
    summary: 'Remove a tenant feature override',
    description:
      'PLATFORM-ADMIN-ONLY route — NOT tenant-scoped: requires a Bearer ' +
      "token from POST /admin/auth/login whose payload role is " +
      "'platform_admin' (JwtAuthGuard + PlatformAdminGuard). No X-Tenant-ID " +
      'header is used. Deletes the tenant_feature_overrides row, reverting ' +
      'the tenant back to their plan tier default for this feature. ' +
      'Idempotent: removing a non-existent override succeeds with removed: ' +
      'false.',
  })
  @ApiResponse({
    status: 200,
    description: 'Override removed — { removed: true } if a row was deleted',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden — platform admin privileges required (valid JWT with role 'platform_admin')",
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  removeOverride(
    @Param('tenantId') tenantId: string,
    @Param('featureKey') featureKey: string,
  ) {
    return this.featuresService.removeTenantOverride(tenantId, featureKey);
  }
}
