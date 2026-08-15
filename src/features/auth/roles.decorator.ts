import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Declares the roles allowed to access a route, e.g. @Roles('school_admin').
 * Consumed by RolesGuard. When omitted, the route is open to any authenticated
 * tenant user.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
