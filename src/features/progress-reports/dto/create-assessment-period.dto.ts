import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAssessmentPeriodDto {
  @ApiProperty({
    description: 'Period name (e.g. "Term 1", "Half-Yearly", "Term 2", "Annual")',
    example: 'Term 1',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'Academic year (e.g. "2026-27")',
    example: '2026-27',
    maxLength: 20,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  academicYear: string;

  @ApiProperty({
    description: 'Period start date (ISO 8601 date)',
    example: '2026-04-01',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'Period end date (ISO 8601 date)',
    example: '2026-09-30',
  })
  @IsDateString()
  endDate: string;
}
