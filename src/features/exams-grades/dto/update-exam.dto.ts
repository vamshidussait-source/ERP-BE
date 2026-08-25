import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ExamSubjectConfigDto } from './exam-subject-config.dto';

export class UpdateExamDto {
  @ApiPropertyOptional({
    description: 'Exam name',
    example: 'Unit Test 1',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Optional assessment period (FK to assessment_periods.id)',
  })
  @IsOptional()
  @IsUUID()
  assessmentPeriodId?: string;

  @ApiPropertyOptional({
    description: 'Exam date (ISO 8601 date)',
    example: '2026-08-15',
  })
  @IsOptional()
  @IsDateString()
  examDate?: string;

  @ApiPropertyOptional({
    description: 'Optional grading scale (FK to grading_scales.id)',
  })
  @IsOptional()
  @IsUUID()
  gradingScaleId?: string;

  @ApiPropertyOptional({
    description:
      'Replaces the full set of subject configs for this exam (at least one required)',
    type: [ExamSubjectConfigDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExamSubjectConfigDto)
  subjects?: ExamSubjectConfigDto[];
}
