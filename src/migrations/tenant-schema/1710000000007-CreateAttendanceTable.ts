import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAttendanceTable1710000000007 implements MigrationInterface {
  name = 'CreateAttendanceTable1710000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "studentId" uuid NOT NULL,
        "sectionId" uuid,
        date date NOT NULL,
        status varchar(20) NOT NULL,
        "markedBy" uuid,
        notes varchar(500),
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_attendance_studentId_date" UNIQUE ("studentId", date),
        CONSTRAINT "FK_attendance_studentId" FOREIGN KEY ("studentId")
          REFERENCES students (id) ON DELETE CASCADE,
        CONSTRAINT "FK_attendance_sectionId" FOREIGN KEY ("sectionId")
          REFERENCES sections (id) ON DELETE SET NULL,
        CONSTRAINT "FK_attendance_markedBy" FOREIGN KEY ("markedBy")
          REFERENCES staff (id) ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS attendance`);
  }
}
