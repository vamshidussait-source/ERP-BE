import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
  @ApiOperation({
    summary: 'Provision a new tenant',
    description:
      'Creates a tenant, provisions its Postgres schema, and runs all ' +
      'tenant-schema migrations.\n\n' +
      '⚠️ Admin route — NOT tenant-scoped: this endpoint is not protected by ' +
      'JwtAuthGuard/TenantGuard and requires no X-Tenant-ID header or Bearer ' +
      'token. It is intended for system administrators only (an admin-only ' +
      'guard is planned as a follow-up).',
  })
  @ApiResponse({
    status: 201,
    description: 'Tenant created and schema provisioned',
    type: Tenant,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — schemaName or subdomain already exists',
  })
  provision(@Body() createTenantDto: CreateTenantDto) {
    // TODO: protect this endpoint with an admin-only guard in a later step.
    return this.tenantProvisioningService.provisionTenant(createTenantDto);
  }
}
