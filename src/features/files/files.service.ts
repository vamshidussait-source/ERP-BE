import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { QueryRunner } from 'typeorm';
import { AppLogger } from '../../common/logger/app.logger';
import { TenantConnectionService } from '../tenants/tenant-connection.service';
import { FileUpload } from './file-upload.entity';

/** Files larger than this are rejected before any upload attempt. */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Only these MIME types may be uploaded. */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/** Presigned download URLs expire after this many seconds (15 minutes). */
export const PRESIGN_URL_TTL_SECONDS = 15 * 60;

/** Shape returned by getSignedDownloadUrl. */
export interface DownloadUrlResult {
  downloadUrl: string;
  expiresInSeconds: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Returns a query runner scoped to the current tenant schema via search_path.
   * All queries against the file_uploads table must go through this.
   */
  private async queryRunner(): Promise<QueryRunner> {
    return this.tenantConnectionService.getQueryRunner();
  }

  /** Mock mode is on by default; off only when explicitly set to 'false'. */
  private get isMockMode(): boolean {
    return (
      this.configService.get<string>('FILES_MOCK_MODE', 'true') !== 'false'
    );
  }

  /**
   * Returns the R2 credentials from env vars, or null in mock mode. Outside
   * mock mode, a missing variable throws a clear error (fail-loud, mirroring
   * the JWT_SECRET pattern).
   */
  private getR2Config(): {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
  } | null {
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
    );
    const bucketName = this.configService.get<string>('R2_BUCKET_NAME');

    const missing = (
      [
        ['R2_ACCOUNT_ID', accountId],
        ['R2_ACCESS_KEY_ID', accessKeyId],
        ['R2_SECRET_ACCESS_KEY', secretAccessKey],
        ['R2_BUCKET_NAME', bucketName],
      ] as const
    )
      .filter(([, value]) => value === undefined || value === '')
      .map(([name]) => name);

    if (missing.length > 0) {
      if (this.isMockMode) {
        this.logger.warn(
          `[Files] Missing R2 configuration (${missing.join(', ')}) — using mock mode.`,
        );
        return null;
      }
      throw new Error(
        `Missing required R2 configuration: ${missing.join(', ')}. ` +
          'Set them in your .env file (see .env.example).',
      );
    }

