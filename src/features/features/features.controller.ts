import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Req,
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
import type { TenantRequest } from '../tenants/tenant-request.types';
import { Feature } from './feature.entity';
import { PlanTierFeature } from './plan-tier-feature.entity';
import { TenantFeatureOverride } from './tenant-feature-override.entity';
import { SetFeatureOverrideDto } from './dto/set-feature-override.dto';
import { SetPlanTierDefaultDto } from './dto/set-plan-tier-default.dto';
import { FeaturesService } from './features.service';
import { TenantPlanTier } from '../tenants/tenant.entity';

/**
 * Feature entitlement management.
 *
 * Platform-admin routes (most of this controller) manage the feature catalog
 * and per-tenant/tier overrides. The GET /features/me route is tenant-scoped
 * and available to any authenticated tenant role.
 *
 * PlatformAdminGuard is applied at the method level (not class level) so that
 * the /features/me endpoint can use TenantGuard instead without being blocked
 * by the platform admin check.
 */
@ApiTags('features')
@ApiBearerAuth()
@Controller()
export class FeaturesController {
  constructor(private readonly featuresService: FeaturesService) {}

  // ── Tenant-scoped: any authenticated tenant role ────────────────────

  @Get('features/me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Get own tenant's effective features",
    description:
      "Returns the effective feature map for the authenticated user's " +
      'tenant. Any authenticated tenant role (school_admin, staff, parent, ' +
      'student) can call this. The School Portal frontend uses this to ' +
      'determine which nav items and routes to show.\n\n' +
      'Requires a valid tenant-scoped JWT (JwtAuthGuard + TenantGuard). ' +
      'Platform admins (whose JWT has no tenantId) are NOT expected to use ' +
      'this endpoint -- use GET /tenants/:tenantId/features instead.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Effective features returned as { featureKey: boolean, ... }',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized -- valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden -- token does not match the requested tenant',
  })
  async getMyFeatures(@Req() req: TenantRequest) {
    const user = req.user;
    const tenantId = user && 'tenantId' in user ? user.tenantId : undefined;
    if (!tenantId) {
      throw new ForbiddenException(
        'This endpoint requires a tenant-scoped JWT.',
      );
    }
    return this.featuresService.getEffectiveFeatures(tenantId);
  }

  // ── Platform-admin-only routes ──────────────────────────────────────

  @Get('features')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @ApiOperation({
    summary: 'List all features',
    description:
      'PLATFORM-ADMIN-ONLY route -- NOT tenant-scoped: requires a Bearer ' +
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
    description: 'Unauthorized -- valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden -- platform admin privileges required (valid JWT with role 'platform_admin')",
  })
  listAllFeatures() {
    return this.featuresService.listAllFeatures();
  }

  @Get('tenants/:tenantId/features')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @ApiOperation({
    summary: "Get a tenant's effective features",
    description:
      'PLATFORM-ADMIN-ONLY route -- NOT tenant-scoped: requires a Bearer ' +
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
    description: 'Unauthorized -- valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden -- platform admin privileges required (valid JWT with role 'platform_admin')",
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  getEffectiveFeatures(@Param('tenantId') tenantId: string) {
    return this.featuresService.getEffectiveFeatures(tenantId);
  }

  @Patch('tenants/:tenantId/features/:featureKey')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @ApiOperation({
    summary: 'Set a tenant feature override',
    description:
      'PLATFORM-ADMIN-ONLY route -- NOT tenant-scoped: requires a Bearer ' +
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
    description: 'Unauthorized -- valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden -- platform admin privileges required (valid JWT with role 'platform_admin')",
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

  @Patch('plan-tiers/:planTier/features/:featureKey')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @ApiOperation({
    summary: 'Set a plan tier feature default',
    description:
      'PLATFORM-ADMIN-ONLY route -- NOT tenant-scoped: requires a Bearer ' +
      "token from POST /admin/auth/login whose payload role is " +
      "'platform_admin' (JwtAuthGuard + PlatformAdminGuard). No X-Tenant-ID " +
      'header is used. Creates or updates a plan_tier_features row, changing ' +
      'the default enabled state of this feature for the given tier. Body: ' +
      '{ enabled: boolean }. WARNING: Changing a tier default takes effect ' +
      'immediately for every tenant on this tier that does not have an ' +
      'explicit override for this feature -- this is not limited to newly ' +
      'provisioned tenants.',
  })
  @ApiResponse({
    status: 200,
    description: 'Plan tier default created or updated',
    type: PlanTierFeature,
  })
  @ApiResponse({
    status: 400,
    description:
      "Validation failed -- planTier must be one of 'trial' | 'basic' | 'premium' or body missing enabled",
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized -- valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden -- platform admin privileges required (valid JWT with role 'platform_admin')",
  })
  @ApiResponse({
    status: 404,
    description: 'Feature not found',
  })
  setPlanTierDefault(
    @Param('planTier', new ParseEnumPipe(TenantPlanTier))
    planTier: TenantPlanTier,
    @Param('featureKey') featureKey: string,
    @Body() dto: SetPlanTierDefaultDto,
  ) {
    return this.featuresService.setPlanTierDefault(
      planTier,
      featureKey,
      dto.enabled,
    );
  }

  // NOTE: the literal route /plan-tiers/features must be declared BEFORE the
  // parameterized /plan-tiers/:planTier/features below -- Express matches
  // routes in registration order, so a literal 'features' segment would
  // otherwise be captured by the :planTier param.
  @Get('plan-tiers/features')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @ApiOperation({
    summary: "Get all plan tiers' feature defaults",
    description:
      'PLATFORM-ADMIN-ONLY route -- NOT tenant-scoped: requires a Bearer ' +
      "token from POST /admin/auth/login whose payload role is " +
      "'platform_admin' (JwtAuthGuard + PlatformAdminGuard). No X-Tenant-ID " +
      'header is used. Returns the default feature set for every plan tier ' +
      'in one response, grouped by tier as { trial: { featureKey: ' +
      'boolean, ... }, basic: { ... }, premium: { ... } } -- for rendering a ' +
      'Trial/Basic/Premium comparison table in a single view.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Defaults for all three tiers as { trial: { featureKey: boolean }, ' +
      'basic: { ... }, premium: { ... } }',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized -- valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden -- platform admin privileges required (valid JWT with role 'platform_admin')",
  })
  getAllPlanTierDefaults() {
    return this.featuresService.getAllPlanTierDefaults();
  }

  @Get('plan-tiers/:planTier/features')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @ApiOperation({
    summary: "Get a plan tier's feature defaults",
    description:
      'PLATFORM-ADMIN-ONLY route -- NOT tenant-scoped: requires a Bearer ' +
      "token from POST /admin/auth/login whose payload role is " +
      "'platform_admin' (JwtAuthGuard + PlatformAdminGuard). No X-Tenant-ID " +
      'header is used. Returns the default feature set (plan_tier_features ' +
      'rows) for a single plan tier.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Tier defaults returned as an array of { planTier, featureKey, ' +
      'enabled, ... } rows',
    type: PlanTierFeature,
    isArray: true,
  })
  @ApiResponse({
    status: 400,
    description:
      "Validation failed -- planTier must be one of 'trial' | 'basic' | 'premium'",
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized -- valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden -- platform admin privileges required (valid JWT with role 'platform_admin')",
  })
  listPlanTierDefaults(
    @Param('planTier', new ParseEnumPipe(TenantPlanTier))
    planTier: TenantPlanTier,
  ) {
    return this.featuresService.listPlanTierDefaults(planTier);
  }

  @Delete('tenants/:tenantId/features/:featureKey')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @ApiOperation({
    summary: 'Remove a tenant feature override',
    description:
      'PLATFORM-ADMIN-ONLY route -- NOT tenant-scoped: requires a Bearer ' +
      "token from POST /admin/auth/login whose payload role is " +
      "'platform_admin' (JwtAuthGuard + PlatformAdminGuard). No X-Tenant-ID " +
      'header is used. Deletes the tenant_feature_overrides row, reverting ' +
      'the tenant back to their plan tier default for this feature. ' +
      'Idempotent: removing a non-existent override succeeds with removed: ' +
      'false.',
  })
  @ApiResponse({
    status: 200,
    description: 'Override removed -- { removed: true } if a row was deleted',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized -- valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden -- platform admin privileges required (valid JWT with role 'platform_admin')",
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  removeOverride(
    @Param('tenantId') tenantId: string,
    @Param('featureKey') featureKey: string,
  ) {
    return this.featuresService.removeTenantOverride(tenantId, featureKey);
  }
}
