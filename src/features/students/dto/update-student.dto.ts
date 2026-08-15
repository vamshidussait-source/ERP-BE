import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { StudentStatus } from '../student.entity';

export class UpdateStudentDto {
  @ApiProperty({
    description: 'Student first name',
    example: 'Grace',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  firstName?: string;

  @ApiProperty({
    description: 'Student last name',
    example: 'Hopper',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  lastName?: string;

  @ApiProperty({
    description: 'Student date of birth (ISO 8601 date string)',
    example: '2006-04-14',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({
    description: 'Unique admission number within the tenant schema',
    example: 'ADM-2024-002',
    required: false,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  admissionNumber?: string;

  @ApiProperty({
    description: 'Section the student belongs to (pass null to unassign)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  sectionId?: string | null;

  @ApiProperty({
    description: 'New student status',
    enum: StudentStatus,
    example: StudentStatus.Active,
    required: false,
  })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}
