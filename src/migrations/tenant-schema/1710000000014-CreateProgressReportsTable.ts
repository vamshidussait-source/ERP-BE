import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProgressReportsTable1710000000014
  implements MigrationInterface
{
  name = 'CreateProgressReportsTable1710000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS progress_reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "studentId" uuid NOT NULL,
        "assessmentPeriodId" uuid NOT NULL,
        "classTeacherRemarks" text,
        "attendancePercentage" decimal(5,2),
        "preparedByStaffId" uuid,
        status varchar(20) NOT NULL DEFAULT 'draft',
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_progress_reports_student_period"
          UNIQUE ("studentId", "assessmentPeriodId"),
        CONSTRAINT "FK_progress_reports_studentId"
          FOREIGN KEY ("studentId") REFERENCES students (id) ON DELETE CASCADE,
        CONSTRAINT "FK_progress_reports_assessmentPeriodId"
          FOREIGN KEY ("assessmentPeriodId") REFERENCES assessment_periods (id) ON DELETE CASCADE,
        CONSTRAINT "FK_progress_reports_preparedByStaffId"
          FOREIGN KEY ("preparedByStaffId") REFERENCES staff (id) ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS progress_reports`);
  }
}
