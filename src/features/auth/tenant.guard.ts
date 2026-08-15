import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { TenantRequest } from '../tenants/tenant-request.types';

/**
 * Cross-checks the tenantId in the JWT payload against the tenantId resolved
 * by TenantMiddleware from the request subdomain/header.
 *
 * Platform admins are exempt: their JWT carries no tenantId claim (see
 * PlatformAdminJwtPayload — a system-level identity, not scoped to any
 * school), so the tenant-matching check is skipped entirely and they may
 * access any tenant's data.
 *
 * MUST always be paired with JwtAuthGuard, e.g.:
 *   @UseGuards(JwtAuthGuard, TenantGuard)
 *
 * Using TenantGuard alone will reject ALL requests as unauthorized rather than
 * silently allowing them through (fail-closed).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException(
        'Authentication required. TenantGuard must be paired with JwtAuthGuard.',
      );
    }

    // Platform admins operate at the system level and are not scoped to any
    // tenant — allow the request through without tenant matching.
    if (user.role === 'platform_admin') {
      return true;
    }

    // Regular tenant-scoped users must carry a tenantId claim matching the
    // tenant resolved by TenantMiddleware (X-Tenant-ID header or subdomain).
    if (!('tenantId' in user) || user.tenantId !== request.tenantId) {
      throw new ForbiddenException(
        'Token does not match the requested tenant.',
      );
    }

    return true;
  }
}
