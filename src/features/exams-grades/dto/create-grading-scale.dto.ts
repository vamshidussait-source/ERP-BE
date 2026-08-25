import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateGradingScaleDto {
  @ApiProperty({
    description: 'Scale name (e.g. "CBSE 9-Point Scale", "Simple A-F")',
    example: 'CBSE 9-Point Scale',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description:
      'Whether this is the school\'s default grading scale (at most one should be true)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
