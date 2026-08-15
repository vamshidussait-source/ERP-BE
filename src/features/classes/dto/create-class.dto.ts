import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateClassDto {
  @ApiProperty({
    description: 'Class name, unique within the tenant schema',
    example: 'Grade 8',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Logical sort order (e.g. 1 for Grade 1, 2 for Grade 2)',
    example: 8,
  })
  @IsInt()
  displayOrder: number;
}
