import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
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
import { CreateParentStudentLinkDto } from './dto/create-parent-student-link.dto';
import { ParentChildDto } from './dto/parent-child.dto';
import { ParentStudentLinksService } from './parent-student-links.service';

@ApiTags('parent-student-links')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('parent-links')
export class ParentStudentLinksController {
  constructor(
    private readonly parentStudentLinksService: ParentStudentLinksService,
  ) {}

  @Post()
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Link a parent user to a student',
    description:
      'Creates a parent–student relationship. A parent can be linked to ' +
      'multiple students (children). Duplicate links are idempotent (upsert). ' +
      '\n\n🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Link created or already exists (idempotent)',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (invalid UUIDs)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  async link(@Body() dto: CreateParentStudentLinkDto) {
    return this.parentStudentLinksService.linkParentToStudent(
      dto.parentUserId,
      dto.studentId,
    );
  }

  @Delete()
  @Roles(UserRole.SchoolAdmin)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Unlink a parent user from a student',
    description:
      'Removes an existing parent–student relationship. ' +
      'No-op if the link does not exist. ' +
      '\n\n🔒 Requires the school_admin role.',
  })
  @ApiResponse({ status: 200, description: 'Link removed' })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (invalid UUIDs)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  async unlink(@Body() dto: CreateParentStudentLinkDto) {
    await this.parentStudentLinksService.unlinkParentFromStudent(
      dto.parentUserId,
      dto.studentId,
    );
    return { success: true };
  }

  @Get('my-children')
  @Roles(UserRole.Parent)
  @ApiOperation({
    summary: 'List my linked children',
    description:
      'Returns enriched student info for every child linked to the ' +
      'authenticated parent.\n\n' +
      '🔒 Only available to parent-role users. Returns an empty array ' +
      'when the parent has no linked children.',
  })
  @ApiOkResponse({
    description: 'List of linked children with student details',
    type: ParentChildDto,
    isArray: true,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — only available to parent-role users',
  })
  async getMyChildren(@Req() req: TenantRequest) {
    const user = req.user;

    if (user?.role !== UserRole.Parent) {
      throw new ForbiddenException(
        'This endpoint is only available to parent accounts.',
      );
    }

    return this.parentStudentLinksService.getMyChildren(user.sub);
  }
}
