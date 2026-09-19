import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedAuthModule } from '../auth/shared-auth.module';
import { Tenant } from '../tenants/tenant.entity';
import { TenantMiddleware } from '../tenants/tenant.middleware';
import { TenantsModule } from '../tenants/tenants.module';
import { DashboardController } from './dashboard.controller';
import { DashboardSummaryService } from './dashboard-summary.service';

@Module({
  imports: [
    TenantsModule,
    SharedAuthModule,
    // TenantMiddleware (applied below) injects the tenants repository, so the
    // forFeature registration must exist in this module's own context (same
    // pattern as AnnouncementsModule).
    TypeOrmModule.forFeature([Tenant]),
  ],
  controllers: [DashboardController],
  providers: [DashboardSummaryService],
})
export class DashboardModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Resolve the tenant schema from the request (X-Tenant-ID header or
    // subdomain) before any dashboard handler runs, so that TenantGuard can
    // match the JWT's tenantId and TenantConnectionService can scope queries
    // to the tenant's search_path.
    consumer.apply(TenantMiddleware).forRoutes(DashboardController);
  }
}
