import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppLogger } from '../../common/logger/app.logger';
import { SharedAuthModule } from '../auth/shared-auth.module';
import { Tenant } from '../tenants/tenant.entity';
import { TenantMiddleware } from '../tenants/tenant.middleware';
import { TenantsModule } from '../tenants/tenants.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [
    TenantsModule,
    SharedAuthModule,
    TypeOrmModule.forFeature([Tenant]),
  ],
  controllers: [FilesController],
  providers: [FilesService, AppLogger],
  exports: [FilesService],
})
export class FilesModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Resolve the tenant schema from the request (X-Tenant-ID header or
    // subdomain) before any file handler runs, so that
    // TenantConnectionService can scope queries to the tenant's search_path.
    consumer.apply(TenantMiddleware).forRoutes(FilesController);
  }
}
