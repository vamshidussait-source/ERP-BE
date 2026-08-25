import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { UserRole } from '../auth/user.entity';
import { ParentStudentLinksService } from '../parent-student-links/parent-student-links.service';
import { StudentsService } from '../students/students.service';
import { TenantConnectionService } from '../tenants/tenant-connection.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { EnterMarksDto } from './dto/enter-marks.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { Exam } from './exam.entity';
import { ExamMark } from './exam-mark.entity';
import { ExamSubjectConfig } from './exam-subject-config.entity';
import { GradingScalesService } from './grading-scales.service';

export interface ExamDetail extends Exam {
  assessmentPeriodName: string | null;
  gradingScaleName: string | null;
}

export interface ExamMarkDetail extends ExamMark {
  subjectName: string;
  maxMarks: number;
  percentage: number | null;
  grade: string | null;
}

export interface StudentMarksSummary {
  examId: string;
  examName: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  subjects: ExamMarkDetail[];
  totalMarksObtained: number;
  totalMaxMarks: number;
  overallPercentage: number | null;
  overallGrade: string | null;
  gradedSubjectsCount: number;
  totalSubjectsCount: number;
}

@Injectable()
export class ExamsService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly parentStudentLinksService: ParentStudentLinksService,
    private readonly studentsService: StudentsService,
    private readonly gradingScalesService: GradingScalesService,
  ) {}

  private async queryRunner(): Promise<QueryRunner> {
    return this.tenantConnectionService.getQueryRunner();
  }

  /**
   * Creates a new exam with its subject configs in one call.
   * school_admin only.
   */
  async createExam(dto: CreateExamDto): Promise<Exam> {
    const qr = await this.queryRunner();

    // Validate assessment period if provided.
    if (dto.assessmentPeriodId) {
      const periodRows = (await qr.query(
        `SELECT id FROM assessment_periods WHERE id = $1`,
        [dto.assessmentPeriodId],
      )) as Array<{ id: string }>;
      if (!periodRows[0]) {
        throw new NotFoundException(
          `Assessment period with id ${dto.assessmentPeriodId} not found`,
        );
      }
    }

    // Validate grading scale if provided.
    if (dto.gradingScaleId) {
      const scaleRows = (await qr.query(
        `SELECT id FROM grading_scales WHERE id = $1`,
        [dto.gradingScaleId],
      )) as Array<{ id: string }>;
      if (!scaleRows[0]) {
        throw new NotFoundException(
          `Grading scale with id ${dto.gradingScaleId} not found`,
        );
      }
    }

    // Validate all subjects exist.
    for (const subjectConfig of dto.subjects) {
      const subjectRows = (await qr.query(
        `SELECT id FROM subjects WHERE id = $1`,
        [subjectConfig.subjectId],
      )) as Array<{ id: string }>;
      if (!subjectRows[0]) {
        throw new NotFoundException(
          `Subject with id ${subjectConfig.subjectId} not found`,
        );
      }
    }

    // Create the exam.
    const examRows = (await qr.query(
      `INSERT INTO exams (name, "assessmentPeriodId", "examDate", "gradingScaleId", status)
       VALUES ($1, $2, $3, $4, 'draft')
       RETURNING *`,
      [
        dto.name,
        dto.assessmentPeriodId ?? null,
        dto.examDate,
        dto.gradingScaleId ?? null,
      ],
    )) as Exam[];
    const exam = examRows[0];

    // Create subject configs.
    for (const subjectConfig of dto.subjects) {
      await qr.query(
        `INSERT INTO exam_subject_configs ("examId", "subjectId", "maxMarks")
         VALUES ($1, $2, $3)`,
        [exam.id, subjectConfig.subjectId, subjectConfig.maxMarks],
      );
    }

    return exam;
  }

  /**
   * Updates an exam and optionally replaces its subject configs.
   * school_admin only.
   */
  async updateExam(id: string, dto: UpdateExamDto): Promise<Exam> {
    const qr = await this.queryRunner();
    const existing = (await qr.query(
      `SELECT * FROM exams WHERE id = $1`,
      [id],
    )) as Exam[];
    if (!existing[0]) {
      throw new NotFoundException(`Exam with id ${id} not found`);
    }

    // Validate assessment period if provided.
    if (dto.assessmentPeriodId) {
      const periodRows = (await qr.query(
        `SELECT id FROM assessment_periods WHERE id = $1`,
        [dto.assessmentPeriodId],
      )) as Array<{ id: string }>;
      if (!periodRows[0]) {
        throw new NotFoundException(
          `Assessment period with id ${dto.assessmentPeriodId} not found`,
        );
      }
    }

    // Validate grading scale if provided.
    if (dto.gradingScaleId) {
      const scaleRows = (await qr.query(
        `SELECT id FROM grading_scales WHERE id = $1`,
        [dto.gradingScaleId],
      )) as Array<{ id: string }>;
      if (!scaleRows[0]) {
        throw new NotFoundException(
          `Grading scale with id ${dto.gradingScaleId} not found`,
        );
      }
    }

    // Build dynamic SET.
    const assignments: ReadonlyArray<readonly [string, unknown]> = [
      ['name', dto.name],
      ['assessmentPeriodId', dto.assessmentPeriodId],
      ['examDate', dto.examDate],
      ['gradingScaleId', dto.gradingScaleId],
    ];

    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [column, value] of assignments) {
      if (value !== undefined) {
        setClauses.push(`"${column}" = $${setClauses.length + 1}`);
        values.push(value);
      }
    }

    if (setClauses.length > 0) {
      setClauses.push('"updatedAt" = now()');
      await qr.query(
        `UPDATE exams SET ${setClauses.join(', ')} WHERE id = $${setClauses.length}`,
        [...values, id],
      );
    }

    // Replace subject configs if provided.
    if (dto.subjects) {
      // Validate all subjects exist.
      for (const subjectConfig of dto.subjects) {
        const subjectRows = (await qr.query(
          `SELECT id FROM subjects WHERE id = $1`,
          [subjectConfig.subjectId],
        )) as Array<{ id: string }>;
        if (!subjectRows[0]) {
          throw new NotFoundException(
            `Subject with id ${subjectConfig.subjectId} not found`,
          );
        }
      }

      // Delete existing configs and marks.
      await qr.query(
        `DELETE FROM exam_marks WHERE "examId" = $1`,
        [id],
      );
      await qr.query(
        `DELETE FROM exam_subject_configs WHERE "examId" = $1`,
        [id],
      );

      // Insert new configs.
      for (const subjectConfig of dto.subjects) {
        await qr.query(
          `INSERT INTO exam_subject_configs ("examId", "subjectId", "maxMarks")
           VALUES ($1, $2, $3)`,
          [id, subjectConfig.subjectId, subjectConfig.maxMarks],
        );
      }
    }

    const result = (await qr.query(
      `SELECT * FROM exams WHERE id = $1`,
      [id],
    )) as Exam[];
    return result[0];
  }

  /**
   * Publishes an exam (sets status to 'published'). school_admin only.
   */
  async publishExam(id: string): Promise<Exam> {
    const qr = await this.queryRunner();
    const existing = (await qr.query(
      `SELECT * FROM exams WHERE id = $1`,
      [id],
    )) as Exam[];
    if (!existing[0]) {
      throw new NotFoundException(`Exam with id ${id} not found`);
    }
    if (existing[0].status === 'published') {
      return existing[0]; // idempotent
    }
    const [rows] = (await qr.query(
      `UPDATE exams SET status = 'published', "updatedAt" = now()
       WHERE id = $1
       RETURNING *`,
      [id],
    )) as [Exam[], number];
    return rows[0];
  }

  /**
   * Lists all exams. For parent/student roles, only published exams are
   * returned (filtered at the SQL level). For admin/staff, all exams are
   * returned including drafts.
   */
  async findAll(
    userId: string,
    userRole: UserRole,
  ): Promise<ExamDetail[]> {
    const qr = await this.queryRunner();

    const isRestricted =
      userRole === UserRole.Parent || userRole === UserRole.Student;
    const statusCondition = isRestricted
      ? `AND e.status = 'published'`
      : '';

    return (await qr.query(
      `SELECT e.*,
              ap.name AS "assessmentPeriodName",
              gs.name AS "gradingScaleName"
       FROM exams e
       LEFT JOIN assessment_periods ap ON ap.id = e."assessmentPeriodId"
       LEFT JOIN grading_scales gs ON gs.id = e."gradingScaleId"
       WHERE 1=1 ${statusCondition}
       ORDER BY e."examDate" DESC`,
    )) as ExamDetail[];
  }

  /**
   * Gets a single exam by id. For parent/student roles, draft exams are
   * completely hidden (404) — mirroring the Progress Reports pattern.
   */
  async findOne(
    id: string,
    userId: string,
    userRole: UserRole,
  ): Promise<ExamDetail> {
    const qr = await this.queryRunner();
    const rows = (await qr.query(
      `SELECT e.*,
              ap.name AS "assessmentPeriodName",
              gs.name AS "gradingScaleName"
       FROM exams e
       LEFT JOIN assessment_periods ap ON ap.id = e."assessmentPeriodId"
       LEFT JOIN grading_scales gs ON gs.id = e."gradingScaleId"
       WHERE e.id = $1`,
      [id],
    )) as ExamDetail[];

    if (!rows[0]) {
      throw new NotFoundException(`Exam with id ${id} not found`);
    }

    const exam = rows[0];

    // Draft gating for parent/student roles: return 404 for drafts.
    if (
      (userRole === UserRole.Parent || userRole === UserRole.Student) &&
      exam.status !== 'published'
    ) {
      throw new NotFoundException(`Exam with id ${id} not found`);
    }

    return exam;
  }

  /**
   * Gets the subject configs for an exam.
   */
  async getSubjectConfigs(
    examId: string,
  ): Promise<(ExamSubjectConfig & { subjectName: string })[]> {
    const qr = await this.queryRunner();
    return (await qr.query(
      `SELECT esc.*, s.name AS "subjectName"
       FROM exam_subject_configs esc
       JOIN subjects s ON s.id = esc."subjectId"
       WHERE esc."examId" = $1
       ORDER BY s.name ASC`,
      [examId],
    )) as (ExamSubjectConfig & { subjectName: string })[];
  }

  /**
   * Enters or updates marks for a student in a specific subject within an
   * exam. school_admin or staff. The exam MUST be in draft status (cannot
   * modify marks for a published exam).
   */
  async enterMarks(
    examId: string,
    dto: EnterMarksDto,
  ): Promise<ExamMark> {
    const qr = await this.queryRunner();

    // Verify exam exists and is in draft status.
    const examRows = (await qr.query(
      `SELECT * FROM exams WHERE id = $1`,
      [examId],
    )) as Exam[];
    if (!examRows[0]) {
      throw new NotFoundException(`Exam with id ${examId} not found`);
    }
    if (examRows[0].status === 'published') {
      throw new BadRequestException(
        'Cannot modify marks for a published exam.',
      );
    }

    // Verify subject config exists for this exam.
    const configRows = (await qr.query(
      `SELECT * FROM exam_subject_configs WHERE "examId" = $1 AND "subjectId" = $2`,
      [examId, dto.subjectId],
    )) as ExamSubjectConfig[];
    if (!configRows[0]) {
      throw new NotFoundException(
        `Subject config not found for exam ${examId} and subject ${dto.subjectId}`,
      );
    }

    // Verify student exists.
    const studentRows = (await qr.query(
      `SELECT id FROM students WHERE id = $1`,
      [dto.studentId],
    )) as Array<{ id: string }>;
    if (!studentRows[0]) {
      throw new NotFoundException(`Student with id ${dto.studentId} not found`);
    }

    // Verify subject exists.
    const subjectRows = (await qr.query(
      `SELECT id FROM subjects WHERE id = $1`,
      [dto.subjectId],
    )) as Array<{ id: string }>;
    if (!subjectRows[0]) {
      throw new NotFoundException(`Subject with id ${dto.subjectId} not found`);
    }

    // Validate marks don't exceed max marks.
    if (dto.marksObtained > configRows[0].maxMarks) {
      throw new BadRequestException(
        `Marks obtained (${dto.marksObtained}) cannot exceed max marks (${configRows[0].maxMarks})`,
      );
    }

    // Upsert the mark.
    const rows = (await qr.query(
      `INSERT INTO exam_marks ("examId", "studentId", "subjectId", "marksObtained", "enteredByStaffId")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ("examId", "studentId", "subjectId")
       DO UPDATE SET
         "marksObtained" = EXCLUDED."marksObtained",
         "enteredByStaffId" = EXCLUDED."enteredByStaffId",
         "updatedAt" = now()
       RETURNING *`,
      [
        examId,
        dto.studentId,
        dto.subjectId,
        dto.marksObtained,
        dto.enteredByStaffId ?? null,
      ],
    )) as ExamMark[];
    return rows[0];
  }

  /**
   * Gets marks for a student in an exam, including computed grades and an
   * overall summary. Respects draft gating:
   * - school_admin / staff: can see marks for any exam (draft or published)
   * - parent: published only, must be linked to the student
   * - student: published only, must be their own account
   */
  async getMarksForStudent(
    examId: string,
    studentId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<StudentMarksSummary> {
    const qr = await this.queryRunner();

    // Verify exam exists.
    const examRows = (await qr.query(
      `SELECT * FROM exams WHERE id = $1`,
      [examId],
    )) as Exam[];
    if (!examRows[0]) {
      throw new NotFoundException(`Exam with id ${examId} not found`);
    }

    const exam = examRows[0];

    // Draft gating for parent/student roles.
    if (
      (userRole === UserRole.Parent || userRole === UserRole.Student) &&
      exam.status !== 'published'
    ) {
      throw new NotFoundException(`Exam with id ${examId} not found`);
    }

    // Authorization check.
    if (userRole === UserRole.Parent) {
      const isLinked =
        await this.parentStudentLinksService.isParentOfStudent(
          userId,
          studentId,
        );
      if (!isLinked) {
        throw new ForbiddenException(
          'You do not have permission to view marks for this student.',
        );
      }
    } else if (userRole === UserRole.Student) {
      const linkedStudentId =
        await this.studentsService.getLinkedStudentId(userId);
      if (linkedStudentId !== studentId) {
        throw new ForbiddenException(
          'You can only view your own marks.',
        );
      }
    }

    // Get student info.
    const studentRows = (await qr.query(
      `SELECT id, "firstName", "lastName" FROM students WHERE id = $1`,
      [studentId],
    )) as Array<{ id: string; firstName: string; lastName: string }>;
    if (!studentRows[0]) {
      throw new NotFoundException(`Student with id ${studentId} not found`);
    }
    const student = studentRows[0];

    // Get subject configs for this exam.
    const configs = await this.getSubjectConfigs(examId);

    // Get marks for this student.
    const marksRows = (await qr.query(
      `SELECT * FROM exam_marks
       WHERE "examId" = $1 AND "studentId" = $2`,
      [examId, studentId],
    )) as ExamMark[];

    // Build a map of subjectId -> mark.
    const marksMap = new Map<string, ExamMark>();
    for (const mark of marksRows) {
      marksMap.set(mark.subjectId, mark);
    }

    // Resolve grading scale for grade computation.
    const gradingInfo =
      await this.gradingScalesService.resolveGradingScale(
        exam.gradingScaleId,
      );

    // Build subject results with computed grades.
    // Only subjects with a mark entered (marksObtained !== null) count
    // toward the aggregate — ungraded subjects are excluded from the
    // denominator so they don't drag the percentage down as if scored zero.
    const subjects: ExamMarkDetail[] = [];
    let totalMarksObtained = 0;
    let totalMaxMarks = 0;
    let gradedSubjectsCount = 0;

    for (const config of configs) {
      const mark = marksMap.get(config.subjectId);
      const marksObtained = mark?.marksObtained ?? null;
      const percentage =
        marksObtained !== null
          ? (Number(marksObtained) / config.maxMarks) * 100
          : null;
      const grade =
        percentage !== null && gradingInfo
          ? this.gradingScalesService.lookupGrade(
              percentage,
              gradingInfo.bands,
            )
          : null;

      subjects.push({
        id: mark?.id ?? '',
        examId,
        studentId,
        subjectId: config.subjectId,
        marksObtained,
        enteredByStaffId: mark?.enteredByStaffId ?? null,
        createdAt: mark?.createdAt ?? new Date(),
        updatedAt: mark?.updatedAt ?? new Date(),
        subjectName: config.subjectName,
        maxMarks: config.maxMarks,
        percentage,
        grade,
      });

      // Only accumulate totals for subjects that actually have a mark entered.
      if (marksObtained !== null) {
        totalMarksObtained += Number(marksObtained);
        totalMaxMarks += config.maxMarks;
        gradedSubjectsCount++;
      }
    }

    // When zero subjects are graded, return null — not 0% (which would
    // be indistinguishable from a genuine zero score).
    const overallPercentage =
      gradedSubjectsCount > 0
        ? (totalMarksObtained / totalMaxMarks) * 100
        : null;
    const overallGrade =
      overallPercentage !== null && gradingInfo
        ? this.gradingScalesService.lookupGrade(
            overallPercentage,
            gradingInfo.bands,
          )
        : null;

    return {
      examId,
      examName: exam.name,
      studentId,
      studentFirstName: student.firstName,
      studentLastName: student.lastName,
      subjects,
      totalMarksObtained,
      totalMaxMarks,
      overallPercentage,
      overallGrade,
      gradedSubjectsCount,
      totalSubjectsCount: configs.length,
    };
  }

  /**
   * Removes an exam and its associated configs and marks. school_admin only.
   */
  async remove(id: string): Promise<void> {
    const qr = await this.queryRunner();
    const existing = (await qr.query(
      `SELECT id FROM exams WHERE id = $1`,
      [id],
    )) as Array<{ id: string }>;
    if (!existing[0]) {
      throw new NotFoundException(`Exam with id ${id} not found`);
    }
    await qr.query(`DELETE FROM exams WHERE id = $1`, [id]);
  }
}
