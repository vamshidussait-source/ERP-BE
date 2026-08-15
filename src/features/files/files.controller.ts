import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantConnectionCleanupInterceptor } from '../tenants/tenant-connection-cleanup.interceptor';
import {
  tenantSchemaOf,
  type TenantRequest,
} from '../tenants/tenant-request.types';
import { FileUpload } from './file-upload.entity';
import {
  ALLOWED_MIME_TYPES,
  FilesService,
  MAX_FILE_SIZE_BYTES,
} from './files.service';

@ApiTags('files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@UseInterceptors(TenantConnectionCleanupInterceptor)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      // First line of defense: reject oversized uploads at the interceptor
      // level before the service-level size check runs.
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
    description:
      'The file to upload (multipart/form-data field "file").\n\n' +
      `Allowed MIME types: ${ALLOWED_MIME_TYPES.join(', ')}. ` +
      `Maximum size: ${MAX_FILE_SIZE_BYTES} bytes (10 MB).`,
  })
  @ApiOperation({
    summary: 'Upload a file to Cloudflare R2',
    description:
      'Uploads a file and records its metadata in the tenant schema.\n\n' +
      '📎 Allowed types: ' +
      `${ALLOWED_MIME_TYPES.join(', ')}.\n` +
      `📦 Maximum size: ${MAX_FILE_SIZE_BYTES} bytes (10 MB) — enforced both ` +
      'at the interceptor level and in the service.\n\n' +
      'In mock mode (FILES_MOCK_MODE=true), the R2 upload is skipped and only ' +
      'the metadata row is created.',
  })
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
    type: FileUpload,
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed — file too large (>10 MB) or disallowed MIME type',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({
    status: 413,
    description: 'Payload too large — exceeded the interceptor file size limit',
  })
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: TenantRequest,
  ) {
    if (!file) {
      throw new BadRequestException(
        'No file uploaded — multipart field "file" is required.',
      );
    }
    return this.filesService.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      req.user?.sub,
      req.tenantSchema ?? tenantSchemaOf(req.user) ?? '',
    );
  }

  @Get(':id/download-url')
  @ApiOperation({
    summary: 'Get a time-limited presigned download URL',
    description:
      'Looks up the file record and returns a presigned URL valid for 15 ' +
      'minutes. The URL is generated on demand rather than being permanently ' +
      'public. The response does not redirect or stream the file itself.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Presigned download URL (expires in 15 minutes) with file metadata',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  getDownloadUrl(@Param('id') id: string, @Req() req: TenantRequest) {
    return this.filesService.getSignedDownloadUrl(
      id,
      req.tenantSchema ?? tenantSchemaOf(req.user) ?? '',
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a file',
    description:
      'Removes both the Cloudflare R2 object and the metadata row. In mock ' +
      'mode, only the metadata row is removed.',
  })
  @ApiResponse({
    status: 200,
    description: 'File deleted successfully',
    type: FileUpload,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — valid Bearer token required',
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  remove(@Param('id') id: string, @Req() req: TenantRequest) {
    return this.filesService.deleteFile(
      id,
      req.tenantSchema ?? tenantSchemaOf(req.user) ?? '',
    );
  }
}
