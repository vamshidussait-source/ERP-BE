import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1710000000002 implements MigrationInterface {
  name = 'CreateUsersTable1710000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the placeholder table that was created by the init migration.
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_users`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar(255) NOT NULL,
        "passwordHash" varchar(255) NOT NULL,
        role varchar(20) NOT NULL DEFAULT 'staff',
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE (email)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
