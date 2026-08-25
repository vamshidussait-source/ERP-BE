import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExamSubjectConfigsTable1710000000020
  implements MigrationInterface
{
  name = 'CreateExamSubjectConfigsTable1710000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS exam_subject_configs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "examId" uuid NOT NULL,
        "subjectId" uuid NOT NULL,
        "maxMarks" integer NOT NULL,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_exam_subject_configs_exam_subject"
          UNIQUE ("examId", "subjectId"),
        CONSTRAINT "FK_exam_subject_configs_examId"
          FOREIGN KEY ("examId") REFERENCES exams (id) ON DELETE CASCADE,
        CONSTRAINT "FK_exam_subject_configs_subjectId"
          FOREIGN KEY ("subjectId") REFERENCES subjects (id) ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS exam_subject_configs`);
  }
}
