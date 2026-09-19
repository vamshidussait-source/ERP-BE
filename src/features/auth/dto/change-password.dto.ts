import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'The user\u2019s current password',
    example: 'TempP@ss123',
  })
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @ApiProperty({
    description: 'The new password to set (min 8 characters)',
    example: 'N3wS3curePass!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  newPassword: string;
}
