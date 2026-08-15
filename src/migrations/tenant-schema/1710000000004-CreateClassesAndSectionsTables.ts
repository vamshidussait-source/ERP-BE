import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateClassesAndSectionsTables1710000000004 implements MigrationInterface {
  name = 'CreateClassesAndSectionsTables1710000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Classes first — sections has a foreign key to classes.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS classes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(255) NOT NULL,
        "displayOrder" integer NOT NULL DEFAULT 0,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_classes_name" UNIQUE (name)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "classId" uuid NOT NULL,
        name varchar(50) NOT NULL,
        capacity integer,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_sections_classId_name" UNIQUE ("classId", name),
        CONSTRAINT "FK_sections_classId" FOREIGN KEY ("classId")
          REFERENCES classes (id) ON DELETE RESTRICT
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop sections first — it references classes.
    await queryRunner.query(`DROP TABLE IF EXISTS sections`);
    await queryRunner.query(`DROP TABLE IF EXISTS classes`);
  }
}
