import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { TenantConnectionCleanupInterceptor } from '../tenants/tenant-connection-cleanup.interceptor';
import { SchoolClass } from './class.entity';
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

@ApiTags('classes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a class',
    description:
      'Creates a new class in the current tenant schema. The class name must ' +
      'be unique within the tenant.',
  })
  @ApiResponse({
    status: 201,
    description: 'Class created successfully',
    type: SchoolClass,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict — class name already exists',
  })
  create(@Body() createClassDto: CreateClassDto) {
    return this.classesService.create(createClassDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List classes',
    description:
      'Returns all classes in the current tenant schema, ordered by ' +
      'displayOrder (then name).',
  })
  @ApiResponse({
    status: 200,
    description: 'List of classes ordered by displayOrder',
    type: SchoolClass,
    isArray: true,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  findAll() {
    return this.classesService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a class by id',
    description: 'Returns a single class by UUID.',
  })
  @ApiResponse({ status: 200, description: 'Class found', type: SchoolClass })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({ status: 404, description: 'Class not found' })
  findOne(@Param('id') id: string) {
    return this.classesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a class',
    description: 'Updates one or more fields of an existing class.',
  })
  @ApiResponse({ status: 200, description: 'Class updated', type: SchoolClass })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({ status: 404, description: 'Class not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — class name already exists',
  })
  update(@Param('id') id: string, @Body() updateClassDto: UpdateClassDto) {
    return this.classesService.update(id, updateClassDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a class (hard delete)',
    description:
      'Permanently deletes a class. Fails with 409 if the class still has ' +
      'sections — delete or reassign its sections first.',
  })
  @ApiResponse({
    status: 200,
    description: 'Class deleted',
    type: SchoolClass,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({ status: 404, description: 'Class not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — class still has sections',
  })
  remove(@Param('id') id: string) {
    return this.classesService.remove(id);
  }
}
