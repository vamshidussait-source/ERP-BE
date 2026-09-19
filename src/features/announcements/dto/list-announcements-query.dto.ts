import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const ANNOUNCEMENT_STATUS_FILTERS = [
  'all',
  'sent',
  'scheduled',
  'drafts',
] as const;
export type AnnouncementStatusFilter = (typeof ANNOUNCEMENT_STATUS_FILTERS)[number];

export class ListAnnouncementsQueryDto {
  @ApiPropertyOptional({
    description:
      "Filter by status: 'all' (default) | 'sent' | 'scheduled' | 'drafts'.",
    enum: ANNOUNCEMENT_STATUS_FILTERS,
    default: 'all',
    required: false,
  })
  @IsOptional()
  @IsIn(ANNOUNCEMENT_STATUS_FILTERS)
  status?: AnnouncementStatusFilter;

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
  limit?: number;
}
