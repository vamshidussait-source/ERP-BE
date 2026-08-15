import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantsTable1710000000000 implements MigrationInterface {
  name = 'CreateTenantsTable1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.tenants (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        name character varying(255) NOT NULL,
        "schemaName" character varying(255) NOT NULL,
        subdomain character varying(255) NOT NULL,
        "planTier" character varying(20) NOT NULL DEFAULT 'trial',
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenants" PRIMARY KEY (id),
        CONSTRAINT "UQ_tenants_schemaName" UNIQUE ("schemaName"),
        CONSTRAINT "UQ_tenants_subdomain" UNIQUE (subdomain)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.tenants`);
  }
}
