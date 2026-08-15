import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedAuthModule } from '../auth/shared-auth.module';
import { PlatformAdminAuthModule } from '../platform-admin/platform-admin-auth.module';
import { AdminTenantsController } from './admin-tenants.controller';
import { Tenant } from './tenant.entity';
import { TenantConnectionCleanupInterceptor } from './tenant-connection-cleanup.interceptor';
import { TenantConnectionService } from './tenant-connection.service';
import { TenantMiddleware } from './tenant.middleware';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant]),
    SharedAuthModule,
    // Exports PlatformAdminGuard, needed by AdminTenantsController's
    // @UseGuards(JwtAuthGuard, PlatformAdminGuard) on the provision route.
    PlatformAdminAuthModule,
  ],
  controllers: [TenantsController, AdminTenantsController],
  providers: [
    TenantsService,
    TenantProvisioningService,
    TenantMiddleware,
    TenantConnectionCleanupInterceptor,
    TenantConnectionService,
  ],
  exports: [
    TenantsService,
    TenantProvisioningService,
    // TenantMiddleware and TenantConnectionCleanupInterceptor are still
    // exported here for the tenant-scoped feature modules (students, staff,
    // classes, attendance, files, auth) that apply them to their own routes.
    // TenantsController itself is no longer tenant-scoped, so this module
    // applies no middleware of its own.
    TenantMiddleware,
    TenantConnectionService,
    TenantConnectionCleanupInterceptor,
  ],
})
export class TenantsModule {}
