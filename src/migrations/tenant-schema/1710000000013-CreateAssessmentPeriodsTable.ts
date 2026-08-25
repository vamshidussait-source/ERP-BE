import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAssessmentPeriodsTable1710000000013
  implements MigrationInterface
{
  name = 'CreateAssessmentPeriodsTable1710000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS assessment_periods (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(100) NOT NULL,
        "academicYear" varchar(20) NOT NULL,
        "startDate" date NOT NULL,
        "endDate" date NOT NULL,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_assessment_periods_name_academicYear"
          UNIQUE (name, "academicYear")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS assessment_periods`);
  }
}
