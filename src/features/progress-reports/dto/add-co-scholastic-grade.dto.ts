import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AddCoScholasticGradeDto {
  @ApiProperty({
    description:
      'Co-scholastic area name (e.g. "Discipline", "Work Education", "Art Education", "Health & Physical Education")',
    example: 'Discipline',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  area: string;

  @ApiProperty({
    description: 'Letter grade for this area (e.g. "A", "B", "C")',
    example: 'A',
    maxLength: 10,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  grade: string;
}
