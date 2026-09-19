import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnnouncementReadsTable1710000000025
  implements MigrationInterface
{
  name = 'CreateAnnouncementReadsTable1710000000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS announcement_reads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "announcementId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "readAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_announcement_reads_announcement_user"
          UNIQUE ("announcementId", "userId"),
        CONSTRAINT "FK_announcement_reads_announcementId"
          FOREIGN KEY ("announcementId") REFERENCES announcements (id)
          ON DELETE CASCADE,
        CONSTRAINT "FK_announcement_reads_userId"
          FOREIGN KEY ("userId") REFERENCES users (id)
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_announcement_reads_userId"
        ON announcement_reads ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS announcement_reads`);
  }
}
