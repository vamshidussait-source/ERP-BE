import { SetMetadata } from '@nestjs/common';

export const ALLOW_WITH_PENDING_PASSWORD_CHANGE_KEY =
  'allowWithPendingPasswordChange';

/**
 * Explicitly allows a route to be called by a user whose JWT carries
 * mustChangePassword=true (i.e. someone still on a temporary password).
 *
 * Consumed by the global MustChangePasswordGuard. Keep the exemption list
 * minimal — the only current user is POST /auth/change-password itself,
 * which is the whole point of the pending state. Every other route should
 * stay blocked so a leaked temporary password grants nothing beyond the
 * forced password-change screen.
 */
export const AllowWithPendingPasswordChange = () =>
  SetMetadata(ALLOW_WITH_PENDING_PASSWORD_CHANGE_KEY, true);
