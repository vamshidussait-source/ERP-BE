import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateGradingScaleDto {
  @ApiPropertyOptional({
    description: 'Scale name',
    example: 'CBSE 9-Point Scale',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Whether this is the school\'s default grading scale',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
