import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Global JWT authentication guard (registered as APP_GUARD in AppModule).
 *
 * Runs first in the global chain (before MustChangePasswordGuard) so that
 * request.user is populated for it. Routes marked @Public() are skipped.
 *
 * Controllers that previously used @UseGuards(JwtAuthGuard, ...) still work —
 * a second, route-level instance simply re-validates the token. Over time
 * those per-controller registrations can be removed in favor of the global
 * guard; they are kept for now to keep this change focused.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
