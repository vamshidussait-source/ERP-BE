import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { StaffStatus } from '../staff.entity';

export class UpdateStaffDto {
  @ApiProperty({
    description: 'Staff first name',
    example: 'Ada',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  firstName?: string;

  @ApiProperty({
    description: 'Staff last name',
    example: 'Lovelace',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  lastName?: string;

  @ApiProperty({
    description: 'Staff email, unique within the tenant schema',
    example: 'ada@greenwood.edu',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'Contact phone number (pass null to clear)',
    example: '+1-555-0100',
    required: false,
    nullable: true,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @ApiProperty({
    description: 'Job designation',
    example: 'Math Teacher',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  designation?: string;

  @ApiProperty({
    description: 'Unique employee ID within the tenant schema',
    example: 'EMP-0001',
    required: false,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  employeeId?: string;

  @ApiProperty({
    description: 'New staff status',
    enum: StaffStatus,
    example: StaffStatus.Active,
    required: false,
  })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;

  @ApiProperty({
    description: 'Department the staff member belongs to (pass null to clear)',
    example: 'Science',
    required: false,
    nullable: true,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  departmentName?: string | null;

  @ApiProperty({
    description:
      "Employment type (free-form, e.g. 'full_time', 'part_time', 'contract'; pass null to clear)",
    example: 'full_time',
    required: false,
    nullable: true,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  employmentType?: string | null;

  @ApiProperty({
    description: 'Office or staff room location (pass null to clear)',
    example: 'B-204',
    required: false,
    nullable: true,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  officeRoom?: string | null;
}
