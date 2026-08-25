import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { UserRole } from '../auth/user.entity';
import { ParentStudentLinksService } from '../parent-student-links/parent-student-links.service';
import { StudentsService } from '../students/students.service';
import { TenantConnectionService } from '../tenants/tenant-connection.service';
import { CoScholasticGrade } from './co-scholastic-grade.entity';
import { AddCoScholasticGradeDto } from './dto/add-co-scholastic-grade.dto';
import { CreateOrUpdateReportDto } from './dto/create-or-update-report.dto';
import { ProgressReport } from './progress-report.entity';

/**
 * Progress report enriched with student and assessment period info for
 * the GET endpoint.
 */
export interface ProgressReportDetail extends ProgressReport {
  studentFirstName: string;
  studentLastName: string;
  assessmentPeriodName: string;
  academicYear: string;
  preparedByStaffFirstName: string | null;
  preparedByStaffLastName: string | null;
}

@Injectable()
export class ProgressReportsService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly parentStudentLinksService: ParentStudentLinksService,
    private readonly studentsService: StudentsService,
  ) {}

  private async queryRunner(): Promise<QueryRunner> {
    return this.tenantConnectionService.getQueryRunner();
  }

  /**
   * Creates a new progress report, or updates an existing one if a report
   * already exists for the given student + assessment period pair.
   *
   * V1 simplification: we don't restrict to "class teacher" specifically,
   * since we don't have a class-teacher-assignment concept yet. Any
   * school_admin or staff role can create/update reports.
   */
  async createOrUpdate(
    dto: CreateOrUpdateReportDto,
  ): Promise<ProgressReport> {
    const qr = await this.queryRunner();

    // Validate student exists.
    const studentRows = (await qr.query(
      `SELECT id FROM students WHERE id = $1`,
      [dto.studentId],
    )) as Array<{ id: string }>;
    if (!studentRows[0]) {
      throw new NotFoundException(`Student with id ${dto.studentId} not found`);
    }

    // Validate assessment period exists.
    const periodRows = (await qr.query(
      `SELECT id FROM assessment_periods WHERE id = $1`,
      [dto.assessmentPeriodId],
    )) as Array<{ id: string }>;
    if (!periodRows[0]) {
      throw new NotFoundException(
        `Assessment period with id ${dto.assessmentPeriodId} not found`,
      );
    }

    // Validate preparedByStaffId if provided.
    if (dto.preparedByStaffId) {
      const staffRows = (await qr.query(
        `SELECT id FROM staff WHERE id = $1`,
        [dto.preparedByStaffId],
      )) as Array<{ id: string }>;
      if (!staffRows[0]) {
        throw new NotFoundException(
          `Staff member with id ${dto.preparedByStaffId} not found`,
        );
      }
    }

    // Upsert: one report per student per period.
    const rows = (await qr.query(
      `INSERT INTO progress_reports
         ("studentId", "assessmentPeriodId", "classTeacherRemarks",
          "attendancePercentage", "preparedByStaffId", status)
       VALUES ($1, $2, $3, $4, $5, 'draft')
       ON CONFLICT ("studentId", "assessmentPeriodId")
       DO UPDATE SET
         "classTeacherRemarks" = COALESCE(EXCLUDED."classTeacherRemarks", progress_reports."classTeacherRemarks"),
         "attendancePercentage" = COALESCE(EXCLUDED."attendancePercentage", progress_reports."attendancePercentage"),
         "preparedByStaffId" = COALESCE(EXCLUDED."preparedByStaffId", progress_reports."preparedByStaffId"),
         "updatedAt" = now()
       RETURNING *`,
      [
        dto.studentId,
        dto.assessmentPeriodId,
        dto.classTeacherRemarks ?? null,
        dto.attendancePercentage ?? null,
        dto.preparedByStaffId ?? null,
      ],
    )) as ProgressReport[];
    return rows[0];
  }

  /**
   * Publishes a report (sets status to 'published'). School_admin only.
   */
  async publishReport(id: string): Promise<ProgressReport> {
    const qr = await this.queryRunner();
    const existing = (await qr.query(
      `SELECT * FROM progress_reports WHERE id = $1`,
      [id],
    )) as ProgressReport[];
    if (!existing[0]) {
      throw new NotFoundException(`Progress report with id ${id} not found`);
    }
    if (existing[0].status === 'published') {
      return existing[0]; // idempotent
    }
    const rows = (await qr.query(
      `UPDATE progress_reports SET status = 'published', "updatedAt" = now()
       WHERE id = $1
       RETURNING *`,
      [id],
    )) as ProgressReport[];
    return rows[0];
  }

  /**
   * Retrieves a progress report with full details, respecting role-based
   * authorization:
   *
   * - school_admin / staff: unrestricted (can see drafts and published)
   * - parent: can only see published reports for linked children;
   *   draft reports return 404 (to avoid confirming existence)
   * - student: can only see published reports for their own account;
   *   draft reports return 404
   */
  async getReportForStudent(
    reportId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<ProgressReportDetail> {
    const qr = await this.queryRunner();

    const rows = (await qr.query(
      `SELECT pr.*,
              s."firstName" AS "studentFirstName",
              s."lastName" AS "studentLastName",
              ap.name AS "assessmentPeriodName",
              ap."academicYear" AS "academicYear",
              st."firstName" AS "preparedByStaffFirstName",
              st."lastName" AS "preparedByStaffLastName"
       FROM progress_reports pr
       JOIN students s ON s.id = pr."studentId"
       JOIN assessment_periods ap ON ap.id = pr."assessmentPeriodId"
       LEFT JOIN staff st ON st.id = pr."preparedByStaffId"
       WHERE pr.id = $1`,
      [reportId],
    )) as ProgressReportDetail[];

    if (!rows[0]) {
      throw new NotFoundException(`Progress report with id ${reportId} not found`);
    }

    const report = rows[0];

    // Role-based authorization and draft visibility rules.
    if (userRole === UserRole.Parent) {
      // Parents can only see published reports for linked children.
      // Drafts are hidden entirely (404) to avoid confirming existence.
      if (report.status !== 'published') {
        throw new NotFoundException(
          `Progress report with id ${reportId} not found`,
        );
      }
      const isLinked = await this.parentStudentLinksService.isParentOfStudent(
        userId,
        report.studentId,
      );
      if (!isLinked) {
        throw new ForbiddenException(
          'You do not have permission to view this progress report.',
        );
      }
    } else if (userRole === UserRole.Student) {
      // Students can only see published reports for their own account.
      // Drafts are hidden entirely (404).
      if (report.status !== 'published') {
        throw new NotFoundException(
          `Progress report with id ${reportId} not found`,
        );
      }
      const linkedStudentId =
        await this.studentsService.getLinkedStudentId(userId);
      if (linkedStudentId !== report.studentId) {
        throw new ForbiddenException(
          'You can only view your own progress reports.',
        );
      }
    }
    // school_admin and staff: unrestricted (see drafts and published)

    return report;
  }

  /**
   * Retrieves all progress reports for a given student, respecting the
   * same role-based authorization as getReportForStudent. Draft reports
   * are filtered out for parent/student roles.
   */
  async getReportsByStudent(
    studentId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<ProgressReportDetail[]> {
    const qr = await this.queryRunner();

    // Role-based authorization check first.
    if (userRole === UserRole.Parent) {
      const isLinked = await this.parentStudentLinksService.isParentOfStudent(
        userId,
        studentId,
      );
      if (!isLinked) {
        throw new ForbiddenException(
          'You do not have permission to view progress reports for this student.',
        );
      }
    } else if (userRole === UserRole.Student) {
      const linkedStudentId =
        await this.studentsService.getLinkedStudentId(userId);
      if (linkedStudentId !== studentId) {
        throw new ForbiddenException(
          'You can only view your own progress reports.',
        );
      }
    }

    // Build the query. For parent/student roles, filter out draft reports.
    const isRestricted =
      userRole === UserRole.Parent || userRole === UserRole.Student;
    const statusCondition = isRestricted ? `AND pr.status = 'published'` : '';

    const rows = (await qr.query(
      `SELECT pr.*,
              s."firstName" AS "studentFirstName",
              s."lastName" AS "studentLastName",
              ap.name AS "assessmentPeriodName",
              ap."academicYear" AS "academicYear",
              st."firstName" AS "preparedByStaffFirstName",
              st."lastName" AS "preparedByStaffLastName"
       FROM progress_reports pr
       JOIN students s ON s.id = pr."studentId"
       JOIN assessment_periods ap ON ap.id = pr."assessmentPeriodId"
       LEFT JOIN staff st ON st.id = pr."preparedByStaffId"
       WHERE pr."studentId" = $1 ${statusCondition}
       ORDER BY ap."startDate" DESC`,
      [studentId],
    )) as ProgressReportDetail[];

    return rows;
  }

  /**
   * Adds or updates a co-scholastic grade for a progress report.
   */
  async addCoScholasticGrade(
    reportId: string,
    dto: AddCoScholasticGradeDto,
  ): Promise<CoScholasticGrade> {
    const qr = await this.queryRunner();

    // Verify the report exists.
    const reportRows = (await qr.query(
      `SELECT id FROM progress_reports WHERE id = $1`,
      [reportId],
    )) as Array<{ id: string }>;
    if (!reportRows[0]) {
      throw new NotFoundException(`Progress report with id ${reportId} not found`);
    }

    const rows = (await qr.query(
      `INSERT INTO co_scholastic_grades ("progressReportId", area, grade)
       VALUES ($1, $2, $3)
       ON CONFLICT ("progressReportId", area)
       DO UPDATE SET grade = EXCLUDED.grade, "updatedAt" = now()
       RETURNING *`,
      [reportId, dto.area, dto.grade],
    )) as CoScholasticGrade[];
    return rows[0];
  }

  /**
   * Returns all co-scholastic grades for a progress report.
   */
  async getCoScholasticGrades(
    reportId: string,
  ): Promise<CoScholasticGrade[]> {
    const qr = await this.queryRunner();
    return (await qr.query(
      `SELECT * FROM co_scholastic_grades
       WHERE "progressReportId" = $1
       ORDER BY area ASC`,
      [reportId],
    )) as CoScholasticGrade[];
  }

  /**
   * Retrieves all assessment periods.
   */
  async getAssessmentPeriods() {
    const qr = await this.queryRunner();
    return (await qr.query(
      `SELECT * FROM assessment_periods ORDER BY "startDate" ASC`,
    ));
  }
}
