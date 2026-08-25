import {
  Body,
  Controller,
  Delete,
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
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { UserRole } from '../auth/user.entity';
import { FeatureGuard } from '../features/feature.guard';
import { RequiresFeature } from '../features/requires-feature.decorator';
import { TenantConnectionCleanupInterceptor } from '../tenants/tenant-connection-cleanup.interceptor';
import type { TenantRequest } from '../tenants/tenant-request.types';
import { CreateExamDto } from './dto/create-exam.dto';
import { EnterMarksDto } from './dto/enter-marks.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { Exam } from './exam.entity';
import { ExamsService } from './exams.service';

@ApiTags('exams')
@ApiBearerAuth()
@RequiresFeature('exams_grades')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, FeatureGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('exams')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Post()
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Create an exam with subject configs (school_admin only)',
    description:
      'Creates a new exam (e.g. "Unit Test 1") with its subject ' +
      'configurations in one call. The exam starts in "draft" status.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Exam created',
    type: Exam,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  @ApiResponse({ status: 404, description: 'Not found — subject or period does not exist' })
  createExam(@Body() dto: CreateExamDto) {
    return this.examsService.createExam(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List exams (role-scoped)',
    description:
      'Returns all exams. Draft exams are hidden from parent/student roles.\n\n' +
      '🔒 Role-based scoping:\n' +
      '• school_admin / staff — sees all exams (drafts and published)\n' +
      '• parent / student — sees only published exams',
  })
  @ApiResponse({ status: 200, description: 'List of exams' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll(@Req() req: TenantRequest) {
    const user = req.user! as AuthenticatedUser;
    return this.examsService.findAll(
      user.sub,
      user.role as UserRole,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an exam by id (role-scoped)',
    description:
      'Returns a single exam with its assessment period and grading scale names.\n\n' +
      '🔒 Role-based scoping:\n' +
      '• school_admin / staff — can see drafts and published\n' +
      '• parent / student — published only (404 for drafts)',
  })
  @ApiResponse({
    status: 200,
    description: 'Exam found',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Not found — or draft hidden from parent/student' })
  findOne(
    @Req() req: TenantRequest,
    @Param('id') id: string,
  ) {
    const user = req.user! as AuthenticatedUser;
    return this.examsService.findOne(
      id,
      user.sub,
      user.role as UserRole,
    );
  }

  @Get(':id/subjects')
  @ApiOperation({
    summary: 'Get subject configs for an exam',
    description:
      'Returns which subjects are part of this exam along with their max marks.',
  })
  @ApiResponse({
    status: 200,
    description: 'Subject configs',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Exam not found' })
  getSubjectConfigs(@Param('id') id: string) {
    return this.examsService.getSubjectConfigs(id);
  }

  @Patch(':id')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Update an exam (school_admin only)',
    description:
      'Updates exam details and optionally replaces its subject configs. ' +
      'If subjects are provided, existing marks for this exam are cleared.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Exam updated',
    type: Exam,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  @ApiResponse({ status: 404, description: 'Not found' })
  updateExam(
    @Param('id') id: string,
    @Body() dto: UpdateExamDto,
  ) {
    return this.examsService.updateExam(id, dto);
  }

  @Post(':id/publish')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Publish an exam (school_admin only)',
    description:
      'Sets the exam status to "published", making marks visible to parents ' +
      'and students. Only school_admin can publish.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Exam published',
    type: Exam,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  @ApiResponse({ status: 404, description: 'Not found' })
  publishExam(@Param('id') id: string) {
    return this.examsService.publishExam(id);
  }

  @Post(':id/marks')
  @Roles(UserRole.SchoolAdmin, UserRole.Staff)
  @ApiOperation({
    summary: 'Enter marks for a student (school_admin or staff)',
    description:
      'Enters or updates marks for a student in a specific subject within an exam. ' +
      'The exam must be in draft status.\n\n' +
      '🔒 Requires the school_admin or staff role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Marks entered',
  })
  @ApiResponse({ status: 400, description: 'Validation failed — e.g. marks exceed max' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires school_admin or staff role',
  })
  @ApiResponse({ status: 404, description: 'Not found — exam, student, or subject not found' })
  enterMarks(
    @Param('id') id: string,
    @Body() dto: EnterMarksDto,
  ) {
    return this.examsService.enterMarks(id, dto);
  }

  @Get(':id/marks/:studentId')
  @ApiOperation({
    summary: "Get a student's marks for an exam (role-scoped)",
    description:
      'Returns marks for a student in an exam, including computed ' +
      'grades per subject and an overall summary (total, percentage, grade).\n\n' +
      '🔒 Role-based scoping:\n' +
      '• school_admin / staff — can see marks for any exam (draft or published)\n' +
      '• parent — published only, must be linked to the student\n' +
      '• student — published only, must be their own account\n\n' +
      'Draft exams are completely hidden (404) for parent/student roles.',
  })
  @ApiResponse({
    status: 200,
    description: 'Student marks summary with computed grades',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — not linked or not own account',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found — or draft hidden from parent/student',
  })
  getMarks(
    @Req() req: TenantRequest,
    @Param('id') id: string,
    @Param('studentId') studentId: string,
  ) {
    const user = req.user! as AuthenticatedUser;
    return this.examsService.getMarksForStudent(
      id,
      studentId,
      user.sub,
      user.role as UserRole,
    );
  }

  @Delete(':id')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Delete an exam (school_admin only)',
    description:
      'Permanently removes an exam and its associated subject configs and marks.',
  })
  @ApiResponse({ status: 200, description: 'Exam deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  @ApiResponse({ status: 404, description: 'Not found' })
  async remove(@Param('id') id: string) {
    await this.examsService.remove(id);
    return { message: 'Exam deleted successfully' };
  }
}
