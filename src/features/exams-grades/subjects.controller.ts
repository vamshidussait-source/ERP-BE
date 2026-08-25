import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { UserRole } from '../auth/user.entity';
import { FeatureGuard } from '../features/feature.guard';
import { RequiresFeature } from '../features/requires-feature.decorator';
import { TenantConnectionCleanupInterceptor } from '../tenants/tenant-connection-cleanup.interceptor';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { Subject } from './subject.entity';
import { SubjectsService } from './subjects.service';

@ApiTags('subjects')
@ApiBearerAuth()
@RequiresFeature('exams_grades')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, FeatureGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post()
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Create a subject (school_admin only)',
    description:
      'Creates a new subject (e.g. "Mathematics", "Science", "Hindi"). ' +
      'The name is free-form and unique within the school.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Subject created successfully',
    type: Subject,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict — a subject with this name already exists',
  })
  create(@Body() dto: CreateSubjectDto) {
    return this.subjectsService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all subjects',
    description:
      'Returns all subjects ordered by name. Open to any authenticated tenant role.',
  })
  @ApiResponse({ status: 200, description: 'List of subjects' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll() {
    return this.subjectsService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a subject by id',
  })
  @ApiResponse({
    status: 200,
    description: 'Subject found',
    type: Subject,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id') id: string) {
    return this.subjectsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Update a subject (school_admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Subject updated',
    type: Subject,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — duplicate name',
  })
  update(@Param('id') id: string, @Body() dto: UpdateSubjectDto) {
    return this.subjectsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Delete a subject (school_admin only)',
    description:
      'Permanently removes a subject. Associated exam subject configs will be deleted via CASCADE.',
  })
  @ApiResponse({ status: 200, description: 'Subject deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  @ApiResponse({ status: 404, description: 'Not found' })
  async remove(@Param('id') id: string) {
    await this.subjectsService.remove(id);
    return { message: 'Subject deleted successfully' };
  }
}
