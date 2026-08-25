import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedAuthModule } from '../auth/shared-auth.module';
import { FeaturesModule } from '../features/features.module';
import { StaffModule } from '../staff/staff.module';
import { Tenant } from '../tenants/tenant.entity';
import { TenantMiddleware } from '../tenants/tenant.middleware';
import { TenantsModule } from '../tenants/tenants.module';
import { TimetableController } from './timetable.controller';
import { TimetableService } from './timetable.service';

@Module({
  imports: [
    TenantsModule,
    SharedAuthModule,
    FeaturesModule,
    StaffModule,
    TypeOrmModule.forFeature([Tenant]),
  ],
  controllers: [TimetableController],
  providers: [TimetableService],
})
export class TimetableModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes(TimetableController);
  }
}
