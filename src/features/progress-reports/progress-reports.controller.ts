import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
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
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { FeatureGuard } from '../features/feature.guard';
import { RequiresFeature } from '../features/requires-feature.decorator';
import { TenantConnectionCleanupInterceptor } from '../tenants/tenant-connection-cleanup.interceptor';
import type { TenantRequest } from '../tenants/tenant-request.types';
import { AddCoScholasticGradeDto } from './dto/add-co-scholastic-grade.dto';
import { CreateOrUpdateReportDto } from './dto/create-or-update-report.dto';
import { CoScholasticGrade } from './co-scholastic-grade.entity';
import { ProgressReport } from './progress-report.entity';
import { ProgressReportsService } from './progress-reports.service';

@ApiTags('progress-reports')
@ApiBearerAuth()
@RequiresFeature('progress_reports')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, FeatureGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('progress-reports')
export class ProgressReportsController {
  constructor(
    private readonly progressReportsService: ProgressReportsService,
  ) {}

  @Post()
  @Roles(UserRole.SchoolAdmin, UserRole.Staff)
  @ApiOperation({
    summary: 'Create or update a progress report (school_admin or staff)',
    description:
      'Creates a new progress report for a student + assessment period, or ' +
      'updates an existing one (upsert via unique constraint). Reports are ' +
      'created in "draft" status by default.\n\n' +
      'V1 simplification: any school_admin or staff role can create/update ' +
      'reports. We don\'t restrict to "class teacher" specifically since we ' +
      'don\'t have a class-teacher-assignment concept yet.\n\n' +
      '🔒 Requires the school_admin or staff role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Progress report created or updated',
    type: ProgressReport,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires school_admin or staff role' })
  @ApiResponse({ status: 404, description: 'Not found — student or period does not exist' })
  createOrUpdate(@Body() dto: CreateOrUpdateReportDto) {
    return this.progressReportsService.createOrUpdate(dto);
  }

  @Post(':id/publish')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Publish a progress report (school_admin only)',
    description:
      'Sets the report status to "published", making it visible to parents ' +
      'and students. Only school_admin can publish.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Progress report published',
    type: ProgressReport,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires the school_admin role' })
  @ApiResponse({ status: 404, description: 'Not found' })
  publishReport(@Param('id') id: string) {
    return this.progressReportsService.publishReport(id);
  }

  @Get('student/:studentId')
  @ApiOperation({
    summary: "Get a student's progress reports (role-scoped)",
    description:
      'Returns all progress reports for a student with full details ' +
      '(student name, period name, co-scholastic grades, etc.).\n\n' +
      '🔒 Role-based scoping:\n' +
      '• school_admin / staff — sees all reports (drafts and published)\n' +
      '• parent — can only see published reports for linked children\n' +
      '• student — can only see published reports for their own account\n\n' +
      'Draft reports are completely hidden (404) for parent/student roles ' +
      'to avoid confirming their existence.',
  })
  @ApiResponse({
    status: 200,
    description: 'Progress reports for the student',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — not linked to this student or not own account' })
  @ApiResponse({ status: 404, description: 'Not found — no published reports visible to this role' })
  getReportsByStudent(
    @Req() req: TenantRequest,
    @Param('studentId') studentId: string,
  ) {
    const user = req.user! as AuthenticatedUser;
    return this.progressReportsService.getReportsByStudent(
      studentId,
      user.sub,
      user.role as UserRole,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single progress report by id (role-scoped)',
    description:
      'Returns a single progress report with full details including ' +
      'co-scholastic grades.\n\n' +
      '🔒 Role-based scoping:\n' +
      '• school_admin / staff — can see drafts and published\n' +
      '• parent — published only, must be linked to the student (404 for drafts)\n' +
      '• student — published only, must be their own account (404 for drafts)',
  })
  @ApiResponse({
    status: 200,
    description: 'Progress report details',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — not linked or not own account' })
  @ApiResponse({ status: 404, description: 'Not found — or draft hidden from parent/student role' })
  getReport(
    @Req() req: TenantRequest,
    @Param('id') id: string,
  ) {
    const user = req.user! as AuthenticatedUser;
    return this.progressReportsService.getReportForStudent(
      id,
      user.sub,
      user.role as UserRole,
    );
  }

  @Post(':id/co-scholastic')
  @Roles(UserRole.SchoolAdmin, UserRole.Staff)
  @ApiOperation({
    summary: 'Add or update a co-scholastic grade (school_admin or staff)',
    description:
      'Adds or updates a co-scholastic grade for a progress report. Uses ' +
      'upsert via unique constraint on (progressReportId, area), so calling ' +
      'this twice with the same area replaces the grade.\n\n' +
      '🔒 Requires the school_admin or staff role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Co-scholastic grade added or updated',
    type: CoScholasticGrade,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires school_admin or staff role' })
  @ApiResponse({ status: 404, description: 'Not found — report does not exist' })
  addCoScholasticGrade(
    @Param('id') id: string,
    @Body() dto: AddCoScholasticGradeDto,
  ) {
    return this.progressReportsService.addCoScholasticGrade(id, dto);
  }

  @Get(':id/co-scholastic')
  @ApiOperation({
    summary: 'Get co-scholastic grades for a report (role-scoped)',
    description:
      'Returns all co-scholastic grades for a progress report. Uses the ' +
      'same authorization as the parent report endpoint.\n\n' +
      '🔒 Role-based scoping matches the parent progress report GET.',
  })
  @ApiResponse({
    status: 200,
    description: 'Co-scholastic grades for the report',
    type: [CoScholasticGrade],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async getCoScholasticGrades(
    @Req() req: TenantRequest,
    @Param('id') id: string,
  ) {
    // First check authorization against the parent report.
    const user = req.user! as AuthenticatedUser;
    await this.progressReportsService.getReportForStudent(
      id,
      user.sub,
      user.role as UserRole,
    );
    // If that didn't throw, we're authorized — return the grades.
    return this.progressReportsService.getCoScholasticGrades(id);
  }
}
