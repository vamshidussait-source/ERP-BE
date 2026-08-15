import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateSectionDto {
  @ApiProperty({
    description:
      'Section name, unique per class (e.g. "Grade 8 - A" only once)',
    example: 'A',
    required: false,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name?: string;

  @ApiProperty({
    description: 'Maximum number of students (pass null to clear)',
    example: 30,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number | null;
}
