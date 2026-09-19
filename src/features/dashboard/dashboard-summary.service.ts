import { Injectable } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { TenantConnectionService } from '../tenants/tenant-connection.service';

/** Attendance rollup for today's date across every section. */
export interface AttendanceTodaySummary {
  present: number;
  absent: number;
  late: number;
  excused: number;
  /**
   * Sections that HAVE at least one active student but ZERO attendance
   * entries for today. Lets the UI show "12 of 15 sections marked" instead
   * of a misleading aggregate percentage when the day is not fully marked
   * yet. Sections with no active students are excluded — there is nothing
   * to mark in them, so they must not inflate the unmarked count.
   */
  notMarkedSections: number;
}

/** One entry in the recent-activity feed. */
export interface RecentActivityItem {
  /** Discriminator for rendering an icon/label per source table. */
  type: 'student_created' | 'staff_created' | 'report_published' | 'exam_published';
  /** Human-readable one-liner. */
  description: string;
  /** Ordering timestamp (creation for students/staff, publish for reports/exams). */
  timestamp: string;
}

/** Announcements preview on the dashboard. */
export interface UpcomingAnnouncementItem {
  id: string;
  title: string;
  priority: string;
  sentAt: string | null;
}

/** GET /dashboard/summary response (school_admin only). */
export interface DashboardSummaryResponse {
  totalStudents: number;
  totalStaff: number;
  activeClasses: number;
  attendanceToday: AttendanceTodaySummary;
  upcomingAnnouncements: UpcomingAnnouncementItem[];
  recentActivity: RecentActivityItem[];
  examsThisWeek: number;
  /** Server-side date (YYYY-MM-DD) used for the attendance/exam windows. */
  today: string;
}

/**
 * Row shape of the recent-activity UNION query.
 *
 * statusFilter doubles as the "published only" gate for reports/exams:
 * students/staff have no status column, so they pass a literal TRUE.
 */
interface ActivityRow {
  type: 'student_created' | 'staff_created' | 'report_published' | 'exam_published';
  description: string;
  timestamp: Date;
}

