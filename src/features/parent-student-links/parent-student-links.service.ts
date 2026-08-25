import { Injectable } from '@nestjs/common';
import { TenantConnectionService } from '../tenants/tenant-connection.service';
import { ParentChildDto } from './dto/parent-child.dto';

@Injectable()
export class ParentStudentLinksService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  private async queryRunner() {
    return this.tenantConnectionService.getQueryRunner();
  }

  /**
   * Links a parent user to a student (upsert). Admin-only action.
   */
  async linkParentToStudent(
    parentUserId: string,
    studentId: string,
  ): Promise<{ id: string; parentUserId: string; studentId: string; createdAt: Date }> {
    const qr = await this.queryRunner();
    const rows = (await qr.query(
      `INSERT INTO parent_student_links ("parentUserId", "studentId")
       VALUES ($1, $2)
       ON CONFLICT ("parentUserId", "studentId") DO UPDATE
         SET "parentUserId" = EXCLUDED."parentUserId"
       RETURNING *`,
      [parentUserId, studentId],
    )) as Array<{ id: string; parentUserId: string; studentId: string; createdAt: Date }>;
    return rows[0];
  }

  /**
   * Removes a parent–student link. Admin-only action.
   */
  async unlinkParentFromStudent(
    parentUserId: string,
    studentId: string,
  ): Promise<void> {
    const qr = await this.queryRunner();
    await qr.query(
      `DELETE FROM parent_student_links
       WHERE "parentUserId" = $1 AND "studentId" = $2`,
      [parentUserId, studentId],
    );
  }

  /**
   * Returns all student IDs linked to a given parent.
   */
  async getLinkedStudentIds(parentUserId: string): Promise<string[]> {
    const qr = await this.queryRunner();
    const rows = (await qr.query(
      `SELECT "studentId" FROM parent_student_links WHERE "parentUserId" = $1`,
      [parentUserId],
    )) as Array<{ studentId: string }>;
    return rows.map((r) => r.studentId);
  }

  /**
   * Returns enriched student info for all children linked to a parent.
   */
  async getMyChildren(
    parentUserId: string,
  ): Promise<ParentChildDto[]> {
    const qr = await this.queryRunner();
    const rows = (await qr.query(
      `SELECT
         s.id,
         s."firstName",
         s."lastName",
         s."admissionNumber",
         s."sectionId",
         s.status
       FROM parent_student_links psl
       JOIN students s ON s.id = psl."studentId"
       WHERE psl."parentUserId" = $1
       ORDER BY s."lastName", s."firstName"`,
      [parentUserId],
    )) as ParentChildDto[];
    return rows;
  }

  /**
   * Checks whether a parent is linked to a specific student.
   */
  async isParentOfStudent(
    parentUserId: string,
    studentId: string,
  ): Promise<boolean> {
    const qr = await this.queryRunner();
    const rows = (await qr.query(
      `SELECT 1 FROM parent_student_links
       WHERE "parentUserId" = $1 AND "studentId" = $2
       LIMIT 1`,
      [parentUserId, studentId],
    )) as Array<{ '?column?': number }>;
    return rows.length > 0;
  }
}
