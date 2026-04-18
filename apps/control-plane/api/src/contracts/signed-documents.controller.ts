import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CP_PERMISSIONS } from '../common/authz/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { User } from '../users/entities/user.entity';
import {
  ListSignedDocumentsQueryDto,
  SignedDocumentDetailResponseDto,
  SignedDocumentDownloadQueryDto,
  SignedDocumentListResponseDto,
} from './dto/signed-documents.dto';
import { SignedDocumentsService } from './signed-documents.service';

@Controller('signed-documents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SignedDocumentsController {
  constructor(private readonly signedDocumentsService: SignedDocumentsService) {}

  @Get()
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async listSignedDocuments(
    @Query() query: ListSignedDocumentsQueryDto,
    @CurrentUser() currentUser: User,
  ): Promise<SignedDocumentListResponseDto> {
    return this.signedDocumentsService.listSignedDocuments(query, currentUser);
  }

  @Get(':documentId')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async getSignedDocument(
    @Param('documentId') documentId: string,
    @CurrentUser() currentUser: User,
  ): Promise<SignedDocumentDetailResponseDto> {
    return this.signedDocumentsService.getSignedDocument(documentId, currentUser);
  }

  @Get(':documentId/view')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  @Header('Content-Type', 'text/html; charset=utf-8')
  async viewSignedDocument(
    @Param('documentId') documentId: string,
    @CurrentUser() currentUser: User,
  ): Promise<string> {
    return this.signedDocumentsService.viewSignedDocumentHtml(documentId, currentUser);
  }

  @Get(':documentId/download')
  @RequirePermissions(CP_PERMISSIONS.CONTRACTS_READ)
  async downloadSignedDocument(
    @Param('documentId') documentId: string,
    @Query() query: SignedDocumentDownloadQueryDto,
    @CurrentUser() currentUser: User,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile | void> {
    const result = await this.signedDocumentsService.downloadSignedDocument(
      documentId,
      query.format ?? 'html',
      currentUser,
    );

    if (result.redirectUrl) {
      response.redirect(307, result.redirectUrl);
      return;
    }

    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    return new StreamableFile(result.buffer ?? Buffer.alloc(0));
  }
}
