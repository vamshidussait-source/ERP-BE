import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Response, NextFunction } from 'express';
import { Repository } from 'typeorm';
import { Tenant } from './tenant.entity';
import { TenantRequest } from './tenant-request.types';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async use(req: TenantRequest, _res: Response, next: NextFunction): Promise<void> {
    let identifier: string;
    let searchField: 'schemaName' | 'subdomain';

    const xTenantId = req.headers['x-tenant-id'] as string | undefined;

    if (xTenantId) {
      // X-Tenant-ID is an explicit identifier that maps to schemaName.
      identifier = xTenantId;
      searchField = 'schemaName';
    } else {
      const host = req.headers.host;
      if (!host) {
        throw new BadRequestException(
          'Tenant identifier is required: provide an X-Tenant-ID header or a subdomain in the Host header',
        );
      }

      const parts = host.split('.');
      if (parts.length < 2) {
        throw new BadRequestException(
          'Could not extract tenant identifier from the Host header subdomain',
        );
      }

      // e.g. "greenwood.myerp.com" -> "greenwood"
      identifier = parts[0];
      searchField = 'subdomain';
    }

    const tenant = await this.tenantRepository.findOne({
      where: { [searchField]: identifier },
    });

    if (!tenant) {
      throw new NotFoundException(
        `Tenant not found for ${searchField}: ${identifier}`,
      );
    }

    // An inactive tenant must still be able to reach the reactivate endpoint,
    // otherwise it could never be brought back. Everything else stays blocked.
    const isReactivateRequest =
      req.method === 'POST' && /\/tenants\/[^/]+\/reactivate$/.test(req.path);

    if (!tenant.isActive && !isReactivateRequest) {
      throw new ForbiddenException("This school's account is currently inactive.");
    }

    req.tenantSchema = tenant.schemaName;
    req.tenantId = tenant.id;

    next();
  }
}
