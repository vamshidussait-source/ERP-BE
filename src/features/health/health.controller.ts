import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateHealthCheckDto } from './dto/create-health-check.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Health check',
    description:
      'Public route — no authentication required. Returns the service health ' +
      'status.',
  })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  getHealth() {
    return this.healthService.getHealth();
  }

  @Post('validate')
  @ApiOperation({
    summary: 'Validate a payload',
    description:
      'Public route — no authentication required. Echoes back the validated ' +
      'payload to demonstrate request validation.',
  })
  @ApiResponse({
    status: 201,
    description: 'Validation succeeded, returns the validated payload',
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  validate(@Body() createHealthCheckDto: CreateHealthCheckDto) {
    return {
      message: 'Validation succeeded',
      payload: createHealthCheckDto,
    };
  }
}
