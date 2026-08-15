import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
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
import { TenantConnectionCleanupInterceptor } from '../tenants/tenant-connection-cleanup.interceptor';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { Student, StudentStatus } from './student.entity';
import { StudentsService } from './students.service';

@ApiTags('students')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a student',
    description:
      'Creates a new student in the current tenant schema. The admission number must be unique within the tenant.',
  })
  @ApiResponse({
    status: 201,
    description: 'Student created successfully',
    type: Student,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (missing or invalid fields)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid JWT required',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found — referenced section does not exist',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict — admission number already exists',
  })
  create(@Body() createStudentDto: CreateStudentDto) {
    return this.studentsService.create(createStudentDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List students (paginated)',
    description:
      'Returns a paginated list of students in the current tenant schema, optionally filtered by status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list returned as { data, total, page, limit }',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (invalid page, limit, or status)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid JWT required',
  })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status', new ParseEnumPipe(StudentStatus, { optional: true }))
    status?: StudentStatus,
  ) {
    return this.studentsService.findAll(page, limit, status);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a student by id',
    description:
      'Returns a single student from the current tenant schema by UUID.',
  })
  @ApiResponse({ status: 200, description: 'Student found', type: Student })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid JWT required',
  })
  @ApiResponse({ status: 404, description: 'Student not found' })
  findOne(@Param('id') id: string) {
    return this.studentsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a student',
    description:
      'Updates one or more fields of an existing student in the current tenant schema.',
  })
  @ApiResponse({ status: 200, description: 'Student updated', type: Student })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid JWT required',
  })
  @ApiResponse({ status: 404, description: 'Student not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — admission number already exists',
  })
  update(@Param('id') id: string, @Body() updateStudentDto: UpdateStudentDto) {
    return this.studentsService.update(id, updateStudentDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Soft delete a student',
    description:
      'Soft deletes a student by setting their status to "inactive". The row is kept in the database.',
  })
  @ApiResponse({
    status: 200,
    description: 'Student soft-deleted (status set to inactive)',
    type: Student,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid JWT required',
  })
  @ApiResponse({ status: 404, description: 'Student not found' })
  remove(@Param('id') id: string) {
    return this.studentsService.softDelete(id);
  }
}
