import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFileUploadsTable1710000000008 implements MigrationInterface {
  name = 'CreateFileUploadsTable1710000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS file_uploads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "fileName" varchar(255) NOT NULL,
        "storageKey" varchar(1024) NOT NULL,
        "mimeType" varchar(100) NOT NULL,
        "sizeBytes" bigint NOT NULL,
        "uploadedBy" uuid,
        "relatedEntityType" varchar(50),
        "relatedEntityId" uuid,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "FK_file_uploads_uploadedBy" FOREIGN KEY ("uploadedBy")
          REFERENCES users (id) ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS file_uploads`);
  }
}
