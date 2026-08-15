import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class PlatformAdminLoginDto {
  @ApiProperty({
    description: 'Platform admin email address (system-level account, not a school user)',
    example: 'platform-admin@school-erp.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Platform admin password',
    example: 'S3curePassw0rd!',
    minLength: 1,
  })
  @IsString()
  @MinLength(1)
  password: string;
}
