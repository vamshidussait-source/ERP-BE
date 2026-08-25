import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLinkedStudentIdToUsers1710000000010
  implements MigrationInterface
{
  name = 'AddLinkedStudentIdToUsers1710000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN "linkedStudentId" uuid,
      ADD CONSTRAINT "FK_users_linkedStudentId"
        FOREIGN KEY ("linkedStudentId") REFERENCES students (id)
        ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS "FK_users_linkedStudentId",
      DROP COLUMN IF EXISTS "linkedStudentId"
    `);
  }
}
