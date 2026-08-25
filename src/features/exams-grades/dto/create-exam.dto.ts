import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ExamSubjectConfigDto } from './exam-subject-config.dto';

export class CreateExamDto {
  @ApiProperty({
    description: 'Exam name (e.g. "Unit Test 1", "Half-Yearly Exam")',
    example: 'Unit Test 1',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description:
      'Optional assessment period (FK to assessment_periods.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsOptional()
  @IsUUID()
  assessmentPeriodId?: string;

  @ApiProperty({
    description: 'Exam date (ISO 8601 date)',
    example: '2026-08-15',
  })
  @IsDateString()
  examDate: string;

  @ApiPropertyOptional({
    description:
      'Optional grading scale (FK to grading_scales.id). Falls back to school default if omitted.',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsOptional()
  @IsUUID()
  gradingScaleId?: string;

  @ApiProperty({
    description:
      'Subjects included in this exam, with their max marks',
    type: [ExamSubjectConfigDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExamSubjectConfigDto)
  subjects: ExamSubjectConfigDto[];
}
