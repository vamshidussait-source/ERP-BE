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
import { AssessmentPeriod } from './assessment-period.entity';
import { AssessmentPeriodsService } from './assessment-periods.service';
import { CreateAssessmentPeriodDto } from './dto/create-assessment-period.dto';
import { UpdateAssessmentPeriodDto } from './dto/update-assessment-period.dto';

@ApiTags('assessment-periods')
@ApiBearerAuth()
@RequiresFeature('progress_reports')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, FeatureGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('assessment-periods')
export class AssessmentPeriodsController {
  constructor(
    private readonly assessmentPeriodsService: AssessmentPeriodsService,
  ) {}

  @Post()
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Create an assessment period (school_admin only)',
    description:
      'Creates a new assessment period (e.g. "Term 1", "Half-Yearly"). ' +
      'Different schools/boards use different naming conventions, so the ' +
      'name is free-form. A unique constraint on (name, academicYear) ' +
      'prevents duplicates.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Assessment period created successfully',
    type: AssessmentPeriod,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires the school_admin role' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — a period with this name and academic year already exists',
  })
  create(@Body() dto: CreateAssessmentPeriodDto) {
    return this.assessmentPeriodsService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all assessment periods',
    description:
      'Returns all assessment periods ordered by start date. Open to any authenticated tenant role.',
  })
  @ApiResponse({ status: 200, description: 'List of assessment periods' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll() {
    return this.assessmentPeriodsService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an assessment period by id',
  })
  @ApiResponse({ status: 200, description: 'Assessment period found', type: AssessmentPeriod })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id') id: string) {
    return this.assessmentPeriodsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Update an assessment period (school_admin only)',
  })
  @ApiResponse({ status: 200, description: 'Assessment period updated', type: AssessmentPeriod })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires the school_admin role' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 409, description: 'Conflict — duplicate name+academicYear' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAssessmentPeriodDto,
  ) {
    return this.assessmentPeriodsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Delete an assessment period (school_admin only)',
    description:
      'Permanently removes an assessment period. Associated progress reports will be deleted via CASCADE.',
  })
  @ApiResponse({ status: 200, description: 'Assessment period deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires the school_admin role' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async remove(@Param('id') id: string) {
    await this.assessmentPeriodsService.remove(id);
    return { message: 'Assessment period deleted successfully' };
  }
}
