import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantSchemaInit001 implements MigrationInterface {
  name = 'CreateTenantSchemaInit001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar(255) NOT NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_users`);
  }
}
