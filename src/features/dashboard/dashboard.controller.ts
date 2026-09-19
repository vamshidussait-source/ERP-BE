import {
  Controller,
  Get,
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
import { TenantConnectionCleanupInterceptor } from '../tenants/tenant-connection-cleanup.interceptor';
import type { TenantRequest } from '../tenants/tenant-request.types';
import {
  DashboardSummaryResponse,
  DashboardSummaryService,
} from './dashboard-summary.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardSummaryService: DashboardSummaryService,
  ) {}

  @Get('summary')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Dashboard summary (school_admin only)',
    description:
      'Aggregates real data from the students, staff, classes, attendance, ' +
      'announcements, progress-reports and exams modules into one response: ' +
      'headcounts, today\'s attendance rollup (with notMarkedSections so the ' +
      'UI can show "12 of 15 sections marked" honesty), the 3 most recent ' +
      'sent announcements, the 5 most recent student/staff creations and ' +
      'published reports/exams, and exams scheduled in the current week.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard summary for the current tenant',
    schema: {
      example: {
        totalStudents: 420,
        totalStaff: 35,
        activeClasses: 12,
        attendanceToday: {
          present: 380,
          absent: 15,
          late: 8,
          excused: 5,
          notMarkedSections: 3,
        },
        upcomingAnnouncements: [
          {
            id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
            title: 'Sports Day',
            priority: 'important',
            sentAt: '2026-09-18T09:00:00.000Z',
          },
        ],
        recentActivity: [
          {
            type: 'student_created',
            description: 'New student enrolled: Grace Hopper',
            timestamp: '2026-09-18T08:30:00.000Z',
          },
        ],
        examsThisWeek: 2,
        today: '2026-09-19',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  getSummary(@Req() req: TenantRequest) {
    // Touch the request so lint sees the param; the tenant schema itself is
    // resolved by TenantGuard/TenantMiddleware and used per-query via
    // TenantConnectionService.
    void req;
    return this.dashboardSummaryService.getSummary();
  }
}
