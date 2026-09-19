import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnnouncementRecipientsTable1710000000026
  implements MigrationInterface
{
  name = 'CreateAnnouncementRecipientsTable1710000000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS announcement_recipients (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "announcementId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_announcement_recipients_announcement_user"
          UNIQUE ("announcementId", "userId"),
        CONSTRAINT "FK_announcement_recipients_announcementId"
          FOREIGN KEY ("announcementId") REFERENCES announcements (id)
          ON DELETE CASCADE,
        CONSTRAINT "FK_announcement_recipients_userId"
          FOREIGN KEY ("userId") REFERENCES users (id)
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_announcement_recipients_userId"
        ON announcement_recipients ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS announcement_recipients`);
  }
}
