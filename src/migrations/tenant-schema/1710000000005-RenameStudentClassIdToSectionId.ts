import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameStudentClassIdToSectionId1710000000005 implements MigrationInterface {
  name = 'RenameStudentClassIdToSectionId1710000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE students RENAME COLUMN "classId" TO "sectionId"
    `);

    // Clear any pre-existing values that don't reference a real section, so
    // the new FK constraint can be enforced against existing data (old values
    // may have pointed at classes rather than sections).
    await queryRunner.query(`
      UPDATE students SET "sectionId" = NULL
      WHERE "sectionId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM sections WHERE id = students."sectionId")
    `);

    // Students belong to a Section, not directly to a Class. ON DELETE SET NULL
    // keeps students on record (unassigned) if their section is reorganized.
    await queryRunner.query(`
      ALTER TABLE students
        ADD CONSTRAINT "FK_students_sectionId"
        FOREIGN KEY ("sectionId") REFERENCES sections (id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE students DROP CONSTRAINT IF EXISTS "FK_students_sectionId"
    `);
    await queryRunner.query(`
      ALTER TABLE students RENAME COLUMN "sectionId" TO "classId"
    `);
  }
}
