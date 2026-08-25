import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
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
import { FeatureGuard } from '../features/feature.guard';
import { RequiresFeature } from '../features/requires-feature.decorator';
import { StaffService } from '../staff/staff.service';
import { TenantConnectionCleanupInterceptor } from '../tenants/tenant-connection-cleanup.interceptor';
import type { TenantRequest } from '../tenants/tenant-request.types';
import { CreateTimetableEntryDto } from './dto/create-timetable-entry.dto';
import { UpdateTimetableEntryDto } from './dto/update-timetable-entry.dto';
import { TimetableEntry } from './timetable-entry.entity';
import { TimetableEntryWithStaff, TimetableService } from './timetable.service';

@ApiTags('timetable')
@ApiBearerAuth()
@RequiresFeature('timetable')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, FeatureGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('timetable')
export class TimetableController {
  constructor(
    private readonly timetableService: TimetableService,
    private readonly staffService: StaffService,
  ) {}

  @Post()
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Create a timetable entry (school_admin only)',
    description:
      'Creates a new period entry for any section/day/period combination. ' +
      'This is a fully dynamic, editable schedule — entries can be freely ' +
      'created, modified, or moved to any day/period combination by a ' +
      'school_admin at any time. A unique constraint on ' +
      '(sectionId, dayOfWeek, periodNumber) prevents double-booking.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Timetable entry created successfully',
    type: TimetableEntry,
  })
  @ApiResponse({ status: 400, description: 'Validation failed (missing or invalid fields)' })
  @ApiResponse({ status: 401, description: 'Unauthorized — valid Bearer token required' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires the school_admin role' })
  @ApiResponse({ status: 404, description: 'Not found — referenced section or staff does not exist' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — a timetable entry already exists for this section/day/period',
  })
  createEntry(@Body() dto: CreateTimetableEntryDto) {
    return this.timetableService.createEntry(dto);
  }

  @Patch(':id')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Update a timetable entry (school_admin only)',
    description:
      'Updates one or more fields of an existing timetable entry. Supports ' +
      'changing subject, staffId, startTime, endTime, or even moving an entry ' +
      'to a different day/period. The unique constraint on (sectionId, ' +
      'dayOfWeek, periodNumber) is re-validated on update — moving an entry ' +
      'onto another entry\'s slot will return 409 Conflict.\n\n' +
      'This is a fully dynamic, editable schedule — entries can be freely ' +
      'created, modified, or moved at any time.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Timetable entry updated successfully',
    type: TimetableEntry,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized — valid Bearer token required' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires the school_admin role' })
  @ApiResponse({ status: 404, description: 'Not found — entry, section, or staff does not exist' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — update would collide with an existing entry for this section/day/period',
  })
  updateEntry(
    @Param('id') id: string,
    @Body() dto: UpdateTimetableEntryDto,
  ) {
    return this.timetableService.updateEntry(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Delete a timetable entry (school_admin only)',
    description:
      'Permanently removes a timetable entry.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({ status: 200, description: 'Timetable entry deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized — valid Bearer token required' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires the school_admin role' })
  @ApiResponse({ status: 404, description: 'Not found — entry does not exist' })
  async deleteEntry(@Param('id') id: string) {
    await this.timetableService.deleteEntry(id);
    return { message: 'Timetable entry deleted successfully' };
  }

  @Get('section/:sectionId')
  @ApiOperation({
    summary: 'Get timetable for a section',
    description:
      'Returns the full week\'s schedule (all 6 days) for a section, ' +
      'ordered by day of week then period number. Open to any authenticated ' +
      'tenant role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Timetable entries for the section',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — valid Bearer token required' })
  @ApiResponse({ status: 404, description: 'Not found — section does not exist' })
  getTimetableForSection(@Param('sectionId') sectionId: string) {
    return this.timetableService.getTimetableForSection(sectionId);
  }

  @Get('staff/:staffId')
  @ApiOperation({
    summary: 'Get timetable for a staff member',
    description:
      'Returns everywhere a given staff member teaches across all sections. ' +
      'Open to any authenticated tenant role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Timetable entries where the staff member teaches',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — valid Bearer token required' })
  getTimetableForStaff(@Param('staffId') staffId: string) {
    return this.timetableService.getTimetableForStaff(staffId);
  }

  @Get('me')
  @Roles(UserRole.Staff)
  @ApiOperation({
    summary: 'Get own timetable (staff self-service)',
    description:
      'Convenience endpoint for staff-role users to fetch their own ' +
      'timetable without needing to know or pass a staffId.\n\n' +
      '🔒 Only available to users with the staff role. The server ' +
      'resolves the staff record via the user\u2019s linkedStaffId. ' +
      'If the account is not linked to a staff record, returns 404.\n\n' +
      'For school_admin roles that need to look up a specific staff ' +
      'member\'s timetable, use GET /timetable/staff/:staffId instead.',
  })
  @ApiResponse({
    status: 200,
    description: 'Timetable entries for the authenticated staff member',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — valid Bearer token required' })
  @ApiResponse({ status: 403, description: 'Forbidden — only available to staff-role users' })
  @ApiResponse({
    status: 404,
    description: 'Not found — account is not linked to a staff record',
  })
  async findMyTimetable(@Req() req: TenantRequest) {
    const user = req.user;

    if (user?.role !== UserRole.Staff) {
      throw new ForbiddenException(
        'This endpoint is only available to staff accounts.',
      );
    }

    const linkedStaffId = await this.staffService.getLinkedStaffId(user.sub);

    if (!linkedStaffId) {
      throw new NotFoundException(
        'Your account is not linked to a staff record — contact your school administrator.',
      );
    }

    return this.timetableService.getTimetableForStaff(linkedStaffId);
  }
}
