import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateStaffDto {
  @ApiProperty({
    description: 'Staff first name',
    example: 'Ada',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  firstName: string;

  @ApiProperty({
    description: 'Staff last name',
    example: 'Lovelace',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  lastName: string;

  @ApiProperty({
    description: 'Staff email, unique within the tenant schema',
    example: 'ada@greenwood.edu',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Contact phone number',
    example: '+1-555-0100',
    required: false,
    nullable: true,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiProperty({
    description: 'Job designation',
    example: 'Math Teacher',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  designation: string;

  @ApiProperty({
    description: 'Unique employee ID within the tenant schema',
    example: 'EMP-0001',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  employeeId: string;
}
