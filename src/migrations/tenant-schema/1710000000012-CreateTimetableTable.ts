import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTimetableTable1710000000012 implements MigrationInterface {
  name = 'CreateTimetableTable1710000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS timetable (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sectionId" uuid NOT NULL,
        "dayOfWeek" varchar(20) NOT NULL,
        "periodNumber" integer NOT NULL,
        subject varchar(255) NOT NULL,
        "staffId" uuid,
        "startTime" time NOT NULL,
        "endTime" time NOT NULL,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_timetable_section_day_period"
          UNIQUE ("sectionId", "dayOfWeek", "periodNumber"),
        CONSTRAINT "FK_timetable_sectionId"
          FOREIGN KEY ("sectionId") REFERENCES sections (id) ON DELETE CASCADE,
        CONSTRAINT "FK_timetable_staffId"
          FOREIGN KEY ("staffId") REFERENCES staff (id) ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS timetable`);
  }
}
