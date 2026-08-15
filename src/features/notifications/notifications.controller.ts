import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SendTestNotificationDto } from './dto/send-test-notification.dto';
import {
  NotificationChannel,
  NotificationsService,
} from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('test')
  @ApiOperation({
    summary: 'Send a test notification (mock)',
    description:
      'Internal-only test endpoint. NOT tenant-scoped: it lives in the ' +
      'public/application scope because notification credentials are ' +
      'application-level, not per-school — so no X-Tenant-ID header or ' +
      'TenantGuard is required. A valid JWT is still required (JwtAuthGuard) ' +
      'so the endpoint is not fully public.\n\n' +
      'Currently in mock mode: nothing is actually sent. The service logs ' +
      'what would be sent and returns a mock success response, letting us ' +
      'verify the wiring end-to-end before real provider credentials exist.',
  })
  @ApiResponse({
    status: 201,
    description: 'Mock notification acknowledged (nothing actually sent)',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (invalid type)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  test(@Body() dto: SendTestNotificationDto) {
    switch (dto.type) {
      case NotificationChannel.Sms:
        return this.notificationsService.sendSms(
          '+15550001000',
          'Test SMS from School ERP',
        );
      case NotificationChannel.Email:
        return this.notificationsService.sendEmail(
          'test@example.com',
          'Test email from School ERP',
          'Hello from School ERP — this is a test email.',
        );
      case NotificationChannel.Push:
        return this.notificationsService.sendPushNotification(
          'mock-device-token',
          'Test push from School ERP',
          'Hello from School ERP — this is a test push notification.',
        );
    }
  }
}
