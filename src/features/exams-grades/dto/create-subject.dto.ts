import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSubjectDto {
  @ApiProperty({
    description:
      'Subject name (e.g. "Mathematics", "Science", "Hindi") — school-configurable, free text',
    example: 'Mathematics',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}
