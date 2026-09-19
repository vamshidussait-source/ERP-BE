import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import { AccountAccessService } from './account-access.service';
import { IssueLoginDto } from './dto/issue-login.dto';
import {
  ListAccountAccessQueryDto,
  LOGIN_STATUSES,
} from './dto/list-account-access-query.dto';

@ApiTags('account-access')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('account-access')
export class AccountAccessController {
  constructor(private readonly accountAccessService: AccountAccessService) {}

  @Get()
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'List all accounts and their login status (paginated)',
    description:
      'Returns a unified, paginated list combining staff, students, and ' +
      'parents. Each row shows the name, type, related record (employeeId ' +
      'for staff, admissionNumber for students, null for parents), login ' +
      'email (null when no login exists), hasLogin, and loginStatus ' +
      "('active' | 'no_login' | 'password_reset_pending' | 'revoked').\n\n" +
      'Supports ?type=, ?hasLogin=true|false, ?loginStatus=, ?search= ' +
      '(name/email, case-insensitive partial match) and pagination via ' +
      '?page= & ?limit=.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiOkResponse({
    description: 'Paginated unified account list',
    schema: {
      example: {
        data: [
          {
            id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
            name: 'Ada Lovelace',
            type: 'staff',
            relatedRecord: 'EMP-0001',
            email: 'ada@greenwood.edu',
            hasLogin: true,
            loginStatus: 'active',
            userId: '0f8d5c2e-7b1a-4c3d-9e2f-1a2b3c4d5e6f',
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  findAll(@Query() query: ListAccountAccessQueryDto) {
    return this.accountAccessService.findAll(query);
  }

  @Post('issue-login')
  @Roles(UserRole.SchoolAdmin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Issue a login for a staff member, student, or parent',
    description:
      'Creates the users row for the target record with a generated ' +
      'temporary password (returned ONCE in this response, stored only as a ' +
      'bcrypt hash, never logged) and sets mustChangePassword=true so the ' +
      'user must change it on first login.\n\n' +
      'For parents, linkedStudentIds is required and supports multiple ' +
      'children (one parent_student_links row per child). Staff and ' +
      'students may only have one login each — re-issuing returns 409; use ' +
      'reset-password instead.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Login created; temporaryPassword is shown exactly once — { userId, email, temporaryPassword }',
    schema: {
      example: {
        userId: '0f8d5c2e-7b1a-4c3d-9e2f-1a2b3c4d5e6f',
        email: 'parent@example.com',
        temporaryPassword: 'Kp7mNx2QrT9z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 404,
    description: 'Target staff/student record (or a linked student) not found',
  })
  @ApiResponse({
    status: 409,
    description:
      'Conflict — a login with this email exists, or the target already has a login',
  })
  issueLogin(@Body() dto: IssueLoginDto) {
    return this.accountAccessService.issueLogin(dto);
  }

  @Post(':userId/reset-password')
  @Roles(UserRole.SchoolAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate a login to a new temporary password',
    description:
      'Generates a new temporary password (returned ONCE in this response), ' +
      'stores its bcrypt hash, and sets mustChangePassword=true so the user ' +
      'must change it on next login.\n\n' +
      'Session invalidation: JWTs are stateless with a 24h expiry and there ' +
      'is no token blacklist, so previously issued access tokens remain ' +
      'technically valid until they expire — but the rotated password closes ' +
      'the credential path. Token-version-based invalidation would be a ' +
      'separate system-wide change.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Password rotated; temporaryPassword is shown exactly once — { userId, email, temporaryPassword }',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  resetPassword(
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.accountAccessService.resetPassword(userId);
  }

  @Post(':userId/revoke')
  @Roles(UserRole.SchoolAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke (deactivate) a login',
    description:
      "Sets isActive=false on the user's row without deleting it — the " +
      'login can be re-issued later. Login attempts by a revoked user are ' +
      'rejected with 401.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login deactivated — { userId, email, isActive: false }',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  revoke(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.accountAccessService.revoke(userId);
  }
}
