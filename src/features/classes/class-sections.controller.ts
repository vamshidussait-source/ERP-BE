import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
import { CreateSectionDto } from './dto/create-section.dto';
import { Section } from './section.entity';
import { SectionsService } from './sections.service';

@ApiTags('sections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('classes/:classId/sections')
export class ClassSectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a section within a class',
    description:
      'Creates a new section under the given class. The section name must be ' +
      'unique within that class (e.g. "Grade 8 - A" only once).',
  })
  @ApiResponse({
    status: 201,
    description: 'Section created successfully',
    type: Section,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({ status: 404, description: 'Class not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — section name already exists in this class',
  })
  create(
    @Param('classId') classId: string,
    @Body() createSectionDto: CreateSectionDto,
  ) {
    return this.sectionsService.create(classId, createSectionDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List sections of a class',
    description:
      'Returns all sections belonging to the given class, ordered by name.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of sections for the class',
    type: Section,
    isArray: true,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({ status: 404, description: 'Class not found' })
  findAll(@Param('classId') classId: string) {
    return this.sectionsService.findAllByClass(classId);
  }
}
