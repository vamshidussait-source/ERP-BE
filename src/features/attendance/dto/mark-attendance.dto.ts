import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AttendanceStatus } from '../attendance.entity';

export class MarkAttendanceDto {
  @ApiProperty({
    description: 'Student to mark (foreign key to students.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID()
  studentId: string;

  @ApiProperty({
    description: 'Attendance date (ISO 8601 date, YYYY-MM-DD)',
    example: '2026-08-01',
  })
  @IsDateString()
  date: string;

  @ApiProperty({
    description: 'Attendance status',
    enum: AttendanceStatus,
    example: AttendanceStatus.Present,
  })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @ApiProperty({
    description: 'Optional note (e.g. reason for absence)',
    example: 'Doctor appointment',
    required: false,
    nullable: true,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
