import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsUUID, Min } from 'class-validator';

export class ExamSubjectConfigDto {
  @ApiProperty({
    description: 'Subject id (FK to subjects.id)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({
    description: 'Maximum marks for this subject in this exam',
    example: 100,
  })
  @IsInt()
  @Min(1)
  maxMarks: number;
}
