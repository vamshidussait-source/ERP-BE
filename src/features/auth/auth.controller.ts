import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
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
import { AllowWithPendingPasswordChange } from '../auth/allow-with-pending-password-change.decorator';
import { Public } from '../auth/public.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantConnectionCleanupInterceptor } from '../tenants/tenant-connection-cleanup.interceptor';
import type { TenantRequest } from '../tenants/tenant-request.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // Documentational: login has no request.user yet, so the pending-password
  // guard never applies — but keeping the exemption explicit protects the
  // route if auth mechanics ever change.
  @AllowWithPendingPasswordChange()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in and receive a JWT',
    description:
      'Public route — NOT protected by JwtAuthGuard or TenantGuard; no Bearer ' +
      'token required.\n\n' +
      'Note: TenantMiddleware still resolves the tenant context from the ' +
      'X-Tenant-ID header (or subdomain) so login is scoped to a specific ' +
      'tenant. Returns a JWT access token to use as the Bearer token on ' +
      'protected endpoints.\n\n' +
      'The response includes mustChangePassword (top level and on user). ' +
      'When true the user is still on a temporary password and the frontend ' +
      'must force the password-change screen (POST /auth/change-password) ' +
      'before allowing normal access.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Login succeeded, returns { accessToken, mustChangePassword, user: { id, email, role, mustChangePassword } }',
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — invalid credentials or inactive account',
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.password);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @AllowWithPendingPasswordChange()
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change the authenticated user\u2019s password',
    description:
      'Accepts currentPassword + newPassword. Verifies the current password, ' +
      'hashes and stores the new one, and clears the mustChangePassword ' +
      'flag. Available to any authenticated tenant user — including users ' +
      'still on a temporary password, for whom every other route is blocked ' +
      'by MustChangePasswordGuard.\n\n' +
      'Returns a fresh access token with mustChangePassword=false — the ' +
      'frontend must replace the stored token with it, since the old token ' +
      'keeps the flagged claim until expiry.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Password changed and flag cleared; returns { accessToken, mustChangePassword: false, user }',
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — current password incorrect or invalid token',
  })
  async changePassword(
    @Req() req: TenantRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      req.user!.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
