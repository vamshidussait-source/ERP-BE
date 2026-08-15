import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Tenant-scoped FileUpload entity.
 * Lives inside each tenant's own schema (not public).
 * Queried via TenantConnectionService's queryRunner with search_path set.
 *
 * The actual bytes live in Cloudflare R2 (S3-compatible); this row is the
 * metadata + the storage key that maps to the object. storageKey is
 * namespaced per tenant schema ({tenantSchema}/{uuid}-{sanitizedFileName}) so
 * cross-tenant key collisions are impossible.
 */
@Entity({ name: 'file_uploads' })
export class FileUpload {
  @ApiProperty({
    description: 'Unique file record identifier (UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Original filename as uploaded by the user',
    example: 'report-card.pdf',
  })
  @Column({ type: 'varchar', length: 255 })
  fileName: string;

  @ApiProperty({
    description:
      'Cloudflare R2 object key, namespaced per tenant schema ({tenantSchema}/{uuid}-{sanitizedFileName})',
    example: 'e2etest/f47ac10b-58cc-4372-a567-0e02b2c3d479-report-card.pdf',
  })
  @Column({ type: 'varchar', length: 1024 })
  storageKey: string;

  @ApiProperty({
    description: 'MIME type of the file',
    example: 'application/pdf',
  })
  @Column({ type: 'varchar', length: 100 })
  mimeType: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 204800,
  })
  @Column({ type: 'bigint' })
  sizeBytes: number;

  @ApiProperty({
    description:
      'Tenant user who uploaded the file (foreign key to users.id; null if the user was deleted)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  uploadedBy: string | null;

  @ApiProperty({
    description:
      'Kind of entity this file is attached to (e.g. student, fee_receipt) — for future linking',
    example: 'student',
    nullable: true,
  })
  @Column({ type: 'varchar', length: 50, nullable: true })
  relatedEntityType: string | null;

  @ApiProperty({
    description:
      'Id of the related entity (used together with relatedEntityType)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    nullable: true,
  })
  @Column({ type: 'uuid', nullable: true })
  relatedEntityId: string | null;

  @ApiProperty({ description: 'Timestamp when the file record was created' })
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
