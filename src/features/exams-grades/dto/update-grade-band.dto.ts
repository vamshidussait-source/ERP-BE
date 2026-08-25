import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateGradeBandDto {
  @ApiPropertyOptional({
    description: 'Minimum percentage for this band (inclusive)',
    example: 91,
  })
  @IsOptional()
  @IsNumber()
  minPercentage?: number;

  @ApiPropertyOptional({
    description: 'Maximum percentage for this band (inclusive)',
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  maxPercentage?: number;

  @ApiPropertyOptional({
    description: 'Letter grade for this band (e.g. "A1", "A2", "B1")',
    example: 'A1',
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  grade?: string;
}
