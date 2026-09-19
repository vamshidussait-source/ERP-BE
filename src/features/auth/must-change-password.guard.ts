import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TenantRequest } from '../tenants/tenant-request.types';
import { ALLOW_WITH_PENDING_PASSWORD_CHANGE_KEY } from './allow-with-pending-password-change.decorator';

/**
 * Blocks authenticated users whose JWT carries mustChangePassword=true from
 * every route except the password-change flow (and routes explicitly
 * exempted via @AllowWithPendingPasswordChange()).
 *
 * Registered globally as an APP_GUARD in AppModule, positioned AFTER
 * JwtAuthGuard so request.user (the verified JWT payload) is already
 * populated. Being global is the point: it covers every existing and future
 * authenticated route without each controller having to remember to add it
 * — the same gap-prone per-controller pattern that caused the missing
 * cleanup-interceptor bug on auth.
 *
 * Notes:
 *  - Public routes (login, health, root) have no request.user and pass
 *    through untouched.
 *  - Platform-admin tokens have no mustChangePassword claim at all, so they
 *    are unaffected.
 *  - The claim is read from the JWT, so a password change must be followed
 *    by a fresh token (POST /auth/change-password re-issues one with the
 *    flag cleared).
 */
@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Route explicitly exempted (e.g. POST /auth/change-password itself).
    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_WITH_PENDING_PASSWORD_CHANGE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) {
      return true;
    }

    const request = context.switchToHttp().getRequest<TenantRequest>();
    const user = request.user;

    // Not authenticated at this point (public route, or JwtAuthGuard hasn't
    // run) — nothing to enforce; authentication is JwtAuthGuard's job.
    if (!user) {
      return true;
    }

    const mustChangePassword =
      (user as { mustChangePassword?: boolean }).mustChangePassword === true;

    if (mustChangePassword) {
      throw new ForbiddenException(
        'You must change your temporary password before continuing.',
      );
    }

    return true;
  }
}
