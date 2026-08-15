import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { PlatformAdminJwtPayload } from './platform-admin-jwt-payload.interface';

/**
 * Authorizes a request as a platform administrator by checking that
 * request.user.role === 'platform_admin' (from the JWT payload).
 *
 * MUST always be paired with JwtAuthGuard, e.g.:
 *   @UseGuards(JwtAuthGuard, PlatformAdminGuard)
 *
 * Simpler than TenantGuard: there is no tenant-matching to check, just
 * confirmation that the JWT belongs to a real platform admin (system-level
 * operator) and not a school user.
 *
 * Fail-closed: if there is no authenticated user, or the user's role is not
 * 'platform_admin', the request is rejected with 403 Forbidden.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: PlatformAdminJwtPayload }>();

    const user = request.user;

    if (!user || user.role !== 'platform_admin') {
      throw new ForbiddenException(
        'Access denied: platform admin privileges required.',
      );
    }

    return true;
  }
}
