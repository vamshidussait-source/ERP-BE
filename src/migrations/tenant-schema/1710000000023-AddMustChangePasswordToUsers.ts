import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the "mustChangePassword" flag to the tenant users table.
 *
 * This single column serves both credential-management needs:
 *  - Issued/reset temporary passwords set it to true, forcing the
 *    password-change screen on next login.
 *  - The account-access list derives the 'password_reset_pending'
 *    loginStatus from it (a login that still has a temporary password).
 */
export class AddMustChangePasswordToUsers1710000000023
  implements MigrationInterface
{
  name = 'AddMustChangePasswordToUsers1710000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "mustChangePassword" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS "mustChangePassword"
    `);
  }
}
