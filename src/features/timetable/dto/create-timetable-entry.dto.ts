import { ApiProperty } from '@nestjs/swagger';
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

export class CreateTimetableEntryDto {
  @ApiProperty({
    description: 'Section this entry belongs to (FK to sections.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID()
  sectionId: string;

  @ApiProperty({
    description: 'Day of the week',
    enum: DayOfWeek,
    example: DayOfWeek.Monday,
  })
  @IsEnum(DayOfWeek)
  dayOfWeek: DayOfWeek;

  @ApiProperty({
    description: 'Period number (1-based)',
    example: 1,
  })
  @IsInt()
  @Min(1)
  periodNumber: number;

  @ApiProperty({
    description: 'Subject name',
    example: 'Mathematics',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subject: string;

  @ApiProperty({
    description: 'Staff member teaching this period (FK to staff.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  staffId?: string | null;

  @ApiProperty({
    description: 'Period start time (HH:MM, 24-hour)',
    example: '08:00',
  })
  @IsString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({
    description: 'Period end time (HH:MM, 24-hour)',
    example: '08:45',
  })
  @IsString()
  @IsNotEmpty()
  endTime: string;
}
