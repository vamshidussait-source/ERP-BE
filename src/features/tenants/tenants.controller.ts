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
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './tenant.entity';
import { TenantConnectionCleanupInterceptor } from './tenant-connection-cleanup.interceptor';
import { TenantsService } from './tenants.service';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @ApiOperation({
    summary: 'List tenants (paginated)',
    description:
      'Returns a paginated list of tenants. Tenant-scoped: requires a valid ' +
      'JWT whose tenant matches the X-Tenant-ID header (or subdomain).',
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
    description: 'Forbidden — token tenant does not match request tenant',
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
    description: 'Returns a single tenant by UUID.',
  })
  @ApiResponse({ status: 200, description: 'Tenant found', type: Tenant })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — token tenant does not match request tenant',
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a tenant',
    description: 'Updates one or more fields of an existing tenant.',
  })
  @ApiResponse({ status: 200, description: 'Tenant updated', type: Tenant })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — token tenant does not match request tenant',
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  update(@Param('id') id: string, @Body() updateTenantDto: UpdateTenantDto) {
    return this.tenantsService.update(id, updateTenantDto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({
    summary: 'Deactivate a tenant',
    description: 'Soft-deactivates a tenant by setting isActive to false.',
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
    description: 'Forbidden — token tenant does not match request tenant',
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
      'Reactivates a previously deactivated tenant by setting isActive to true.',
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
    description: 'Forbidden — token tenant does not match request tenant',
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  reactivate(@Param('id') id: string) {
    return this.tenantsService.reactivate(id);
  }
}