@Injectable()
export class DashboardSummaryService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  private async queryRunner(): Promise<QueryRunner> {
    return this.tenantConnectionService.getQueryRunner();
  }

  /**
   * Aggregates everything the school admin dashboard needs. All queries are
   * independent (each is a single aggregate/select over one table), so they
   * run concurrently via Promise.all. No per-row or per-section N+1 fan-out.
   */
  async getSummary(): Promise<DashboardSummaryResponse> {
    const qr = await this.queryRunner();

    const [
      totalStudents,
      totalStaff,
      activeClasses,
      attendanceToday,
      upcomingAnnouncements,
      recentActivity,
      examsThisWeek,
    ] = await Promise.all([
      this.countActiveStudents(qr),
      this.countActiveStaff(qr),
      this.countActiveClasses(qr),
      this.getAttendanceToday(qr),
      this.getUpcomingAnnouncements(qr),
      this.getRecentActivity(qr),
      this.countExamsThisWeek(qr),
    ]);

    const { today, ...attendance } = attendanceToday;
    return {
      totalStudents,
      totalStaff,
      activeClasses,
      attendanceToday: attendance,
      upcomingAnnouncements,
      recentActivity,
      examsThisWeek,
      today,
    };
  }

  /** Active students only (status = 'active'), matching the students module. */
  private async countActiveStudents(qr: QueryRunner): Promise<number> {
    const rows = (await qr.query(
      `SELECT COUNT(*)::int AS count FROM students WHERE status = 'active'`,
    )) as Array<{ count: number }>;
    return rows[0]?.count ?? 0;
  }

  /** Active staff only, matching the staff module's soft-delete (status). */
  private async countActiveStaff(qr: QueryRunner): Promise<number> {
    const rows = (await qr.query(
      `SELECT COUNT(*)::int AS count FROM staff WHERE status = 'active'`,
    )) as Array<{ count: number }>;
    return rows[0]?.count ?? 0;
  }

  /**
   * Classes that have at least one section (sections without students still
   * count — the class exists and is usable).
   */
  private async countActiveClasses(qr: QueryRunner): Promise<number> {
    const rows = (await qr.query(
      `SELECT COUNT(*)::int AS count
       FROM classes c
       WHERE EXISTS (SELECT 1 FROM sections s WHERE s."classId" = c.id)`,
    )) as Array<{ count: number }>;
    return rows[0]?.count ?? 0;
  }

  /**
   * Today's attendance across all sections in one GROUP BY, plus the count of
   * sections with no attendance rows at all for today.
   *
   * CURRENT_DATE (not client-supplied) so the whole deployment agrees on
   * "today" regardless of browser timezone.
   */
  private async getAttendanceToday(
    qr: QueryRunner,
  ): Promise<AttendanceTodaySummary & { today: string }> {
    // CURRENT_DATE::text rides along so the response can expose the exact
    // server-side date the rollup was computed for. With zero attendance
    // rows the aggregate still yields a single row of zeros — good.
    const statusPromise = qr.query(
      `SELECT
         CURRENT_DATE::text AS today,
         COUNT(*) FILTER (WHERE a.status = 'present')::int AS present,
         COUNT(*) FILTER (WHERE a.status = 'absent')::int  AS absent,
         COUNT(*) FILTER (WHERE a.status = 'late')::int    AS late,
         COUNT(*) FILTER (WHERE a.status = 'excused')::int AS excused
       FROM attendance a
       WHERE a.date = CURRENT_DATE`,
    ) as Promise<Array<{
      today: string;
      present: number;
      absent: number;
      late: number;
      excused: number;
    }>>;

    // Sections with at least one ACTIVE student but no attendance rows today
    // count as unmarked; empty sections are excluded — there is nothing to
    // mark in them, so they must not inflate the unmarked count.
    const notMarkedPromise = qr.query(
      `SELECT COUNT(*)::int AS count
       FROM sections s
       WHERE EXISTS (
         SELECT 1 FROM students st
         WHERE st."sectionId" = s.id AND st.status = 'active'
       )
         AND NOT EXISTS (
           SELECT 1 FROM attendance a
           WHERE a."sectionId" = s.id AND a.date = CURRENT_DATE
         )`,
    ) as Promise<Array<{ count: number }>>;

    // Same QueryRunner/connection as the rest of getSummary, so running
    // these two together adds no connection pressure — it just removes the
    // unnecessary sequential wait inside this branch.
    const [statusRows, notMarkedRows] = await Promise.all([
      statusPromise,
      notMarkedPromise,
    ]);

    return {
      present: statusRows[0]?.present ?? 0,
      absent: statusRows[0]?.absent ?? 0,
      late: statusRows[0]?.late ?? 0,
      excused: statusRows[0]?.excused ?? 0,
      notMarkedSections: notMarkedRows[0]?.count ?? 0,
      today: statusRows[0]?.today ?? new Date().toISOString().slice(0, 10),
    };
  }

  /** The 3 most recent sent announcements (visible to school_admin). */
  private async getUpcomingAnnouncements(
    qr: QueryRunner,
  ): Promise<UpcomingAnnouncementItem[]> {
    const rows = (await qr.query(
      `SELECT id, title, priority, "sentAt"
       FROM announcements
       WHERE status = 'sent'
       ORDER BY "sentAt" DESC NULLS LAST
       LIMIT 3`,
    )) as UpcomingAnnouncementItem[];
    return rows;
  }

  /**
   * The 5 most recent entries across student creations, staff creations, and
   * published progress reports/exams. One UNION ALL over the four tables with
   * a per-branch LIMIT pushed inside each subquery, so Postgres can use each
   * table's createdAt/updatedAt index and only 5×4 rows are sorted at the top.
   *
   * Timestamp choice per branch: creation time for students/staff (their only
   * meaningful timestamp), last-updated time for reports/exams (the publish
   * action stamps updatedAt).
   */
  private async getRecentActivity(
    qr: QueryRunner,
  ): Promise<RecentActivityItem[]> {
    const rows = (await qr.query(
      `(
         SELECT 'student_created'::text AS type,
                'New student enrolled: ' || s."firstName" || ' ' || s."lastName" AS description,
                s."createdAt" AS timestamp
         FROM students s
         ORDER BY s."createdAt" DESC
         LIMIT 5
       )
       UNION ALL
       (
         SELECT 'staff_created'::text,
                'New staff joined: ' || st."firstName" || ' ' || st."lastName",
                st."createdAt"
         FROM staff st
         ORDER BY st."createdAt" DESC
         LIMIT 5
       )
       UNION ALL
       (
         SELECT 'report_published'::text,
                'Progress report published: ' || s."firstName" || ' ' || s."lastName",
                pr."updatedAt"
         FROM progress_reports pr
         JOIN students s ON s.id = pr."studentId"
         WHERE pr.status = 'published'
         ORDER BY pr."updatedAt" DESC
         LIMIT 5
       )
       UNION ALL
       (
         SELECT 'exam_published'::text,
                'Exam published: ' || e.name,
                e."updatedAt"
         FROM exams e
         WHERE e.status = 'published'
         ORDER BY e."updatedAt" DESC
         LIMIT 5
       )
       ORDER BY timestamp DESC
       LIMIT 5`,
    )) as ActivityRow[];

    return rows.map((row) => ({
      type: row.type,
      description: row.description,
      timestamp: new Date(row.timestamp).toISOString(),
    }));
  }

  /**
   * Exams (any status) whose examDate falls in the current Mon–Sun window
   * containing today, computed server-side in the DB timezone.
   */
  private async countExamsThisWeek(qr: QueryRunner): Promise<number> {
    const rows = (await qr.query(
      `SELECT COUNT(*)::int AS count
       FROM exams
       WHERE "examDate" >= (DATE_TRUNC('week', CURRENT_DATE))::date
         AND "examDate" <  (DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days')::date`,
    )) as Array<{ count: number }>;
    return rows[0]?.count ?? 0;
  }
}
