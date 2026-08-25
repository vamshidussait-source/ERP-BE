import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCoScholasticGradesTable1710000000015
  implements MigrationInterface
{
  name = 'CreateCoScholasticGradesTable1710000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS co_scholastic_grades (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "progressReportId" uuid NOT NULL,
        area varchar(255) NOT NULL,
        grade varchar(10) NOT NULL,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_co_scholastic_grades_report_area"
          UNIQUE ("progressReportId", area),
        CONSTRAINT "FK_co_scholastic_grades_progressReportId"
          FOREIGN KEY ("progressReportId") REFERENCES progress_reports (id) ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS co_scholastic_grades`);
  }
}
