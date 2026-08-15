import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { NotificationChannel } from '../notifications.service';

export class SendTestNotificationDto {
  @ApiProperty({
    description: 'Which notification channel to test',
    enum: NotificationChannel,
    example: NotificationChannel.Sms,
  })
  @IsEnum(NotificationChannel)
  type: NotificationChannel;
}
