import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedAuthModule } from '../auth/shared-auth.module';
import { Tenant } from '../tenants/tenant.entity';
import { TenantMiddleware } from '../tenants/tenant.middleware';
import { TenantsModule } from '../tenants/tenants.module';
import { ParentStudentLinksController } from './parent-student-links.controller';
import { ParentStudentLinksService } from './parent-student-links.service';

@Module({
  imports: [
    TenantsModule,
    SharedAuthModule,
    TypeOrmModule.forFeature([Tenant]),
  ],
  controllers: [ParentStudentLinksController],
  providers: [ParentStudentLinksService],
  exports: [ParentStudentLinksService],
})
export class ParentStudentLinksModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes(ParentStudentLinksController);
  }
}
