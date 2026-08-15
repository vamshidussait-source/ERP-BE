import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
      'protected endpoints.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Login succeeded, returns { accessToken, user: { id, email, role } }',
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — invalid credentials or inactive account',
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.password);
  }
}
