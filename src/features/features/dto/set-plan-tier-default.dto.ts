import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetPlanTierDefaultDto {
  @ApiProperty({
    description:
      'Whether the feature should be enabled by default for this plan tier',
    example: true,
  })
  @IsBoolean()
  enabled: boolean;
}
