import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlatformAdminsTable1720000000000 implements MigrationInterface {
  name = 'CreatePlatformAdminsTable1720000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.platform_admins (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        email character varying(255) NOT NULL,
        "passwordHash" character varying(255) NOT NULL,
        name character varying(255) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_platform_admins" PRIMARY KEY (id),
        CONSTRAINT "UQ_platform_admins_email" UNIQUE (email)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.platform_admins`);
  }
}
