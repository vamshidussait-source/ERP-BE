import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStaffQuickInfoFields1710000000022
  implements MigrationInterface
{
  name = 'AddStaffQuickInfoFields1710000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE staff
      ADD COLUMN IF NOT EXISTS "departmentName" varchar(255),
      ADD COLUMN IF NOT EXISTS "employmentType" varchar(50),
      ADD COLUMN IF NOT EXISTS "officeRoom" varchar(50)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE staff
      DROP COLUMN IF EXISTS "departmentName",
      DROP COLUMN IF EXISTS "employmentType",
      DROP COLUMN IF EXISTS "officeRoom"
    `);
  }
}
