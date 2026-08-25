import { ApiProperty } from '@nestjs/swagger';

/**
 * Enriched student info returned by the "my children" endpoint.
 */
export class ParentChildDto {
  @ApiProperty({
    description: 'Student identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  id: string;

  @ApiProperty({ description: 'Student first name', example: 'Grace' })
  firstName: string;

  @ApiProperty({ description: 'Student last name', example: 'Hopper' })
  lastName: string;

  @ApiProperty({
    description: 'Unique admission number within the tenant schema',
    example: 'ADM-2024-001',
  })
  admissionNumber: string;

  @ApiProperty({
    description: 'Section the student belongs to (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    nullable: true,
  })
  sectionId: string | null;

  @ApiProperty({
    description: 'Current student status',
    enum: ['active', 'inactive', 'graduated'],
    example: 'active',
  })
  status: string;
}
