import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public — skipped by the global JwtAuthGuard.
 *
 * Needed because JwtAuthGuard is registered globally (APP_GUARD): routes that
 * were previously reachable without a token (health, root, the two login
 * endpoints) must opt out explicitly. Pair with MustChangePasswordGuard
 * behavior: a public route has no request.user, so the pending-password
 * guard lets it through untouched.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
