import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
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
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { UserRole } from '../auth/user.entity';
import { TenantConnectionCleanupInterceptor } from '../tenants/tenant-connection-cleanup.interceptor';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { Staff } from './staff.entity';
import { StaffService } from './staff.service';

@ApiTags('staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Create a staff member',
    description:
      'Creates a new staff member in the current tenant schema.\n\n' +
      '🔒 Requires the school_admin role. Read-only roles (staff, parent, ' +
      'student) are denied with 403.',
  })
  @ApiResponse({
    status: 201,
    description: 'Staff member created successfully',
    type: Staff,
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
  @ApiResponse({
    status: 409,
    description: 'Conflict — email or employeeId already exists',
  })
  create(@Body() createStaffDto: CreateStaffDto) {
    return this.staffService.create(createStaffDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List staff members (paginated)',
    description:
      'Returns a paginated list of staff members in the current tenant ' +
      'schema. Accessible to any authenticated tenant role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list returned as { data, total, page, limit }',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.staffService.findAll(page, limit);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a staff member by id',
    description:
      'Returns a single staff member by UUID. Accessible to any ' +
      'authenticated tenant role.',
  })
  @ApiResponse({ status: 200, description: 'Staff member found', type: Staff })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  findOne(@Param('id') id: string) {
    return this.staffService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Update a staff member',
    description:
      'Updates one or more fields of an existing staff member.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Staff member updated',
    type: Staff,
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
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — email or employeeId already exists',
  })
  update(@Param('id') id: string, @Body() updateStaffDto: UpdateStaffDto) {
    return this.staffService.update(id, updateStaffDto);
  }

  @Delete(':id')
  @Roles(UserRole.SchoolAdmin)
  @ApiOperation({
    summary: 'Soft delete a staff member',
    description:
      'Soft deletes a staff member by setting their status to "inactive". ' +
      'The row is kept in the database.\n\n' +
      '🔒 Requires the school_admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Staff member soft-deleted (status set to inactive)',
    type: Staff,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires the school_admin role',
  })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  remove(@Param('id') id: string) {
    return this.staffService.softDelete(id);
  }
}
