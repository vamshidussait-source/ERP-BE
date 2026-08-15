import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { tenantSchemaMigrations } from '../../migrations/tenant-schema';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { Tenant } from './tenant.entity';

@Injectable()
export class TenantProvisioningService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async provisionTenant(createTenantDto: CreateTenantDto): Promise<Tenant> {
    const { schemaName, subdomain } = createTenantDto;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existingTenant = await queryRunner.manager
        .getRepository(Tenant)
        .createQueryBuilder('tenant')
        .where('tenant.schemaName = :schemaName', { schemaName })
        .orWhere('tenant.subdomain = :subdomain', { subdomain })
        .getOne();

      if (existingTenant) {
        const field =
          existingTenant.schemaName === schemaName ? 'schemaName' : 'subdomain';
        throw new ConflictException(
          `A tenant with the same ${field} already exists`,
        );
      }

      const tenant = queryRunner.manager.create(Tenant, createTenantDto);
      const savedTenant = await queryRunner.manager.save(tenant);

      const quotedSchemaName = await queryRunner.query(
        `SELECT quote_ident($1::text) as quoted`,
        [schemaName],
      );
      const escapedSchemaName = quotedSchemaName[0]?.quoted ?? schemaName;

      await queryRunner.query(`CREATE SCHEMA ${escapedSchemaName}`);
      await queryRunner.query(`SET search_path TO ${escapedSchemaName}`);

      // Ensure migrations tracking table exists in the tenant schema.
      await queryRunner.query(
        `CREATE TABLE IF NOT EXISTS ${escapedSchemaName}.migrations (id serial PRIMARY KEY, name varchar(255) NOT NULL UNIQUE, run_on timestamp DEFAULT CURRENT_TIMESTAMP)`,
      );

      for (const MigrationClass of tenantSchemaMigrations) {
        const migrationInstance = new MigrationClass();
        const migrationName = migrationInstance.name ?? MigrationClass.name;

        // Skip already-run migrations.
        const alreadyRun = await queryRunner.query(
          `SELECT id FROM ${escapedSchemaName}.migrations WHERE name = $1`,
          [migrationName],
        );

        if (alreadyRun.length === 0) {
          await migrationInstance.up(queryRunner);
          await queryRunner.query(
            `INSERT INTO ${escapedSchemaName}.migrations (name) VALUES ($1)`,
            [migrationName],
          );
        }
      }

      await queryRunner.commitTransaction();
      return savedTenant;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      if (error instanceof ConflictException) {
        throw error;
      }

      try {
        const quotedSchemaName = await queryRunner.query(
          `SELECT quote_ident($1::text) as quoted`,
          [schemaName],
        );
        const escapedSchemaName = quotedSchemaName[0]?.quoted ?? schemaName;
        await queryRunner.query(
          `DROP SCHEMA IF EXISTS ${escapedSchemaName} CASCADE`,
        );
      } catch {
        // Ignore cleanup failure in rollback path.
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
