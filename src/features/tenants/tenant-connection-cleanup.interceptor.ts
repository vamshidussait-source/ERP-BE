import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { TenantConnectionService } from './tenant-connection.service';

@Injectable()
export class TenantConnectionCleanupInterceptor implements NestInterceptor {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      finalize(() => {
        // Release the per-request query runner (if one was created) after the
        // response is sent, regardless of success or error.
        this.tenantConnectionService.release();
      }),
    );
  }
}
