import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ACCOUNT_ACCESS_TYPES } from './list-account-access-query.dto';

export class IssueLoginDto {
  @ApiProperty({
    description: "Which kind of record the login is for: 'staff' | 'student' | 'parent'",
    enum: ACCOUNT_ACCESS_TYPES,
    example: 'parent',
  })
  @IsIn(ACCOUNT_ACCESS_TYPES)
  targetType: 'staff' | 'student' | 'parent';

  @ApiProperty({
    description:
      'UUID of the staff, student, or (for parent) representative record to attach the login to',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID()
  targetId: string;

  @ApiProperty({
    description: 'Login email (unique within the tenant)',
    example: 'parent@example.com',
  })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description:
      'Student UUIDs to link to a parent login. Required when targetType is "parent" ' +
      '(one or more — supports multiple children). Ignored for other target types.',
    type: [String],
    format: 'uuid',
    example: ['f47ac10b-58cc-4372-a567-0e02b2c3d479'],
  })
  @ValidateIf((o) => o.targetType === 'parent')
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  linkedStudentIds?: string[];
}
