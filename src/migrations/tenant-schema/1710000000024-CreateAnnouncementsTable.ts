import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnnouncementsTable1710000000024
  implements MigrationInterface
{
  name = 'CreateAnnouncementsTable1710000000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title varchar(255) NOT NULL,
        message text NOT NULL,
        "audienceType" varchar(30) NOT NULL,
        "audienceSectionIds" uuid[],
        priority varchar(20) NOT NULL DEFAULT 'normal',
        status varchar(20) NOT NULL DEFAULT 'draft',
        "scheduledFor" timestamp with time zone,
        "sentAt" timestamp with time zone,
        "createdByStaffId" uuid,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "FK_announcements_createdByStaffId"
          FOREIGN KEY ("createdByStaffId") REFERENCES staff (id)
          ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS announcements`);
  }
}
