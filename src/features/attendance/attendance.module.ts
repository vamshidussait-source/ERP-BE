import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedAuthModule } from '../auth/shared-auth.module';
import { Tenant } from '../tenants/tenant.entity';
import { TenantMiddleware } from '../tenants/tenant.middleware';
import { TenantsModule } from '../tenants/tenants.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  imports: [
    TenantsModule,
    SharedAuthModule,
    TypeOrmModule.forFeature([Tenant]),
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Resolve the tenant schema from the request (X-Tenant-ID header or
    // subdomain) before any attendance handler runs, so that
    // TenantConnectionService can scope queries to the tenant's search_path.
    consumer.apply(TenantMiddleware).forRoutes(AttendanceController);
  }
}
