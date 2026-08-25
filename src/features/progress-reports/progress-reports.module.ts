import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedAuthModule } from '../auth/shared-auth.module';
import { FeaturesModule } from '../features/features.module';
import { ParentStudentLinksModule } from '../parent-student-links/parent-student-links.module';
import { StudentsModule } from '../students/students.module';
import { Tenant } from '../tenants/tenant.entity';
import { TenantMiddleware } from '../tenants/tenant.middleware';
import { TenantsModule } from '../tenants/tenants.module';
import { AssessmentPeriodsController } from './assessment-periods.controller';
import { AssessmentPeriodsService } from './assessment-periods.service';
import { ProgressReportsController } from './progress-reports.controller';
import { ProgressReportsService } from './progress-reports.service';

@Module({
  imports: [
    TenantsModule,
    SharedAuthModule,
    FeaturesModule,
    ParentStudentLinksModule,
    StudentsModule,
    TypeOrmModule.forFeature([Tenant]),
  ],
  controllers: [AssessmentPeriodsController, ProgressReportsController],
  providers: [AssessmentPeriodsService, ProgressReportsService],
})
export class ProgressReportsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes(AssessmentPeriodsController, ProgressReportsController);
  }
}
