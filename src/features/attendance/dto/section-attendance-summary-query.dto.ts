import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class SectionAttendanceSummaryQueryDto {
  @ApiProperty({
    description: 'Start date (inclusive)',
    example: '2026-01-01',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'End date (inclusive)',
    example: '2026-12-31',
  })
  @IsDateString()
  endDate: string;
}
