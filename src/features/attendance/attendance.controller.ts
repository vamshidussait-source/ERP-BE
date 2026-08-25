import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { UserRole } from '../auth/user.entity';
import { ParentStudentLinksService } from '../parent-student-links/parent-student-links.service';
import { StudentsService } from '../students/students.service';
import { TenantConnectionCleanupInterceptor } from '../tenants/tenant-connection-cleanup.interceptor';
import type { TenantRequest } from '../tenants/tenant-request.types';
import { Attendance } from './attendance.entity';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { SectionAttendanceSummaryQueryDto } from './dto/section-attendance-summary-query.dto';
import { StudentAttendanceQueryDto } from './dto/student-attendance-query.dto';

@ApiTags('attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly parentStudentLinksService: ParentStudentLinksService,
    private readonly studentsService: StudentsService,
  ) {}

  @Post('mark')
  @Roles(UserRole.SchoolAdmin, UserRole.Staff)
  @ApiOperation({
    summary: 'Mark attendance for a student on a date',
    description:
      'Creates an attendance record for a student on a date, or updates the ' +
      'existing record if one already exists (teachers often correct ' +
      'same-day mistakes). The record is stored under the student\u2019s ' +
      'current section (denormalized) and notes from an earlier mark are ' +
      'preserved when not provided.\n\n' +
      '🔒 Requires the school_admin or staff role — parents and students ' +
      'cannot mark attendance.',
  })
  @ApiResponse({
    status: 201,
    description: 'Attendance record created or updated',
    type: Attendance,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin or staff role',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found — student does not exist',
  })
  mark(
    @Req() req: TenantRequest,
    @Body() markAttendanceDto: MarkAttendanceDto,
  ) {
    return this.attendanceService.markAttendance(
      markAttendanceDto,
      req.user?.sub,
    );
  }

  @Get('section/:sectionId/date/:date')
  @ApiOperation({
    summary: 'Get all attendance for a section on a date',
    description:
      'Returns every attendance record for the given section on the given ' +
      'date, enriched with each student\u2019s first and last name. Open to ' +
      'any authenticated tenant role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Attendance records for the section and date',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found — section does not exist',
  })
  findByDate(
    @Param('sectionId') sectionId: string,
    @Param('date') date: string,
  ) {
    return this.attendanceService.findByDate(sectionId, date);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get own attendance (student self-service)',
    description:
      'Convenience endpoint for student-role users to fetch their own ' +
      'attendance without needing to know or pass a studentId.\n\n' +
      '🔒 Only available to users with the student role. The server ' +
      'resolves the student record via the user\u2019s linkedStudentId. ' +
      'If the account is not linked to a student record, returns 404.\n\n' +
      'For parent, school_admin, or staff roles that need to look up a ' +
      'specific student\u2019s attendance, use GET /attendance/student/:studentId instead.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (1-based)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page',
    example: 10,
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Only records on or after this date (inclusive)',
    example: '2026-01-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Only records on or before this date (inclusive)',
    example: '2026-12-31',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated attendance history for the authenticated student',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — only available to student-role users',
  })
  @ApiResponse({
    status: 404,
    description:
      'Not found — account is not linked to a student record',
  })
  async findMyAttendance(
    @Req() req: TenantRequest,
    @Query() query: StudentAttendanceQueryDto,
  ) {
    const user = req.user;

    if (user?.role !== UserRole.Student) {
      throw new ForbiddenException(
        'This endpoint is only available to student accounts.',
      );
    }

    const linkedStudentId = await this.studentsService.getLinkedStudentId(user.sub);

    if (!linkedStudentId) {
      throw new NotFoundException(
        'Your account is not linked to a student record — contact your school administrator.',
      );
    }

    return this.attendanceService.findByStudent(
      linkedStudentId,
      query.page ?? 1,
      query.limit ?? 10,
      query.startDate,
      query.endDate,
    );
  }

  @Get('student/:studentId')
  @ApiOperation({
    summary: 'Get a student\u2019s attendance history',
    description:
      'Returns a paginated attendance history for one student, optionally ' +
      'filtered to a date range.\n\n' +
      '🔒 Role-based scoping:\n' +
      '• school_admin / staff — unrestricted\n' +
      '• parent — can only view attendance for linked children\n' +
      '• student — can only view their own attendance\n\n' +
      '💡 For a simpler student-only self-service route, see GET /attendance/me.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (1-based)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page',
    example: 10,
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Only records on or after this date (inclusive)',
    example: '2026-01-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Only records on or before this date (inclusive)',
    example: '2026-12-31',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated history as { data, total, page, limit }',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (invalid page, limit, or date range)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  async findByStudent(
    @Req() req: TenantRequest,
    @Param('studentId') studentId: string,
    @Query() query: StudentAttendanceQueryDto,
  ) {
    const user = req.user;

    if (user?.role === UserRole.Parent) {
      const isLinked = await this.parentStudentLinksService.isParentOfStudent(
        user.sub,
        studentId,
      );
      if (!isLinked) {
        throw new ForbiddenException(
          'You do not have permission to view attendance for this student.',
        );
      }
    } else if (user?.role === UserRole.Student) {
      const linkedStudentId = await this.studentsService.getLinkedStudentId(user.sub);
      if (linkedStudentId !== studentId) {
        throw new ForbiddenException(
          'You can only view your own attendance.',
        );
      }
    }
    // school_admin and staff: unrestricted (existing behavior)

    return this.attendanceService.findByStudent(
      studentId,
      query.page ?? 1,
      query.limit ?? 10,
      query.startDate,
      query.endDate,
    );
  }

  @Get('section/:sectionId/summary')
  @ApiOperation({
    summary: 'Get an attendance summary for a section',
    description:
      'Returns per-student counts of present/absent/late/excused for the ' +
      'given section over a date range. Students in the section with no ' +
      'records appear with zero counts — useful for reports. Open to any ' +
      'authenticated tenant role.',
  })
  @ApiQuery({
    name: 'startDate',
    required: true,
    description: 'Start date (inclusive)',
    example: '2026-01-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    description: 'End date (inclusive)',
    example: '2026-12-31',
  })
  @ApiResponse({
    status: 200,
    description: 'Per-student status counts',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (missing or invalid date range)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found — section does not exist',
  })
  getSummary(
    @Param('sectionId') sectionId: string,
    @Query() summaryQuery: SectionAttendanceSummaryQueryDto,
  ) {
    return this.attendanceService.getAttendanceSummary(
      sectionId,
      summaryQuery.startDate,
      summaryQuery.endDate,
    );
  }
}
