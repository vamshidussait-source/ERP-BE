import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * Tenant-scoped ExamSubjectConfig entity.
 * Lives inside each tenant's own schema (not public).
 *
 * Links which subjects are part of which exam, along with the maximum
 * marks for that subject in that exam. A unique constraint on
 * (examId, subjectId) prevents duplicate entries.
 */
@Entity({ name: 'exam_subject_configs' })
@Unique(['examId', 'subjectId'])
export class ExamSubjectConfig {
  @ApiProperty({
    description: 'Unique config identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Exam this config belongs to (FK to exams.id, ON DELETE CASCADE)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @Column({ type: 'uuid' })
  examId: string;

  @ApiProperty({
    description: 'Subject this config belongs to (FK to subjects.id, ON DELETE CASCADE)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @Column({ type: 'uuid' })
  subjectId: string;

  @ApiProperty({
    description: 'Maximum marks for this subject in this exam',
    example: 100,
  })
  @Column({ type: 'integer' })
  maxMarks: number;

  @ApiProperty({ description: 'Timestamp when the record was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
