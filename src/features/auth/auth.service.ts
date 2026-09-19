import {
  BadRequestException,
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
    mustChangePassword: boolean;
    user: { id: string; email: string; role: string; mustChangePassword: boolean };
  }> {
    const qr = await this.tenantConnectionService.getQueryRunner();

    // Look up the user within the current tenant's schema (search_path is set).
    const [user]: [
      | {
          id: string;
          email: string;
          passwordHash: string;
          role: string;
          isActive: boolean;
          mustChangePassword: boolean;
        }
      | undefined,
    ] = await qr.query(
      `SELECT id, email, "passwordHash", role, "isActive", "mustChangePassword"
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
      mustChangePassword: user.mustChangePassword,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      mustChangePassword: user.mustChangePassword,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  /**
   * Changes the authenticated user's password after verifying the current
   * one. Clears the mustChangePassword flag on success and re-issues an
   * access token with the cleared claim — necessary because the flag is
   * enforced from the JWT, so the old token would keep the user locked out
   * until expiry.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{
    accessToken: string;
    mustChangePassword: boolean;
    user: { id: string; email: string; role: string; mustChangePassword: boolean };
  }> {
    const qr = await this.tenantConnectionService.getQueryRunner();

    const [user]: [
      | {
          id: string;
          email: string;
          role: string;
          passwordHash: string;
          mustChangePassword: boolean;
        }
      | undefined,
    ] = await qr.query(
      `SELECT id, email, role, "passwordHash", "mustChangePassword"
       FROM users
       WHERE id = $1`,
      [userId],
    );

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await qr.query(
      `UPDATE users
       SET "passwordHash" = $1, "mustChangePassword" = false, "updatedAt" = now()
       WHERE id = $2`,
      [newPasswordHash, userId],
    );

    // Fresh token with mustChangePassword=false so the user can continue
    // with normal API access immediately.
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: this.request.tenantId!,
      tenantSchema: this.request.tenantSchema!,
      role: user.role,
      mustChangePassword: false,
    };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      mustChangePassword: false,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        mustChangePassword: false,
      },
    };
  }
}
