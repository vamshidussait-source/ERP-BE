export interface JwtPayload {
  sub: string;
  tenantId: string;
  tenantSchema: string;
  role: string;
}

declare global {
  namespace Express {
    interface User extends JwtPayload {}
  }
}
