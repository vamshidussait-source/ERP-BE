import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateHealthCheckDto {
  @ApiProperty({
    description: 'Message to validate',
    example: 'Hello ERP',
    minLength: 3,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  message: string;
}
