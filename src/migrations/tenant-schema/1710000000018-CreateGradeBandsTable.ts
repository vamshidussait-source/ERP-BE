import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGradeBandsTable1710000000018
  implements MigrationInterface
{
  name = 'CreateGradeBandsTable1710000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS grade_bands (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "gradingScaleId" uuid NOT NULL,
        "minPercentage" decimal(5,2) NOT NULL,
        "maxPercentage" decimal(5,2) NOT NULL,
        grade varchar(10) NOT NULL,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "FK_grade_bands_gradingScaleId"
          FOREIGN KEY ("gradingScaleId") REFERENCES grading_scales (id) ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS grade_bands`);
  }
}