    // Narrowing: all four values are validated to be present above.
    return {
      accountId: accountId as string,
      accessKeyId: accessKeyId as string,
      secretAccessKey: secretAccessKey as string,
      bucketName: bucketName as string,
    };
  }

  /** Builds an S3 client pointed at the tenant's Cloudflare R2 endpoint. */
  private buildS3Client(config: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
  }): S3Client {
    return new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /**
   * Storage key namespaced per tenant schema, e.g. {tenant}/{uuid}-{fileName}.
   * In mock mode the key is prefixed with "mock/" so fake rows are visually
   * distinguishable from real uploads.
   */
  private buildStorageKey(tenantSchema: string, fileName: string): string {
    const sanitized = fileName
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 120);
    const prefix = this.isMockMode ? 'mock/' : '';
    return `${prefix}${tenantSchema}/${randomUUID()}-${sanitized}`;
  }

  private validateFile(fileBuffer: Buffer, mimeType: string): void {
    if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File is ${fileBuffer.length} bytes — exceeds the ${MAX_FILE_SIZE_BYTES} byte (10 MB) limit.`,
      );
    }
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
      throw new BadRequestException(
        `File type "${mimeType}" is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}.`,
      );
    }
  }

  /**
   * Uploads a file to Cloudflare R2 (S3-compatible) and records its metadata.
   * In mock mode, skips the R2 call and inserts the row with a fake storageKey.
   */
  async uploadFile(
    fileBuffer: Buffer,
    originalFileName: string,
    mimeType: string,
    uploadedByUserId: string | undefined,
    tenantSchema: string,
  ): Promise<FileUpload> {
    this.validateFile(fileBuffer, mimeType);

    const storageKey = this.buildStorageKey(tenantSchema, originalFileName);
    const r2Config = this.getR2Config();

    if (r2Config) {
      const s3 = this.buildS3Client(r2Config);
      await s3.send(
        new PutObjectCommand({
          Bucket: r2Config.bucketName,
          Key: storageKey,
          Body: fileBuffer,
          ContentType: mimeType,
        }),
      );
    } else {
      this.logger.log(
        `[Files][mock] Would upload ${originalFileName} (${mimeType}, ${fileBuffer.length} bytes) to R2 at key "${storageKey}" — skipped (mock mode).`,
      );
    }

    const queryRunner = await this.queryRunner();
    const rows = (await queryRunner.query(
      `INSERT INTO file_uploads
         ("fileName", "storageKey", "mimeType", "sizeBytes", "uploadedBy")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING "id", "fileName", "storageKey", "mimeType",
                 "sizeBytes"::int AS "sizeBytes", "uploadedBy",
                 "relatedEntityType", "relatedEntityId", "createdAt"`,
      [
        originalFileName,
        storageKey,
        mimeType,
        fileBuffer.length,
        uploadedByUserId ?? null,
      ],
    )) as FileUpload[];
    return rows[0];
  }

  /**
   * Generates a time-limited presigned URL (15 minutes) for downloading a file,
   * rather than any permanently public URL.
   */
  async getSignedDownloadUrl(
    fileId: string,
    tenantSchema: string,
  ): Promise<DownloadUrlResult> {
    const file = await this.findOne(fileId);
    this.assertFileInTenant(file, tenantSchema);
    const r2Config = this.getR2Config();

    let downloadUrl: string;
    if (r2Config) {
      const s3 = this.buildS3Client(r2Config);
      downloadUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: r2Config.bucketName,
          Key: file.storageKey,
        }),
        { expiresIn: PRESIGN_URL_TTL_SECONDS },
      );
    } else {
      downloadUrl = `https://mock-r2.example.com/${file.storageKey}?X-Amz-Expires=${PRESIGN_URL_TTL_SECONDS}`;
      this.logger.log(
        `[Files][mock] Would presign ${file.storageKey} for ${PRESIGN_URL_TTL_SECONDS}s — returning fake URL (mock mode).`,
      );
    }

    return {
      downloadUrl,
      expiresInSeconds: PRESIGN_URL_TTL_SECONDS,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    };
  }

  /**
   * Removes both the R2 object and the database row. In mock mode, only the
   * database row is removed.
   */
  async deleteFile(fileId: string, tenantSchema: string): Promise<FileUpload> {
    const file = await this.findOne(fileId);
    this.assertFileInTenant(file, tenantSchema);
    const r2Config = this.getR2Config();

    if (r2Config) {
      const s3 = this.buildS3Client(r2Config);
      await s3.send(
        new DeleteObjectCommand({
          Bucket: r2Config.bucketName,
          Key: file.storageKey,
        }),
      );
    } else {
      this.logger.log(
        `[Files][mock] Would delete R2 object "${file.storageKey}" — skipped (mock mode).`,
      );
    }

    const queryRunner = await this.queryRunner();
    const [rows] = (await queryRunner.query(
      `DELETE FROM file_uploads WHERE id = $1
       RETURNING "id", "fileName", "storageKey", "mimeType",
                 "sizeBytes"::int AS "sizeBytes", "uploadedBy",
                 "relatedEntityType", "relatedEntityId", "createdAt"`,
      [fileId],
    )) as [FileUpload[], number];
    if (!rows[0]) {
      throw new NotFoundException(`File with id ${fileId} not found`);
    }
    return rows[0];
  }

  /**
   * Defense-in-depth: the storageKey embeds the tenant schema (with an
   * optional "mock/" prefix in mock mode), so verify the record actually
   * belongs to this tenant before acting on it. The search_path already
   * scopes queries, but this makes cross-tenant access impossible even if a
   * wrong row were ever returned.
   */
  private assertFileInTenant(file: FileUpload, tenantSchema: string): void {
    const key = file.storageKey;
    const ownedByTenant =
      key.startsWith(`${tenantSchema}/`) ||
      key.startsWith(`mock/${tenantSchema}/`);
    if (!ownedByTenant) {
      throw new NotFoundException(
        `File with id ${file.id} not found in tenant ${tenantSchema}`,
      );
    }
  }

  private async findOne(fileId: string): Promise<FileUpload> {
    const queryRunner = await this.queryRunner();
    const rows = (await queryRunner.query(
      `SELECT "id", "fileName", "storageKey", "mimeType",
              "sizeBytes"::int AS "sizeBytes", "uploadedBy",
              "relatedEntityType", "relatedEntityId", "createdAt"
       FROM file_uploads WHERE id = $1`,
      [fileId],
    )) as FileUpload[];
    if (!rows[0]) {
      throw new NotFoundException(`File with id ${fileId} not found`);
    }
    return rows[0];
  }
}
