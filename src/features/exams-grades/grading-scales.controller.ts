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
import { CreateGradeBandDto } from './dto/create-grade-band.dto';
import { CreateGradingScaleDto } from './dto/create-grading-scale.dto';
import { UpdateGradeBandDto } from './dto/update-grade-band.dto';
import { UpdateGradingScaleDto } from './dto/update-grading-scale.dto';
import { GradeBand } from './grade-band.entity';
import { GradingScalesService } from './grading-scales.service';
import { GradingScale } from './grading-scale.entity';

@ApiTags('grading-scales')
@ApiBearerAuth()
@RequiresFeature('exams_grades')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, FeatureGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('grading-scales')
export class GradingScalesController {
  constructor(
    private readonly gradingScalesService: GradingScalesService,
  ) {}

  // ── Grading Scale CRUD ──────────────────────────────────────────

  @Post()
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Create a grading scale (school_admin only)',
    description:
      'Creates a new grading scale (e.g. "CBSE 9-Point Scale"). ' +
      'If isDefault is set to true, any existing default is unset.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Grading scale created successfully',
    type: GradingScale,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  create(@Body() dto: CreateGradingScaleDto) {
    return this.gradingScalesService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all grading scales',
    description:
      'Returns all grading scales ordered by name. Open to any authenticated tenant role.',
  })
  @ApiResponse({ status: 200, description: 'List of grading scales' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll() {
    return this.gradingScalesService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a grading scale by id (includes grade bands)',
  })
  @ApiResponse({
    status: 200,
    description: 'Grading scale found',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id') id: string) {
    return this.gradingScalesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Update a grading scale (school_admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Grading scale updated',
    type: GradingScale,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  @ApiResponse({ status: 404, description: 'Not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGradingScaleDto,
  ) {
    return this.gradingScalesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Delete a grading scale (school_admin only)',
    description:
      'Permanently removes a grading scale. Associated grade bands and exam gradingScaleId references will be cleaned up via CASCADE/SET NULL.',
  })
  @ApiResponse({ status: 200, description: 'Grading scale deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  @ApiResponse({ status: 404, description: 'Not found' })
  async remove(@Param('id') id: string) {
    await this.gradingScalesService.remove(id);
    return { message: 'Grading scale deleted successfully' };
  }

  // ── Nested Grade Band CRUD ──────────────────────────────────────

  @Post(':id/bands')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Add a grade band to a grading scale (school_admin only)',
    description:
      'Adds a new grade band (e.g. 91–100 = "A1") to a grading scale.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Grade band created',
    type: GradeBand,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  @ApiResponse({ status: 404, description: 'Grading scale not found' })
  addBand(
    @Param('id') id: string,
    @Body() dto: CreateGradeBandDto,
  ) {
    return this.gradingScalesService.addBand(id, dto);
  }

  @Get(':id/bands')
  @ApiOperation({
    summary: 'List grade bands for a grading scale',
  })
  @ApiResponse({
    status: 200,
    description: 'List of grade bands',
    type: [GradeBand],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Grading scale not found' })
  getBands(@Param('id') id: string) {
    return this.gradingScalesService.getBands(id);
  }

  @Patch(':id/bands/:bandId')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Update a grade band (school_admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Grade band updated',
    type: GradeBand,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  @ApiResponse({ status: 404, description: 'Not found' })
  updateBand(
    @Param('id') id: string,
    @Param('bandId') bandId: string,
    @Body() dto: UpdateGradeBandDto,
  ) {
    return this.gradingScalesService.updateBand(id, bandId, dto);
  }

  @Delete(':id/bands/:bandId')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Delete a grade band (school_admin only)',
  })
  @ApiResponse({ status: 200, description: 'Grade band deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  @ApiResponse({ status: 404, description: 'Not found' })
  async removeBand(
    @Param('id') id: string,
    @Param('bandId') bandId: string,
  ) {
    await this.gradingScalesService.removeBand(id, bandId);
    return { message: 'Grade band deleted successfully' };
  }
}
