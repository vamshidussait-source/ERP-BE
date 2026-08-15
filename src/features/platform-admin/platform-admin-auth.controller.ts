import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PlatformAdminLoginDto } from './dto/platform-admin-login.dto';
import { PlatformAdminAuthService } from './platform-admin-auth.service';

@ApiTags('platform-admin-auth')
@Controller('admin/auth')
export class PlatformAdminAuthController {
  constructor(
    private readonly platformAdminAuthService: PlatformAdminAuthService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in as a platform administrator',
    description:
      'SYSTEM-LEVEL route — NOT tenant-scoped. This endpoint is public ' +
      '(no JwtAuthGuard/TenantGuard/PlatformAdminGuard), does NOT require an ' +
      'X-Tenant-ID header, and does NOT run TenantMiddleware: platform admin ' +
      'credentials are checked against the public platform_admins table, not ' +
      'any school schema.\\n\\n' +
      'Returns a JWT access token with payload { sub: adminId, role: ' +
      "'platform_admin' } — deliberately no tenantId/tenantSchema claims, " +
      'since this identity is not scoped to any school. Use the token as the ' +
      'Bearer token on system-level admin endpoints protected by ' +
      'JwtAuthGuard + PlatformAdminGuard.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Login succeeded, returns { accessToken, admin: { id, email, name } }',
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — invalid credentials or inactive account',
  })
  async login(@Body() loginDto: PlatformAdminLoginDto) {
    return this.platformAdminAuthService.login(
      loginDto.email,
      loginDto.password,
    );
  }
}
