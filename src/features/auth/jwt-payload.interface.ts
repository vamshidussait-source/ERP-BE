import type { PlatformAdminJwtPayload } from '../platform-admin/platform-admin-jwt-payload.interface';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  tenantSchema: string;
  role: string;
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
