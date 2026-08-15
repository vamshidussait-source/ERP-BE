import { Module } from '@nestjs/common';
import { AppLogger } from '../../common/logger/app.logger';
import { SharedAuthModule } from '../auth/shared-auth.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Shared, tenant-agnostic notifications module.
 *
 * Deliberately NOT tenant-scoped: no TenantMiddleware, no TypeOrmModule
 * forFeature, no TenantGuard — credentials and provider configuration are
 * application-level. Only JwtAuthGuard is applied on the controller.
 *
 * NotificationsService is exported so other modules (e.g. the upcoming Fee
 * Management module) can inject and use it.
 */
@Module({
  imports: [SharedAuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, AppLogger],
  exports: [NotificationsService],
})
export class NotificationsModule {}
