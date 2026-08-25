import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { DayOfWeek } from '../timetable-entry.entity';

export class UpdateTimetableEntryDto {
  @ApiPropertyOptional({
    description: 'Section this entry belongs to (FK to sections.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @ApiPropertyOptional({
    description: 'Day of the week',
    enum: DayOfWeek,
    example: DayOfWeek.Monday,
  })
  @IsOptional()
  @IsEnum(DayOfWeek)
  dayOfWeek?: DayOfWeek;

  @ApiPropertyOptional({
    description: 'Period number (1-based)',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  periodNumber?: number;

  @ApiPropertyOptional({
    description: 'Subject name',
    example: 'Mathematics',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subject?: string;

  @ApiPropertyOptional({
    description: 'Staff member teaching this period (FK to staff.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  staffId?: string | null;

  @ApiPropertyOptional({
    description: 'Period start time (HH:MM, 24-hour)',
    example: '08:00',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  startTime?: string;

  @ApiPropertyOptional({
    description: 'Period end time (HH:MM, 24-hour)',
    example: '08:45',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  endTime?: string;
}
