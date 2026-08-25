import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TenantRequest } from '../tenants/tenant-request.types';
import { FeaturesService } from './features.service';
import { REQUIRES_FEATURE_KEY } from './requires-feature.decorator';

/**
 * Authorizes a request by checking the tenant's effective feature set against
 * the feature key declared via the @RequiresFeature(...) decorator.
 *
 * MUST be paired with JwtAuthGuard + TenantGuard so request.user and
 * request.tenantId are populated, e.g.:
 *   @UseGuards(JwtAuthGuard, TenantGuard, FeatureGuard)
 *
 * Fail-open-when-not-applicable: routes without @RequiresFeature metadata
 * are allowed through unconditionally (same pattern as RolesGuard).
 *
 * Fail-closed-when-applicable: when @RequiresFeature metadata IS present and
 * the tenant's effective feature map shows the feature as disabled, the
 * request is rejected with 403 Forbidden.
 *
 * Platform admins are exempt: their JWT carries no tenantId claim, so the
 * feature check is skipped entirely (same exemption pattern as TenantGuard).
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featuresService: FeaturesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string>(
      REQUIRES_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Fail-open: no @RequiresFeature metadata on this route — allow through.
    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest<TenantRequest>();
    const user = request.user;

    // Platform admins operate at the system level and are not scoped to any
    // tenant — allow the request through without feature checking.
    if (user?.role === 'platform_admin') {
      return true;
    }

    const tenantId = request.tenantId;
    if (!tenantId) {
      throw new ForbiddenException(
        'Feature entitlement check requires a tenant context. FeatureGuard must be paired with TenantGuard.',
      );
    }

    const effectiveFeatures = await this.featuresService.getEffectiveFeatures(
      tenantId,
    );

    if (!effectiveFeatures[requiredFeature]) {
      throw new ForbiddenException(
        'This feature is not included in your school\'s current plan. Contact your administrator to upgrade.',
      );
    }

    return true;
  }
}
