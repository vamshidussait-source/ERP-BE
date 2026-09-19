import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionService } from '../tenants/tenant-connection.service';
import { AnnouncementRead } from './announcement-read.entity';
import {
  Announcement,
  AnnouncementAudienceType,
  AnnouncementPriority,
  AnnouncementStatus,
} from './announcement.entity';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

/** Announcement from the admin list view, enriched with read stats. */
export interface AnnouncementWithStats extends Announcement {
  recipientCount: number;
  readCount: number;
}

/** Announcement from a user's personal feed, enriched with the author name. */
export interface FeedItem extends Announcement {
  isRead: boolean;
  /** firstName + ' ' + lastName of the authoring staff member, or null when
   *  the announcement has no createdByStaffId (e.g. system-generated). */
  createdByStaffName: string | null;
}

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  private async queryRunner(): Promise<QueryRunner> {
    return this.tenantConnectionService.getQueryRunner();
  }

  /**
   * Creates an announcement. By default it is a draft; pass status 'sent' to
   * create-and-publish in one step. Passing scheduledFor with status 'draft'
   * marks it scheduled. School_admin only.
   */
  async create(dto: CreateAnnouncementDto): Promise<Announcement> {
    const qr = await this.queryRunner();

    const status =
      dto.status === 'sent' ? AnnouncementStatus.Sent : AnnouncementStatus.Draft;
    const scheduledFor = dto.scheduledFor ? new Date(dto.scheduledFor) : null;
    if (scheduledFor && Number.isNaN(scheduledFor.getTime())) {
      throw new BadRequestException('scheduledFor is not a valid date');
    }

    // Validate audience section ids when targeting specific sections.
    const sectionIds =
      dto.audienceType === AnnouncementAudienceType.SpecificSections
        ? (dto.audienceSectionIds ?? [])
        : null;
    if (
      dto.audienceType === AnnouncementAudienceType.SpecificSections &&
      sectionIds!.length === 0
    ) {
      throw new BadRequestException(
        'audienceSectionIds must contain at least one section id when audienceType is specific_sections',
      );
    }
    if (sectionIds && sectionIds.length > 0) {
      const rows = (await qr.query(
        `SELECT id FROM sections WHERE id = ANY($1::uuid[])`,
        [sectionIds],
      )) as Array<{ id: string }>;
      if (rows.length !== sectionIds.length) {
        const found = new Set(rows.map((r) => r.id));
        const missing = sectionIds.filter((id) => !found.has(id));
        throw new NotFoundException(
          `Section(s) not found: ${missing.join(', ')}`,
        );
      }
    }

    // Validate the authoring staff id when provided.
    if (dto.createdByStaffId) {
      const staffRows = (await qr.query(
        `SELECT id FROM staff WHERE id = $1`,
        [dto.createdByStaffId],
      )) as Array<{ id: string }>;
      if (!staffRows[0]) {
        throw new NotFoundException(
          `Staff member with id ${dto.createdByStaffId} not found`,
        );
      }
    }

    const isScheduled =
      status === AnnouncementStatus.Draft &&
      scheduledFor !== null &&
      !Number.isNaN(scheduledFor.getTime());

    const rows = (await qr.query(
      `INSERT INTO announcements
         (title, message, "audienceType", "audienceSectionIds", priority,
          status, "scheduledFor", "sentAt", "createdByStaffId")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        dto.title,
        dto.message,
        dto.audienceType,
        sectionIds,
        dto.priority ?? AnnouncementPriority.Normal,
        isScheduled ? AnnouncementStatus.Scheduled : status,
        scheduledFor,
        status === AnnouncementStatus.Sent ? new Date() : null,
        dto.createdByStaffId ?? null,
      ],
    )) as Announcement[];

    const announcement = rows[0];

    if (status === AnnouncementStatus.Sent) {
      // Freeze the audience at send time so read stats do not drift later.
      await this.storeRecipientUserIds(announcement);
    }

    return announcement;
  }

  /**
   * Updates a draft/scheduled announcement. Already-sent announcements are
   * immutable — a sent announcement's audience was resolved at publish time,
   * so editing it after the fact would misrepresent what recipients saw.
   *
   * Enforces the same audienceSectionIds rules as create(): switching to
   * specific_sections requires a non-empty section list, and switching away
   * from specific_sections clears any stale section ids.
   */
  async update(id: string, dto: UpdateAnnouncementDto): Promise<Announcement> {
    const qr = await this.queryRunner();

    const existing = await this.getById(id);
    if (existing.status === AnnouncementStatus.Sent) {
      throw new ForbiddenException(
        'Sent announcements cannot be edited. Delete is also disabled for sent announcements.',
      );
    }

    const scheduledFor =
      dto.scheduledFor === undefined
        ? undefined
        : dto.scheduledFor === null
          ? null
          : new Date(dto.scheduledFor);
    if (scheduledFor && Number.isNaN(scheduledFor.getTime())) {
      throw new BadRequestException('scheduledFor is not a valid date');
    }

    // Resolve the FINAL audience type/sections after applying this patch, so
    // validation uses the post-update state rather than just the payload.
    const finalAudienceType = dto.audienceType ?? existing.audienceType;
    let effectiveSectionIds: string[] | null;
    if (finalAudienceType === AnnouncementAudienceType.SpecificSections) {
      const candidate =
        dto.audienceSectionIds !== undefined
          ? dto.audienceSectionIds
          : existing.audienceSectionIds;
      if (!candidate || candidate.length === 0) {
        throw new BadRequestException(
          'audienceSectionIds must contain at least one section id when audienceType is specific_sections',
        );
      }
      effectiveSectionIds = candidate;

      const rows = (await qr.query(
        `SELECT id FROM sections WHERE id = ANY($1::uuid[])`,
        [effectiveSectionIds],
      )) as Array<{ id: string }>;
      if (rows.length !== effectiveSectionIds.length) {
        const found = new Set(rows.map((r) => r.id));
        const missing = effectiveSectionIds.filter((sid) => !found.has(sid));
        throw new NotFoundException(
          `Section(s) not found: ${missing.join(', ')}`,
        );
      }
    } else {
      // Moving away from specific_sections — clear stale section ids.
      effectiveSectionIds = null;
    }

    const assignments: ReadonlyArray<readonly [string, unknown]> = [
      ['title', dto.title],
      ['message', dto.message],
      ['audienceType', dto.audienceType],
      ['audienceSectionIds', effectiveSectionIds],
      ['priority', dto.priority],
      ['scheduledFor', scheduledFor],
    ];

    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [column, value] of assignments) {
      if (value !== undefined) {
        setClauses.push(`"${column}" = $${setClauses.length + 1}`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) {
      return existing;
    }

    setClauses.push('"updatedAt" = now()');

    // NOTE: multi-line SQL strings pass through pg as multi-statement
    // simple-query protocol messages, so UPDATE ... RETURNING resolves to
    // [rows, affectedCount] rather than just rows — unwrap it.
    const result = (await qr.query(
      `UPDATE announcements SET ${setClauses.join(', ')}
       WHERE id = $${values.length + 1}
       RETURNING *`,
      [...values, id],
    )) as unknown;
    const updated = (
      Array.isArray((result as unknown[])[0])
        ? (result as [Announcement[], number])[0]
        : (result as Announcement[])
    ) as Announcement[];
    return updated[0];
  }

  /**
   * Deletes a draft/scheduled announcement. Already-sent announcements cannot
   * be deleted — they are part of the audit trail of what was communicated.
   */
  async delete(id: string): Promise<void> {
    const qr = await this.queryRunner();

    const existing = await this.getById(id);
    if (existing.status === AnnouncementStatus.Sent) {
      throw new ForbiddenException(
        'Sent announcements cannot be deleted.',
      );
    }

    // The Postgres driver resolves DELETE to [raw.rows, raw.rowCount] —
    // the affected count is the second element (see update() note above).
    const result = (await qr.query(
      `DELETE FROM announcements
       WHERE id = $1`,
      [id],
    )) as unknown;
    const affected = Array.isArray(result)
      ? Number((result as [unknown[], number])[1] ?? 0)
      : 0;
    if (affected === 0) {
      throw new NotFoundException(`Announcement with id ${id} not found`);
    }
  }

  /**
   * Publishes (sends) an announcement: sets status='sent' and sentAt=now().
   * Idempotent — publishing an already-sent announcement returns it unchanged.
   * The audience is resolved into recipient user IDs at send time and STORED
   * in announcement_recipients so read stats have a stable denominator.
   */
  async publish(id: string): Promise<Announcement> {
    const qr = await this.queryRunner();

    const existing = await this.getById(id);
    if (existing.status === AnnouncementStatus.Sent) {
      return existing; // idempotent
    }

    // NOTE: see update() — multi-statement UPDATE ... RETURNING resolves to
    // [rows, affectedCount] through the pg simple-query protocol.
    const result = (await qr.query(
      `UPDATE announcements
       SET status = 'sent', "sentAt" = now(), "updatedAt" = now()
       WHERE id = $1
       RETURNING *`,
      [id],
    )) as unknown;
    const rows = (
      Array.isArray((result as unknown[])[0])
        ? (result as [Announcement[], number])[0]
        : (result as Announcement[])
    ) as Announcement[];

    await this.storeRecipientUserIds(rows[0]);
    return rows[0];
  }

  /**
   * Resolves an announcement's audience into recipient user IDs and persists
   * them ONCE into announcement_recipients. Called exactly once per send
   * (create-with-status-sent, or publish). Returns the resolved ids.
   */
  private async storeRecipientUserIds(
    announcement: Announcement,
  ): Promise<string[]> {
    const qr = await this.queryRunner();
    const recipientIds = await this.resolveRecipientUserIds(announcement);
    if (recipientIds.length === 0) {
      return [];
    }
    await qr.query(
      `INSERT INTO announcement_recipients ("announcementId", "userId")
       SELECT $1, unnest($2::uuid[])
       ON CONFLICT ("announcementId", "userId") DO NOTHING`,
      [announcement.id, recipientIds],
    );
    return recipientIds;
  }

  /**
   * Resolves an announcement's audience into the actual recipient user IDs
   * based on audienceType:
   *  - all_staff            → every active staff-role OR school_admin user
   *                           (school_admin is treated as staff here so this
   *                           agrees with the feed, which shows all sent
   *                           announcements to school_admin/staff)
   *  - all_parents          → every active parent-role user
   *  - all_students         → every active student-role user
   *  - specific_sections    → students/parents associated with those sections
   *                           (students via students.sectionId; parents via
   *                           their linked children's sections)
   */
  async resolveRecipientUserIds(announcement: Announcement): Promise<string[]> {
    const qr = await this.queryRunner();

    let rows: Array<{ id: string }> = [];

    switch (announcement.audienceType) {
      case AnnouncementAudienceType.AllStaff:
        rows = (await qr.query(
          `SELECT id FROM users
           WHERE role IN ('staff', 'school_admin') AND "isActive" = true`,
        )) as Array<{ id: string }>;
        break;

      case AnnouncementAudienceType.AllParents:
        rows = (await qr.query(
          `SELECT id FROM users
           WHERE role = 'parent' AND "isActive" = true`,
        )) as Array<{ id: string }>;
        break;

      case AnnouncementAudienceType.AllStudents:
        rows = (await qr.query(
          `SELECT id FROM users
           WHERE role = 'student' AND "isActive" = true`,
        )) as Array<{ id: string }>;
        break;

      case AnnouncementAudienceType.SpecificSections: {
        const sectionIds = announcement.audienceSectionIds ?? [];
        if (sectionIds.length === 0) {
          rows = [];
          break;
        }
        // Students: users linked to a student in a targeted section.
        // Parents: users linked (via parent_student_links) to a student in a
        // targeted section. This mirrors the section-scoping rules used by
        // the feed query below.
        rows = (await qr.query(
          `SELECT DISTINCT u.id FROM users u
           WHERE u."isActive" = true AND (
             (
               u.role = 'student' AND u."linkedStudentId" IN (
                 SELECT s.id FROM students s
                 WHERE s."sectionId" = ANY($1::uuid[])
               )
             )
             OR
             (
               u.role = 'parent' AND u.id IN (
                 SELECT psl."parentUserId" FROM parent_student_links psl
                 JOIN students s ON s.id = psl."studentId"
                 WHERE s."sectionId" = ANY($1::uuid[])
               )
             )
           )`,
          [sectionIds],
        )) as Array<{ id: string }>;
        break;
      }
    }

    return rows.map((r) => r.id);
  }

  /**
   * Whether a user was targeted by an announcement at send time. Reads the
   * frozen announcement_recipients list — never re-resolves live.
   */
  private async isRecipient(
    announcementId: string,
    userId: string,
  ): Promise<boolean> {
    const qr = await this.queryRunner();
    const rows = (await qr.query(
      `SELECT 1 AS ok FROM announcement_recipients
       WHERE "announcementId" = $1 AND "userId" = $2
       LIMIT 1`,
      [announcementId, userId],
    )) as Array<{ ok: number }>;
    return rows.length > 0;
  }

  /**
   * Marks an announcement as read by a user. Idempotent: re-marking does not
   * create duplicates (unique constraint) and does not move readAt.
   *
   * The announcement must exist and be sent (drafts cannot be "read"), and the
   * caller must be an actual recipient captured at send time — otherwise 403.
   * This mirrors how other "not your resource" cases (e.g. progress reports)
   * are handled: a real resource that isn't yours is a 403, while a
   * non-existent / not-yet-sent one is a 404.
   */
  async markAsRead(
    announcementId: string,
    userId: string,
  ): Promise<AnnouncementRead> {
    const qr = await this.queryRunner();

    const announcement = await this.getById(announcementId);
    if (announcement.status !== AnnouncementStatus.Sent) {
      throw new NotFoundException(
        `Announcement with id ${announcementId} not found`,
      );
    }

    if (!(await this.isRecipient(announcementId, userId))) {
      throw new ForbiddenException(
        'You are not a recipient of this announcement.',
      );
    }

    const rows = (await qr.query(
      `INSERT INTO announcement_reads ("announcementId", "userId", "readAt")
       VALUES ($1, $2, now())
       ON CONFLICT ("announcementId", "userId")
       DO UPDATE SET "readAt" = announcement_reads."readAt"
       RETURNING *`,
      [announcementId, userId],
    )) as AnnouncementRead[];
    return rows[0];
  }

  /**
   * Marks every sent announcement currently visible in the user's feed AND
   * targeted at them (i.e. present in announcement_recipients) as read.
   * Returns the number of newly-marked rows.
   */
  async markAllRead(userId: string): Promise<number> {
    const qr = await this.queryRunner();

    const feed = await this.getMyFeed(userId);
    if (feed.length === 0) {
      return 0;
    }

    const unread = feed.filter((item) => !item.isRead);
    if (unread.length === 0) {
      return 0;
    }

    const ids = unread.map((item) => item.id);
    // Only mark announcements this user was actually targeted by — a feed item
    // they can see but were not a recipient of (e.g. a parent added after an
    // all_parents announcement was sent) must not get a read receipt.
    const rows = (await qr.query(
      `INSERT INTO announcement_reads ("announcementId", "userId", "readAt")
       SELECT a.id, $1, now()
       FROM announcements a
       JOIN announcement_recipients r
         ON r."announcementId" = a.id AND r."userId" = $1
       WHERE a.id = ANY($2::uuid[]) AND a.status = 'sent'
       ON CONFLICT ("announcementId", "userId") DO NOTHING
       RETURNING id`,
      [userId, ids],
    )) as Array<{ id: string }>;
    return rows.length;
  }  /**
   * Returns the announcements this user was actually targeted by (i.e. present
   * in announcement_recipients), newest first, with an isRead flag per item.
   *
   * Draft-gating (mirrors ProgressReportsService): the status check is applied
   * at the SQL level before anything else, so a draft/scheduled announcement
   * can never appear in a non-admin feed.
   *
   * The feed is driven by the STORED recipient list frozen at send time, so it
   * is exactly the set markAsRead will accept. Previously staff/school_admin
   * saw every sent announcement but could not mark a read for ones they were
   * not a recipient of (e.g. an all_parents announcement), leaving a
   * permanently-stuck unread badge. Driving the feed from the recipient list
   * makes feed visibility and read-tracking fully consistent, and means a user
   * added to a role/section AFTER an announcement was sent does not see it —
   * they were never a target.
   *
   * Only active users receive announcements; an inactive caller gets an empty
   * feed, matching the isActive filter used during recipient resolution.
   */
  async getMyFeed(userId: string): Promise<FeedItem[]> {
    const qr = await this.queryRunner();

    // Only active users receive announcements.
    const userRows = (await qr.query(
      `SELECT "isActive" FROM users WHERE id = $1`,
      [userId],
    )) as Array<{ isActive: boolean }>;
    if (!userRows[0] || userRows[0].isActive !== true) {
      return [];
    }

    // LEFT JOIN staff on createdByStaffId so each feed item carries the
    // author's display name; a null createdByStaffId (or a staff row that was
    // hard-deleted) resolves to null rather than dropping the announcement.
    const rows = (await qr.query(
      `SELECT a.*,
              (ar.id IS NOT NULL) AS "isRead",
              CASE WHEN s.id IS NOT NULL
                   THEN s."firstName" || ' ' || s."lastName"
                   ELSE NULL END AS "createdByStaffName"
       FROM announcements a
       JOIN announcement_recipients r
         ON r."announcementId" = a.id AND r."userId" = $1
       LEFT JOIN announcement_reads ar
         ON ar."announcementId" = a.id AND ar."userId" = $1
       LEFT JOIN staff s
         ON s.id = a."createdByStaffId"
       WHERE a.status = 'sent'
       ORDER BY a."sentAt" DESC NULLS LAST, a."createdAt" DESC`,
      [userId],
    )) as Array<FeedItem & { isRead: boolean }>;

    return rows.map((row) => ({
      ...row,
      isRead: Boolean(row.isRead),
      createdByStaffName: row.createdByStaffName ?? null,
    }));
  }

  /**
   * Unread count for the current user's feed. Intentionally derived from
   * getMyFeed's EXACT recipient join / status filter (not a parallel query)
   * so the unread badge can never disagree with what GET /announcements/me
   * would return — the two always see the same row set.
   */
  async countUnreadForUser(userId: string): Promise<number> {
    const feed = await this.getMyFeed(userId);
    return feed.filter((item) => !item.isRead).length;
  }

  /**
   * Read statistics for one announcement (count of recipients vs. count read),
   * for the school admin's list view. Counts against the frozen
   * announcement_recipients list captured at send time, so numbers do not
   * drift as users are added/removed or deactivated later.
   */
  async getReadStats(announcementId: string): Promise<{
    recipientCount: number;
    readCount: number;
  }> {
    const qr = await this.queryRunner();

    await this.getById(announcementId);

    const recipientRows = (await qr.query(
      `SELECT COUNT(*)::int AS count FROM announcement_recipients
       WHERE "announcementId" = $1`,
      [announcementId],
    )) as Array<{ count: number }>;

    const readRows = (await qr.query(
      `SELECT COUNT(*)::int AS count FROM announcement_reads ar
       WHERE ar."announcementId" = $1
         AND EXISTS (
           SELECT 1 FROM announcement_recipients r
           WHERE r."announcementId" = $1 AND r."userId" = ar."userId"
         )`,
      [announcementId],
    )) as Array<{ count: number }>;

    return {
      recipientCount: recipientRows[0]?.count ?? 0,
      readCount: readRows[0]?.count ?? 0,
    };
  }

  /**
   * Admin list view: all/sent/scheduled/drafts, newest first, each item
   * enriched with read stats computed from announcement_recipients (frozen at
   * send time). School_admin only.
   */
  async listForAdmin(
    statusFilter: 'all' | 'sent' | 'scheduled' | 'drafts' = 'all',
    page = 1,
    limit = 10,
  ): Promise<{
    data: AnnouncementWithStats[];
    total: number;
    page: number;
    limit: number;
  }> {
    const qr = await this.queryRunner();

    const statusCondition =
      statusFilter === 'all'
        ? ''
        : `WHERE a.status = '${statusFilter === 'drafts' ? 'draft' : statusFilter}'`;

    const offset = (page - 1) * limit;

    const countRows = (await qr.query(
      `SELECT COUNT(*)::int AS total FROM announcements a ${statusCondition}`,
    )) as Array<{ total: number }>;

    const data = (await qr.query(
      `SELECT a.*,
              (SELECT COUNT(*)::int FROM announcement_recipients r
               WHERE r."announcementId" = a.id) AS "recipientCount",
              (SELECT COUNT(*)::int FROM announcement_reads ar
               WHERE ar."announcementId" = a.id
                 AND EXISTS (
                   SELECT 1 FROM announcement_recipients r
                   WHERE r."announcementId" = a.id AND r."userId" = ar."userId"
                 )) AS "readCount"
       FROM announcements a
       ${statusCondition}
       ORDER BY a."createdAt" DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    )) as Array<Announcement & { readCount: number; recipientCount: number }>;

    const withStats: AnnouncementWithStats[] = data.map((row) => ({
      ...row,
      recipientCount: Number(row.recipientCount ?? 0),
      readCount: Number(row.readCount ?? 0),
    }));

    return { data: withStats, total: countRows[0]?.total ?? 0, page, limit };
  }

  /** Loads an announcement by id or throws 404. */
  private async getById(id: string): Promise<Announcement> {
    const qr = await this.queryRunner();
    const rows = (await qr.query(
      `SELECT * FROM announcements WHERE id = $1`,
      [id],
    )) as Announcement[];
    if (!rows[0]) {
      throw new NotFoundException(`Announcement with id ${id} not found`);
    }
    return rows[0];
  }
}
