import {
  Inject,
  Injectable,
  OnModuleDestroy,
  Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import type { TenantRequest } from './tenant-request.types';

@Injectable({ scope: Scope.REQUEST })
export class TenantConnectionService implements OnModuleDestroy {
  private queryRunner: QueryRunner | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REQUEST) private readonly request: TenantRequest,
  ) {}

  async getQueryRunner(): Promise<QueryRunner> {
    if (this.queryRunner) {
      return this.queryRunner;
    }

    const tenantSchema = this.request.tenantSchema;
    if (!tenantSchema) {
      throw new Error(
        'Tenant schema is not set on the request. Ensure TenantMiddleware is applied to this route.',
      );
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();

    // Escape the schema name via quote_ident for defense-in-depth.
    const quoted = await qr.query(
      `SELECT quote_ident($1::text) as quoted`,
      [tenantSchema],
    );
    const escapedSchema = quoted[0]?.quoted ?? tenantSchema;
    await qr.query(`SET search_path TO ${escapedSchema}`);

    this.queryRunner = qr;
    return qr;
  }

  /**
   * Explicitly release the cached query runner, if one was created.
   * Called per-request by TenantConnectionCleanupInterceptor.
   */
  release(): void {
    if (this.queryRunner) {
      this.queryRunner.release().catch(() => {
        // Swallow release errors — the pool will reclaim the connection.
      });
      this.queryRunner = null;
    }
  }

  /** Safety net: releases the query runner on application shutdown. */
  async onModuleDestroy(): Promise<void> {
    this.release();
  }
}
