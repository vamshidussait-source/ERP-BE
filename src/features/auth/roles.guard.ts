import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TenantRequest } from '../tenants/tenant-request.types';
import { ROLES_KEY } from './roles.decorator';

/**
 * Authorizes a request by comparing request.user.role (from the JWT payload)
 * against the roles allowed on the route via the @Roles(...) decorator.
 *
 * MUST be paired with JwtAuthGuard so request.user is populated, e.g.:
 *   @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
 *
 * Fail-closed: if @Roles metadata exists and the user's role isn't in the
 * allowed list, the request is rejected with 403 Forbidden. Routes without
 * @Roles metadata are open to any authenticated tenant user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<TenantRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException(
        'Authentication required to check roles. RolesGuard must be paired with JwtAuthGuard.',
      );
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Access denied: this route requires one of the following roles: ${requiredRoles.join(', ')}.`,
      );
    }

    return true;
  }
}
