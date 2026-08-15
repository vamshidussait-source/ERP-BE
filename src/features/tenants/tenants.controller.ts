import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../platform-admin/platform-admin.guard';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './tenant.entity';
import { TenantsService } from './tenants.service';

/**
 * System-level tenant management for the admin portal.
 *
 * These routes are NOT tenant-scoped: a platform admin browses ALL tenants,
 * so there is no single "current tenant" to resolve. TenantMiddleware is not
 * applied here and no X-Tenant-ID header is used — access is restricted to
 * platform-admin JWTs from POST /admin/auth/login (JwtAuthGuard +
 * PlatformAdminGuard).
 *
 * Queries go straight through TenantsService's plain TypeORM repository on
 * the public schema, so no per-request tenant connection is ever opened and
 * TenantConnectionCleanupInterceptor is not needed on this controller.
 */
@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all tenants (paginated)',
    description:
      'PLATFORM-ADMIN-ONLY route — NOT tenant-scoped: requires a Bearer ' +
      'token from POST /admin/auth/login whose payload role is ' +
      "'platform_admin' (JwtAuthGuard + PlatformAdminGuard). No X-Tenant-ID " +
      'header is used. Returns a paginated list of every tenant on the ' +
      'platform as { data, total, page, limit }.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list returned as { data, total, page, limit }',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden — platform admin privileges required (valid JWT with role 'platform_admin')",
  })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.tenantsService.findAll(page, limit);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a tenant by id',
    description:
      'PLATFORM-ADMIN-ONLY route — NOT tenant-scoped: requires a Bearer ' +
      "token from POST /admin/auth/login whose payload role is " +
      "'platform_admin' (JwtAuthGuard + PlatformAdminGuard). No X-Tenant-ID " +
      'header is used. Returns a single tenant by UUID.',
  })
  @ApiResponse({ status: 200, description: 'Tenant found', type: Tenant })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden — platform admin privileges required (valid JWT with role 'platform_admin')",
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a tenant',
    description:
      'PLATFORM-ADMIN-ONLY route — NOT tenant-scoped: requires a Bearer ' +
      "token from POST /admin/auth/login whose payload role is " +
      "'platform_admin' (JwtAuthGuard + PlatformAdminGuard). No X-Tenant-ID " +
      'header is used. Updates one or more fields of an existing tenant.',
  })
  @ApiResponse({ status: 200, description: 'Tenant updated', type: Tenant })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden — platform admin privileges required (valid JWT with role 'platform_admin')",
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  update(@Param('id') id: string, @Body() updateTenantDto: UpdateTenantDto) {
    return this.tenantsService.update(id, updateTenantDto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({
    summary: 'Deactivate a tenant',
    description:
      'PLATFORM-ADMIN-ONLY route — NOT tenant-scoped: requires a Bearer ' +
      "token from POST /admin/auth/login whose payload role is " +
      "'platform_admin' (JwtAuthGuard + PlatformAdminGuard). No X-Tenant-ID " +
      'header is used. Soft-deactivates a tenant by setting isActive to false.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tenant deactivated',
    type: Tenant,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden — platform admin privileges required (valid JWT with role 'platform_admin')",
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  deactivate(@Param('id') id: string) {
    return this.tenantsService.deactivate(id);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reactivate a tenant',
    description:
      'PLATFORM-ADMIN-ONLY route — NOT tenant-scoped: requires a Bearer ' +
      "token from POST /admin/auth/login whose payload role is " +
      "'platform_admin' (JwtAuthGuard + PlatformAdminGuard). No X-Tenant-ID " +
      'header is used. Reactivates a previously deactivated tenant by ' +
      'setting isActive to true.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tenant reactivated',
    type: Tenant,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden — platform admin privileges required (valid JWT with role 'platform_admin')",
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  reactivate(@Param('id') id: string) {
    return this.tenantsService.reactivate(id);
  }
}
