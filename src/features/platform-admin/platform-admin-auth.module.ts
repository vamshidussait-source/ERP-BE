import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedAuthModule } from '../auth/shared-auth.module';
import { PlatformAdminAuthController } from './platform-admin-auth.controller';
import { PlatformAdminAuthService } from './platform-admin-auth.service';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformAdmin } from './platform-admin.entity';

/**
 * System-level platform admin authentication.
 *
 * Completely separate from tenant-scoped user auth: the entity lives in the
 * public schema, the login route bypasses TenantMiddleware entirely, and the
 * issued JWT carries no tenantId/tenantSchema claims.
 *
 * Does NOT apply TenantMiddleware to any route in this module — no
 * X-Tenant-ID header is needed here.
 */
@Module({
  imports: [
    // Provides JwtAuthGuard for pairing with PlatformAdminGuard on protected
    // system-level routes (the 'jwt' strategy itself is registered by
    // AuthModule's JwtStrategy, which is part of the app module graph).
    SharedAuthModule,
    TypeOrmModule.forFeature([PlatformAdmin]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');

        if (!secret) {
          throw new Error(
            'JWT_SECRET environment variable is required. ' +
              'Set a long, random, unique value in your .env file.',
          );
        }

        return {
          secret,
          signOptions: { expiresIn: '24h' },
        };
      },
    }),
  ],
  controllers: [PlatformAdminAuthController],
  providers: [PlatformAdminAuthService, PlatformAdminGuard],
  exports: [PlatformAdminAuthService, PlatformAdminGuard],
})
export class PlatformAdminAuthModule {}
