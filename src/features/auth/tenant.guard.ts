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

    if (user.tenantId !== request.tenantId) {
      throw new ForbiddenException(
        'Token does not match the requested tenant.',
      );
    }

    return true;
  }
}
