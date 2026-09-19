import type { PlatformAdminJwtPayload } from '../platform-admin/platform-admin-jwt-payload.interface';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  tenantSchema: string;
  role: string;

  /**
   * True while the user is still on a temporary password (issued login or
   * admin reset). Lets the frontend force the password-change screen before
   * normal access. Optional so pre-existing tokens without the claim still
   * validate.
   */
  mustChangePassword?: boolean;
}

/**
 * The payload attached to request.user by JwtAuthGuard: either a regular
 * tenant-scoped user JWT (JwtPayload — includes tenantId/tenantSchema claims)
 * or a platform admin JWT (PlatformAdminJwtPayload — system-level, and
 * deliberately has no tenant claims).
 */
export type AuthenticatedUser = JwtPayload | PlatformAdminJwtPayload;

declare global {
  namespace Express {
    interface User extends JwtPayload {}
  }
}
