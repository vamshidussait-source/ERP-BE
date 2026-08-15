import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../platform-admin/platform-admin.guard';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { Tenant } from './tenant.entity';
import { TenantProvisioningService } from './tenant-provisioning.service';

@ApiTags('admin-tenants')
@Controller('admin/tenants')
export class AdminTenantsController {
  constructor(
    private readonly tenantProvisioningService: TenantProvisioningService,
  ) {}

  @Post('provision')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @ApiOperation({
    summary: 'Provision a new tenant',
    description:
      'Creates a tenant, provisions its Postgres schema, and runs all ' +
      'tenant-schema migrations.\n\n' +
      '⚠️ SYSTEM-LEVEL route — NOT tenant-scoped: requires a Bearer token ' +
      'from POST /admin/auth/login whose payload role is ' +
      "'platform_admin' (JwtAuthGuard + PlatformAdminGuard). No X-Tenant-ID " +
      'header is used.',
  })
  @ApiResponse({
    status: 201,
    description: 'Tenant created and schema provisioned',
    type: Tenant,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden — platform admin privileges required (valid JWT with role ' +
      "'platform_admin')",
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict — schemaName or subdomain already exists',
  })
  provision(@Body() createTenantDto: CreateTenantDto) {
    return this.tenantProvisioningService.provisionTenant(createTenantDto);
  }
}
