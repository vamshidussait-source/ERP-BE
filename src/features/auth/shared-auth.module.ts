import { Module } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { TenantGuard } from './tenant.guard';

/**
 * Provides guards that need to be used across multiple modules (TenantsModule,
 * AuthModule, future feature modules) without creating circular dependencies.
 *
 * JwtAuthGuard and TenantGuard have no NestJS DI dependencies on other
 * application providers — they only depend on Passport's internal strategy
 * registry (which is populated by JwtStrategy elsewhere) and the request
 * execution context. RolesGuard depends only on the framework's Reflector,
 * which is available in every module context.
 */
@Module({
  providers: [JwtAuthGuard, TenantGuard, RolesGuard],
  exports: [JwtAuthGuard, TenantGuard, RolesGuard],
})
export class SharedAuthModule {}
