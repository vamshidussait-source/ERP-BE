/**
 * JWT payload carried by platform admin tokens.
 *
 * Deliberately has NO tenantId/tenantSchema claims: a platform admin identity
 * is system-level and not scoped to any school, so the tenant claims that
 * exist on regular tenant user tokens (see JwtPayload in features/auth) are
 * intentionally absent here.
 */
export interface PlatformAdminJwtPayload {
  sub: string;
  role: 'platform_admin';
}
