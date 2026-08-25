import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Tenant-scoped ExamMark entity.
 * Lives inside each tenant's own schema (not public).
 *
 * Stores marks obtained by a student in a specific subject within an exam.
 * The marksObtained column is nullable to represent "not yet entered" as a
 * distinct state from "scored zero". A unique constraint on
 * (examId, studentId, subjectId) prevents duplicate entries.
 */
@Entity({ name: 'exam_marks' })
@Unique(['examId', 'studentId', 'subjectId'])
export class ExamMark {
  @ApiProperty({
    description: 'Unique exam mark identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Exam this mark belongs to (FK to exams.id, ON DELETE CASCADE)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @Column({ type: 'uuid' })
  examId: string;

  @ApiProperty({
    description: 'Student this mark belongs to (FK to students.id, ON DELETE CASCADE)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @Column({ type: 'uuid' })
  studentId: string;

  @ApiProperty({
    description: 'Subject this mark belongs to (FK to subjects.id, ON DELETE CASCADE)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @Column({ type: 'uuid' })
  subjectId: string;

  @ApiProperty({
    description:
      'Marks obtained (nullable to allow "not yet entered" as distinct from "scored zero")',
    example: 85,
    nullable: true,
  })
  @Column({ type: 'decimal', precision: 7, scale: 2, nullable: true })
  marksObtained: number | null;

  @ApiProperty({
    description:
      'Staff member who entered this mark (FK to staff.id, ON DELETE SET NULL)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  enteredByStaffId: string | null;

  @ApiProperty({ description: 'Timestamp when the record was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({ description: 'Timestamp when the record was last updated' })
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
