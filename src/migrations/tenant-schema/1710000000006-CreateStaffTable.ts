import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStaffTable1710000000006 implements MigrationInterface {
  name = 'CreateStaffTable1710000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS staff (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "firstName" varchar(255) NOT NULL,
        "lastName" varchar(255) NOT NULL,
        email varchar(255) NOT NULL,
        phone varchar(50),
        designation varchar(255) NOT NULL,
        "employeeId" varchar(50) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'active',
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_staff_email" UNIQUE (email),
        CONSTRAINT "UQ_staff_employeeId" UNIQUE ("employeeId")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS staff`);
  }
}
