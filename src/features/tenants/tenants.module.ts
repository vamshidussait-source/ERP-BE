import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedAuthModule } from '../auth/shared-auth.module';
import { AdminTenantsController } from './admin-tenants.controller';
import { Tenant } from './tenant.entity';
import { TenantConnectionCleanupInterceptor } from './tenant-connection-cleanup.interceptor';
import { TenantConnectionService } from './tenant-connection.service';
import { TenantMiddleware } from './tenant.middleware';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant]), SharedAuthModule],
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
    TenantMiddleware,
    TenantConnectionService,
    TenantConnectionCleanupInterceptor,
  ],
})
export class TenantsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes(TenantsController);
  }
}
