import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantConnectionCleanupInterceptor } from '../tenants/tenant-connection-cleanup.interceptor';
import { UpdateSectionDto } from './dto/update-section.dto';
import { Section } from './section.entity';
import { SectionsService } from './sections.service';

@ApiTags('sections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('sections')
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Get a section by id',
    description: 'Returns a single section by UUID (direct lookup).',
  })
  @ApiResponse({ status: 200, description: 'Section found', type: Section })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({ status: 404, description: 'Section not found' })
  findOne(@Param('id') id: string) {
    return this.sectionsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a section',
    description: 'Updates one or more fields of an existing section.',
  })
  @ApiResponse({ status: 200, description: 'Section updated', type: Section })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({ status: 404, description: 'Section not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — section name already exists in this class',
  })
  update(@Param('id') id: string, @Body() updateSectionDto: UpdateSectionDto) {
    return this.sectionsService.update(id, updateSectionDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a section (hard delete)',
    description:
      'Permanently deletes a section. Fails with 409 if students are still ' +
      'assigned to it — unassign them first.',
  })
  @ApiResponse({
    status: 200,
    description: 'Section deleted',
    type: Section,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({ status: 404, description: 'Section not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — section still has students assigned',
  })
  remove(@Param('id') id: string) {
    return this.sectionsService.remove(id);
  }
}
