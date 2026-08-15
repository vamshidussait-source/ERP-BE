import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
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
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
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
      }),
    }),
    HealthModule,
    TenantsModule,
    StudentsModule,
    ClassesModule,
    StaffModule,
    AttendanceModule,
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
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
