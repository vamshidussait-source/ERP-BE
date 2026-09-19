import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  AnnouncementAudienceType,
  AnnouncementPriority,
} from '../announcement.entity';

/**
 * Partial update of an announcement. Only allowed while the announcement is
 * still a draft/scheduled (not yet sent) — enforced in the service.
 */
export class UpdateAnnouncementDto {
  @ApiPropertyOptional({ description: 'Announcement title', example: 'Sports Day', maxLength: 255 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    description: 'Announcement body (free-text)',
    example: 'Annual Sports Day is on October 12th. Parents are welcome.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  message?: string;

  @ApiPropertyOptional({
    description:
      "Audience — 'all_staff' | 'all_parents' | 'all_students' | 'specific_sections'",
    enum: AnnouncementAudienceType,
  })
  @IsOptional()
  @IsEnum(AnnouncementAudienceType)
  audienceType?: AnnouncementAudienceType;

  @ApiPropertyOptional({
    description:
      'Section IDs targeted when audienceType is specific_sections (pass an ' +
      'empty array or null to clear; ignored for other audience types)',
    type: [String],
    format: 'uuid',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  audienceSectionIds?: string[] | null;

  @ApiPropertyOptional({
    description: "Priority — 'normal' | 'important' | 'urgent'",
    enum: AnnouncementPriority,
  })
  @IsOptional()
  @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority;

  @ApiPropertyOptional({
    description:
      "When the announcement should go out (pass null to clear and unschedule)",
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsNotEmpty()
  scheduledFor?: string | null;
}
