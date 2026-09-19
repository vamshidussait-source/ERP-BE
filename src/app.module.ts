import './pg-date-parser'; // register pg date OID parser before any connection
import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import envConfig from './config/env.config';
import { AuthModule } from './features/auth/auth.module';
import { PlatformAdminAuthModule } from './features/platform-admin/platform-admin-auth.module';
import { AttendanceModule } from './features/attendance/attendance.module';
import { FilesModule } from './features/files/files.module';
import { NotificationsModule } from './features/notifications/notifications.module';
import { ClassesModule } from './features/classes/classes.module';
import { HealthModule } from './features/health/health.module';
import { StaffModule } from './features/staff/staff.module';
import { StudentsModule } from './features/students/students.module';
import { TenantsModule } from './features/tenants/tenants.module';
import { FeaturesModule } from './features/features/features.module';
import { ParentStudentLinksModule } from './features/parent-student-links/parent-student-links.module';
import { TimetableModule } from './features/timetable/timetable.module';
import { ProgressReportsModule } from './features/progress-reports/progress-reports.module';
import { AnnouncementsModule } from './features/announcements/announcements.module';
import { ExamsGradesModule } from './features/exams-grades/exams-grades.module';
import { AccountAccessModule } from './features/account-access/account-access.module';
import { DashboardModule } from './features/dashboard/dashboard.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './features/auth/jwt-auth.guard';
import { MustChangePasswordGuard } from './features/auth/must-change-password.guard';
import { AppLogger } from './common/logger/app.logger';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('appConfig.database.host'),
        port: configService.get<number>('appConfig.database.port'),
        username: configService.get<string>('appConfig.database.username'),
        password: configService.get<string>('appConfig.database.password'),
        database: configService.get<string>('appConfig.database.name'),
        autoLoadEntities: true,
        synchronize: false,
        logging: process.env.NODE_ENV !== 'production',
        extra: {
          max: 20,
          connectionTimeoutMillis: 10000,
        },
      }),
    }),
    HealthModule,
    TenantsModule,
    FeaturesModule,
    StudentsModule,
    ClassesModule,
    StaffModule,
    AttendanceModule,
    ParentStudentLinksModule,
    TimetableModule,
    ProgressReportsModule,
    AnnouncementsModule,
    ExamsGradesModule,
    AccountAccessModule,
    DashboardModule,
    FilesModule,
    NotificationsModule,
    AuthModule,
    PlatformAdminAuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AppLogger,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    // Global guard chain — order matters:
    //   1. JwtAuthGuard authenticates the token and populates request.user.
    //   2. MustChangePasswordGuard reads the mustChangePassword claim from
    //      request.user and blocks every route except the password-change
    //      flow for users still on a temporary password.
    // Global (not per-controller) so every existing and future authenticated
    // route is covered automatically.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: MustChangePasswordGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
