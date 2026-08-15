import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { PlatformAdminJwtPayload } from './platform-admin-jwt-payload.interface';
import { PlatformAdmin } from './platform-admin.entity';

@Injectable()
export class PlatformAdminAuthService {
  constructor(
    @InjectRepository(PlatformAdmin)
    private readonly platformAdminRepository: Repository<PlatformAdmin>,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Authenticates a platform admin against the PUBLIC platform_admins table.
   *
   * Uses a plain TypeORM repository — no TenantConnectionService is involved
   * because this identity is system-level, not tenant-scoped.
   *
   * On success, issues a JWT whose payload is { sub: adminId, role:
   * 'platform_admin' } with deliberately NO tenantId/tenantSchema claims.
   */
  async login(
    email: string,
    password: string,
  ): Promise<{
    accessToken: string;
    admin: { id: string; email: string; name: string };
  }> {
    const admin = await this.platformAdminRepository.findOne({
      where: { email },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: PlatformAdminJwtPayload = {
      sub: admin.id,
      role: 'platform_admin',
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
      },
    };
  }
}
