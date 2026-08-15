import { Request } from 'express';
import { AuthenticatedUser } from '../auth/jwt-payload.interface';

/**
 * Request with a tenant context resolved by TenantMiddleware (tenantSchema /
 * tenantId) and an AuthenticatedUser attached by JwtAuthGuard.
 *
 * Extends Express's Request but redeclares `user` via Omit: the global
 * Express.User augmentation is JwtPayload (tenant-scoped), which can't
 * represent a platform admin JWT — here user is the union of both payload
 * kinds.
 */
export interface TenantRequest extends Omit<Request, 'user'> {
  tenantSchema?: string;
  tenantId?: string;
  user?: AuthenticatedUser;
}

/**
 * Returns the tenantSchema claim for a regular tenant-scoped user, or
 * undefined for a platform admin (whose JWT has no tenant claims).
 */
export function tenantSchemaOf(
  user: AuthenticatedUser | undefined,
): string | undefined {
  return user && 'tenantSchema' in user ? user.tenantSchema : undefined;
}
