import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedAuthModule } from '../auth/shared-auth.module';
import { FeaturesModule } from '../features/features.module';
import { ParentStudentLinksModule } from '../parent-student-links/parent-student-links.module';
import { StudentsModule } from '../students/students.module';
import { Tenant } from '../tenants/tenant.entity';
import { TenantMiddleware } from '../tenants/tenant.middleware';
import { TenantsModule } from '../tenants/tenants.module';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { GradingScalesController } from './grading-scales.controller';
import { GradingScalesService } from './grading-scales.service';
import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';

@Module({
  imports: [
    TenantsModule,
    SharedAuthModule,
    FeaturesModule,
    ParentStudentLinksModule,
    StudentsModule,
    TypeOrmModule.forFeature([Tenant]),
  ],
  controllers: [
    SubjectsController,
    GradingScalesController,
    ExamsController,
  ],
  providers: [SubjectsService, GradingScalesService, ExamsService],
  exports: [SubjectsService, GradingScalesService, ExamsService],
})
export class ExamsGradesModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes(
        SubjectsController,
        GradingScalesController,
        ExamsController,
      );
  }
}
