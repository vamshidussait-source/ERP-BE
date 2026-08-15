import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getHealth() {
    return {
      status: 'ok',
      service: 'erp-be',
      timestamp: new Date().toISOString(),
    };
  }
}
