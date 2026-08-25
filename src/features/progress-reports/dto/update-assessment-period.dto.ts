import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateAssessmentPeriodDto {
  @ApiPropertyOptional({
    description: 'Period name',
    example: 'Term 1',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Academic year',
    example: '2026-27',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  academicYear?: string;

  @ApiPropertyOptional({
    description: 'Period start date (ISO 8601 date)',
    example: '2026-04-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Period end date (ISO 8601 date)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
