import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLinkedStaffIdToUsers1710000000011
  implements MigrationInterface
{
  name = 'AddLinkedStaffIdToUsers1710000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN "linkedStaffId" uuid,
      ADD CONSTRAINT "FK_users_linkedStaffId"
        FOREIGN KEY ("linkedStaffId") REFERENCES staff (id)
        ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS "FK_users_linkedStaffId",
      DROP COLUMN IF EXISTS "linkedStaffId"
    `);
  }
}
