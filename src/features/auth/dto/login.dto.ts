import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'admin@greenwood.edu',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'S3curePassw0rd!',
    minLength: 1,
  })
  @IsString()
  @MinLength(1)
  password: string;
}
