import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateOrUpdateReportDto {
  @ApiProperty({
    description: 'Student this report belongs to (FK to students.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID()
  studentId: string;

  @ApiProperty({
    description: 'Assessment period this report is for (FK to assessment_periods.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID()
  assessmentPeriodId: string;

  @ApiPropertyOptional({
    description: 'Class teacher remarks (free-text)',
    example: 'Grace is a diligent student who participates actively in class.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  classTeacherRemarks?: string | null;

  @ApiPropertyOptional({
    description: 'Attendance percentage snapshot for this period (0–100)',
    example: 95.5,
    nullable: true,
  })
  @IsOptional()
  attendancePercentage?: number | null;

  @ApiPropertyOptional({
    description: 'Staff member who prepared this report (FK to staff.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  preparedByStaffId?: string | null;
}
