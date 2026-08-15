import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetFeatureOverrideDto {
  @ApiProperty({
    description: 'Whether the feature should be enabled for this tenant',
    example: true,
  })
  @IsBoolean()
  enabled: boolean;
}
