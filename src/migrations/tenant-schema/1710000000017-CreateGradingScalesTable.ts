import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGradingScalesTable1710000000017
  implements MigrationInterface
{
  name = 'CreateGradingScalesTable1710000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS grading_scales (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(255) NOT NULL,
        "isDefault" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS grading_scales`);
  }
}
