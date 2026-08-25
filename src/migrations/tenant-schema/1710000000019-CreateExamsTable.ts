import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExamsTable1710000000019
  implements MigrationInterface
{
  name = 'CreateExamsTable1710000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS exams (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(255) NOT NULL,
        "assessmentPeriodId" uuid,
        "examDate" date NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'draft',
        "gradingScaleId" uuid,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "FK_exams_assessmentPeriodId"
          FOREIGN KEY ("assessmentPeriodId") REFERENCES assessment_periods (id) ON DELETE SET NULL,
        CONSTRAINT "FK_exams_gradingScaleId"
          FOREIGN KEY ("gradingScaleId") REFERENCES grading_scales (id) ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS exams`);
  }
}
