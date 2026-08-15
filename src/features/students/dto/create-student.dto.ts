import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateStudentDto {
  @ApiProperty({
    description: 'Student first name',
    example: 'Grace',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  firstName: string;

  @ApiProperty({
    description: 'Student last name',
    example: 'Hopper',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  lastName: string;

  @ApiProperty({
    description: 'Student date of birth (ISO 8601 date string)',
    example: '2006-04-14',
  })
  @IsDateString()
  dateOfBirth: string;

  @ApiProperty({
    description: 'Unique admission number within the tenant schema',
    example: 'ADM-2024-001',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  admissionNumber: string;

  @ApiProperty({
    description: 'Section the student belongs to (foreign key to sections.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  sectionId?: string | null;
}
