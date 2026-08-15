import { Request } from 'express';
import { JwtPayload } from '../auth/jwt-payload.interface';

export interface TenantRequest extends Request {
  tenantSchema?: string;
  tenantId?: string;
  user?: JwtPayload;
}
