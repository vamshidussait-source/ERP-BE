import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const ACCOUNT_ACCESS_TYPES = ['staff', 'student', 'parent'] as const;
export type AccountAccessType = (typeof ACCOUNT_ACCESS_TYPES)[number];

export const LOGIN_STATUSES = [
  'active',
  'no_login',
  'password_reset_pending',
  'revoked',
] as const;
export type LoginStatus = (typeof LOGIN_STATUSES)[number];

export class ListAccountAccessQueryDto {
  @ApiPropertyOptional({
    description:
      "Filter by record type: 'staff' | 'student' | 'parent'. Omit to get all types.",
    enum: ACCOUNT_ACCESS_TYPES,
    required: false,
  })
  @IsOptional()
  @IsIn(ACCOUNT_ACCESS_TYPES)
  type?: AccountAccessType;

  @ApiPropertyOptional({
    description: "Filter by login existence: 'true' or 'false'.",
    enum: ['true', 'false'],
    required: false,
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  hasLogin?: 'true' | 'false';

  @ApiPropertyOptional({
    description:
      "Filter by login status: 'active' | 'no_login' | 'password_reset_pending' | 'revoked'. " +
      "'revoked' means the login exists but was deactivated by an admin.",
    enum: LOGIN_STATUSES,
    required: false,
  })
  @IsOptional()
  @IsIn(LOGIN_STATUSES)
  loginStatus?: LoginStatus;

  @ApiPropertyOptional({
    description: 'Search by name or email (case-insensitive, partial match).',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based).', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Rows per page (max 100).', example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
