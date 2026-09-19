import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { TenantConnectionCleanupInterceptor } from '../tenants/tenant-connection-cleanup.interceptor';
import type { TenantRequest } from '../tenants/tenant-request.types';
import { Announcement } from './announcement.entity';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import {
  ListAnnouncementsQueryDto,
  ANNOUNCEMENT_STATUS_FILTERS,
} from './dto/list-announcements-query.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@ApiTags('announcements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('announcements')
export class AnnouncementsController {
  constructor(
    private readonly announcementsService: AnnouncementsService,
  ) {}

  @Post()
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Create an announcement (school_admin only)',
    description:
      "Creates an announcement. By default it is a draft — visible only in " +
      "the admin list until published. Pass status: 'sent' to create and " +
      "send in one step. Passing scheduledFor with the default draft status " +
      'marks the announcement scheduled.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Announcement created',
    type: Announcement,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires the school_admin role' })
  @ApiResponse({ status: 404, description: 'Referenced section(s) or staff member not found' })
  create(@Body() dto: CreateAnnouncementDto) {
    return this.announcementsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Update a draft/scheduled announcement (school_admin only)',
    description:
      'Edits title, message, audience, priority, or schedule of an ' +
      'announcement that has not been sent yet. Already-sent announcements ' +
      'are immutable (403).\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Announcement updated',
    type: Announcement,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — sent announcements cannot be edited' })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.announcementsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Delete a draft/scheduled announcement (school_admin only)',
    description:
      'Deletes an announcement that has not been sent yet. Already-sent ' +
      'announcements cannot be deleted (403).\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({ status: 200, description: 'Announcement deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — sent announcements cannot be deleted' })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  async delete(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.announcementsService.delete(id);
    return { deleted: true };
  }

  @Post(':id/publish')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Publish/send an announcement (school_admin only)',
    description:
      "Sets status='sent' and sentAt=now(), resolving the configured " +
      'audience into recipient user IDs. Idempotent — publishing an ' +
      'already-sent announcement returns it unchanged.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Announcement published',
    type: Announcement,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires the school_admin role' })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  publish(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.announcementsService.publish(id);
  }

  @Get()
  @Roles(UserRole.SchoolAdmin)
  @ApiQuery({
    name: 'status',
    enum: ANNOUNCEMENT_STATUS_FILTERS,
    required: false,
  })
  @ApiOperation({
    summary: 'List announcements with read stats (school_admin only)',
    description:
      "Admin list view with a status filter: 'all' (default) | 'sent' | " +
      "'scheduled' | 'drafts'. Each item includes recipientCount and " +
      'readCount so admins can see engagement at a glance.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({ status: 200, description: 'Paginated announcements with read stats' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires the school_admin role' })
  listForAdmin(
    @Query() query: ListAnnouncementsQueryDto,
  ) {
    return this.announcementsService.listForAdmin(
      query.status ?? 'all',
      query.page ?? 1,
      query.limit ?? 10,
    );
  }

  @Get(':id/read-stats')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Read statistics for one announcement (school_admin only)',
    description:
      'Returns { recipientCount, readCount } for a single announcement.\n' +
      'Counts against the frozen announcement_recipients list captured at\n' +
      'send time — the same numbers shown inline in the admin list view.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Read stats for the announcement',
    schema: {
      type: 'object',
      properties: {
        recipientCount: { type: 'number', example: 2 },
        readCount: { type: 'number', example: 1 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires the school_admin role' })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  getReadStats(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.announcementsService.getReadStats(id);
  }

  @Get('me')
  @ApiOperation({
    summary: 'My announcement feed (any authenticated tenant role)',
    description:
      'Returns the announcements targeted at the current user based on ' +
      'their role and section, newest first, each with an isRead flag.\n\n' +
      'Draft/scheduled announcements never appear in any non-admin feed.\n\n' +
      '🔒 Audience rules (driven by the recipient list frozen at send time):\n' +
      '• you only see announcements you were actually targeted by\n' +
      '• all_staff reaches staff + school_admin; all_parents reaches parents; all_students reaches students\n' +
      '• specific_sections reaches students in those sections and parents of those students\n' +
      'Feed visibility matches read-tracking exactly — every item shown can be marked read.',
  })
  @ApiResponse({ status: 200, description: 'Feed of announcements with isRead flags' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMyFeed(@Req() req: TenantRequest) {
    const user = req.user! as AuthenticatedUser;
    return this.announcementsService.getMyFeed(user.sub);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Unread announcement count for the current user',
    description:
      'Returns { count } — the number of unread items in the caller\'s ' +
      'feed, computed from the same recipient-driven query as ' +
      'GET /announcements/me.\n\n' +
      '🔓 Open to any authenticated tenant role (same access as /me).',
  })
  @ApiResponse({ status: 200, description: 'Unread count', schema: {
    type: 'object',
    properties: { count: { type: 'number', example: 3 } },
  } })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUnreadCount(@Req() req: TenantRequest) {
    const user = req.user! as AuthenticatedUser;
    const count = await this.announcementsService.countUnreadForUser(
      user.sub,
    );
    return { count };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark an announcement as read (any authenticated role)',
    description:
      'Records a read receipt for the current user. Idempotent — calling ' +
      'twice does not create duplicates. Drafts/scheduled cannot be marked ' +
      'read (404). The caller must be an actual recipient captured at send ' +
      'time (403 otherwise).\n\n' +
      '🔓 Open to any authenticated tenant role.',
  })
  @ApiResponse({ status: 200, description: 'Read receipt recorded' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller is not a recipient of this announcement' })
  @ApiResponse({ status: 404, description: 'Announcement not found (or not yet sent)' })
  async markAsRead(
    @Req() req: TenantRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const user = req.user! as AuthenticatedUser;
    const read = await this.announcementsService.markAsRead(id, user.sub);
    return { id: read.id, announcementId: read.announcementId, readAt: read.readAt };
  }

  @Post('mark-all-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all feed announcements as read (any authenticated role)',
    description:
      'Marks every sent announcement currently visible in the caller\'s ' +
      'feed as read. Returns the count of newly-marked announcements.\n\n' +
      '🔓 Open to any authenticated tenant role.',
  })
  @ApiResponse({ status: 200, description: 'Count of newly-marked announcements' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async markAllRead(@Req() req: TenantRequest) {
    const user = req.user! as AuthenticatedUser;
    const marked = await this.announcementsService.markAllRead(user.sub);
    return { marked };
  }
}
