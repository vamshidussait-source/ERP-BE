import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExamMarksTable1710000000021
  implements MigrationInterface
{
  name = 'CreateExamMarksTable1710000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS exam_marks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "examId" uuid NOT NULL,
        "studentId" uuid NOT NULL,
        "subjectId" uuid NOT NULL,
        "marksObtained" decimal(7,2),
        "enteredByStaffId" uuid,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_exam_marks_exam_student_subject"
          UNIQUE ("examId", "studentId", "subjectId"),
        CONSTRAINT "FK_exam_marks_examId"
          FOREIGN KEY ("examId") REFERENCES exams (id) ON DELETE CASCADE,
        CONSTRAINT "FK_exam_marks_studentId"
          FOREIGN KEY ("studentId") REFERENCES students (id) ON DELETE CASCADE,
        CONSTRAINT "FK_exam_marks_subjectId"
          FOREIGN KEY ("subjectId") REFERENCES subjects (id) ON DELETE CASCADE,
        CONSTRAINT "FK_exam_marks_enteredByStaffId"
          FOREIGN KEY ("enteredByStaffId") REFERENCES staff (id) ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS exam_marks`);
  }
}
