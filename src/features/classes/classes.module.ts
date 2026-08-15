import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedAuthModule } from '../auth/shared-auth.module';
import { Tenant } from '../tenants/tenant.entity';
import { TenantMiddleware } from '../tenants/tenant.middleware';
import { TenantsModule } from '../tenants/tenants.module';
import { ClassSectionsController } from './class-sections.controller';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { SectionsController } from './sections.controller';
import { SectionsService } from './sections.service';

@Module({
  imports: [
    TenantsModule,
    SharedAuthModule,
    TypeOrmModule.forFeature([Tenant]),
  ],
  controllers: [ClassesController, ClassSectionsController, SectionsController],
  providers: [ClassesService, SectionsService],
})
export class ClassesModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Resolve the tenant schema from the request (X-Tenant-ID header or
    // subdomain) before any classes/sections handler runs, so that
    // TenantConnectionService can scope queries to the tenant's search_path.
    consumer
      .apply(TenantMiddleware)
      .forRoutes(
        ClassesController,
        ClassSectionsController,
        SectionsController,
      );
  }
}
