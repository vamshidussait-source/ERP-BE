import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, MaxLength } from 'class-validator';

export class CreateGradeBandDto {
  @ApiProperty({
    description: 'Minimum percentage for this band (inclusive)',
    example: 91,
  })
  @IsNumber()
  @IsNotEmpty()
  minPercentage: number;

  @ApiProperty({
    description: 'Maximum percentage for this band (inclusive)',
    example: 100,
  })
  @IsNumber()
  @IsNotEmpty()
  maxPercentage: number;

  @ApiProperty({
    description: 'Letter grade for this band (e.g. "A1", "A2", "B1")',
    example: 'A1',
    maxLength: 10,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  grade: string;
}
