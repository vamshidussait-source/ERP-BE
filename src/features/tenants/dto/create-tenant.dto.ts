import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TenantPlanTier } from '../tenant.entity';

export class CreateTenantDto {
  @ApiProperty({
    description: 'School name',
    example: 'Greenwood High School',
    minLength: 2,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description:
      'Postgres schema name for the tenant (lowercase letters, numbers, underscores, must start with a letter)',
    example: 'greenwood',
    minLength: 2,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'schemaName must be a valid Postgres identifier (lowercase letters, numbers, underscores, and must start with a letter)',
  })
  schemaName: string;

  @ApiProperty({
    description: 'Subdomain used to resolve the tenant from the Host header',
    example: 'greenwood',
    minLength: 2,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  subdomain: string;

  @ApiProperty({
    description: 'Plan tier',
    enum: TenantPlanTier,
    example: TenantPlanTier.Trial,
    required: false,
  })
  @IsOptional()
  @IsEnum(TenantPlanTier)
  planTier?: TenantPlanTier;

  @ApiProperty({
    description: 'Whether the tenant account is active',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
