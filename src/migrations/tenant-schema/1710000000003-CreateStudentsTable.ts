import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStudentsTable1710000000003 implements MigrationInterface {
  name = 'CreateStudentsTable1710000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS students (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "firstName" varchar(255) NOT NULL,
        "lastName" varchar(255) NOT NULL,
        "dateOfBirth" date NOT NULL,
        "admissionNumber" varchar(50) NOT NULL,
        "classId" uuid,
        status varchar(20) NOT NULL DEFAULT 'active',
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_students_admissionNumber" UNIQUE ("admissionNumber")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS students`);
  }
}
