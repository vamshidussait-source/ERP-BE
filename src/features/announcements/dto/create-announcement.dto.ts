import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  ValidateIf,
} from 'class-validator';
import {
  AnnouncementAudienceType,
  AnnouncementPriority,
} from '../announcement.entity';

export class CreateAnnouncementDto {
  @ApiProperty({ description: 'Announcement title', example: 'Sports Day', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({
    description: 'Announcement body (free-text)',
    example: 'Annual Sports Day is on October 12th. Parents are welcome.',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({
    description:
      "Audience — 'all_staff' | 'all_parents' | 'all_students' | 'specific_sections'",
    enum: AnnouncementAudienceType,
    example: AnnouncementAudienceType.AllParents,
  })
  @IsEnum(AnnouncementAudienceType)
  audienceType: AnnouncementAudienceType;

  @ApiPropertyOptional({
    description:
      'Section IDs targeted when audienceType is specific_sections. Required ' +
      'for specific_sections, must be empty/omitted otherwise.',
    type: [String],
    format: 'uuid',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  @ValidateIf(
    (dto: CreateAnnouncementDto) =>
      dto.audienceType === AnnouncementAudienceType.SpecificSections,
  )
  @IsNotEmpty({ message: 'audienceSectionIds must contain at least one section id when audienceType is specific_sections' })
  audienceSectionIds?: string[];

  @ApiPropertyOptional({
    description: "Priority — 'normal' (default) | 'important' | 'urgent'",
    enum: AnnouncementPriority,
    default: AnnouncementPriority.Normal,
  })
  @IsOptional()
  @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority;

  @ApiPropertyOptional({
    description:
      "Initial status — 'draft' (default) or 'sent' to create-and-send " +
      "immediately. 'scheduled' is set by supplying scheduledFor with " +
      "status 'draft'.",
    enum: ['draft', 'sent'],
    default: 'draft',
  })
  @IsOptional()
  @IsIn(['draft', 'sent'])
  status?: 'draft' | 'sent';

  @ApiPropertyOptional({
    description:
      'When the announcement should go out. Passing this with status ' +
      "'draft' marks the announcement scheduled.",
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsNotEmpty()
  scheduledFor?: string;

  @ApiPropertyOptional({
    description: 'Authoring staff member id (FK to staff.id)',
    format: 'uuid',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID('4')
  createdByStaffId?: string | null;
}
