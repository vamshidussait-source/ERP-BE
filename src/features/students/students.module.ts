import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedAuthModule } from '../auth/shared-auth.module';
import { Tenant } from '../tenants/tenant.entity';
import { TenantMiddleware } from '../tenants/tenant.middleware';
import { TenantsModule } from '../tenants/tenants.module';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [
    TenantsModule,
    SharedAuthModule,
    TypeOrmModule.forFeature([Tenant]),
  ],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Resolve the tenant schema from the request (X-Tenant-ID header or
    // subdomain) before any students handler runs, so that
    // TenantConnectionService can scope queries to the tenant's search_path.
    consumer.apply(TenantMiddleware).forRoutes(StudentsController);
  }
}
