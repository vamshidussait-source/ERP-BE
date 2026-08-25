import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class EnterMarksDto {
  @ApiProperty({
    description: 'Student this mark belongs to (FK to students.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({
    description: 'Subject this mark belongs to (FK to subjects.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({
    description:
      'Marks obtained (nullable to allow "not yet entered" as distinct from "scored zero")',
    example: 85,
    nullable: true,
  })
  @IsNumber()
  @Min(0)
  marksObtained: number;

  @ApiPropertyOptional({
    description:
      'Staff member who entered this mark (FK to staff.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsOptional()
  @IsUUID()
  enteredByStaffId?: string;
}
