import {
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { TenantRequest } from '../tenants/tenant-request.types';
import { TenantConnectionService } from '../tenants/tenant-connection.service';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly jwtService: JwtService,
    @Inject(REQUEST) private readonly request: TenantRequest,
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<{
    accessToken: string;
    user: { id: string; email: string; role: string };
  }> {
    const qr = await this.tenantConnectionService.getQueryRunner();

    // Look up the user within the current tenant's schema (search_path is set).
    const [user]: [
      | { id: string; email: string; passwordHash: string; role: string; isActive: boolean }
      | undefined,
    ] = await qr.query(
      `SELECT id, email, "passwordHash", role, "isActive"
       FROM users
       WHERE email = $1`,
      [email],
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      tenantId: this.request.tenantId!,
      tenantSchema: this.request.tenantSchema!,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }
}
