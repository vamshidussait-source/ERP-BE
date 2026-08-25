import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateParentStudentLinksTable1710000000009
  implements MigrationInterface
{
  name = 'CreateParentStudentLinksTable1710000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS parent_student_links (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "parentUserId" uuid NOT NULL,
        "studentId" uuid NOT NULL,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_parent_student_links_parent_student"
          UNIQUE ("parentUserId", "studentId"),
        CONSTRAINT "FK_parent_student_links_parentUserId"
          FOREIGN KEY ("parentUserId") REFERENCES users (id)
          ON DELETE CASCADE,
        CONSTRAINT "FK_parent_student_links_studentId"
          FOREIGN KEY ("studentId") REFERENCES students (id)
          ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS parent_student_links`);
  }
}
