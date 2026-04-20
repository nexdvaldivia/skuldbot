import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { assertClientBoundary, resolveEffectiveClientScope } from './contracts-access.util';
import {
  ListSignedDocumentsQueryDto,
  SignedDocumentDetailResponseDto,
  SignedDocumentListItemDto,
  SignedDocumentListResponseDto,
} from './dto/signed-documents.dto';
import { ContractAcceptance } from './entities/contract-acceptance.entity';
import { ContractEnvelopeRecipient } from './entities/contract-envelope-recipient.entity';
import { ContractEnvelopeStatus } from './entities/contract-domain.enums';
import { ContractEnvelope } from './entities/contract-envelope.entity';
import { Contract } from './entities/contract.entity';
import { PdfService } from './pdf.service';

export type SignedDocumentDownloadResult = {
  redirectUrl: string | null;
  contentType: 'application/pdf' | 'text/html';
  fileName: string;
  buffer: Buffer | null;
};

@Injectable()
export class SignedDocumentsService {
  constructor(
    @InjectRepository(ContractEnvelope)
    private readonly envelopeRepository: Repository<ContractEnvelope>,
    @InjectRepository(ContractAcceptance)
    private readonly acceptanceRepository: Repository<ContractAcceptance>,
    @InjectRepository(Contract)
    private readonly contractRepository: Repository<Contract>,
    private readonly pdfService: PdfService,
  ) {}

  async listSignedDocuments(
    query: ListSignedDocumentsQueryDto,
    currentUser: User,
  ): Promise<SignedDocumentListResponseDto> {
    const effectiveClientId = resolveEffectiveClientScope(query.clientId, currentUser);
    const skip = query.skip ?? 0;
    const limit = query.limit ?? 20;
    const search = query.search?.trim().toLowerCase();
    const requestedType = query.documentType?.trim().toLowerCase();

    const qb = this.envelopeRepository
      .createQueryBuilder('envelope')
      .leftJoinAndSelect('envelope.recipients', 'recipients')
      .leftJoinAndSelect('envelope.documents', 'documents')
      .where('envelope.status = :status', {
        status: ContractEnvelopeStatus.COMPLETED,
      });

    if (effectiveClientId) {
      qb.andWhere('envelope.clientId = :clientId', {
        clientId: effectiveClientId,
      });
    }

    if (search) {
      qb.andWhere('LOWER(envelope.subject) LIKE :search', {
        search: `%${search}%`,
      });
    }

    const envelopes = await qb
      .orderBy('envelope.completedAt', 'DESC')
      .addOrderBy('documents.sortOrder', 'ASC')
      .addOrderBy('recipients.sortOrder', 'ASC')
      .getMany();

    const normalized = envelopes
      .map((envelope) => this.toListItem(envelope))
      .filter((item) => !requestedType || item.documentType === requestedType);

    const pagedItems = normalized.slice(skip, skip + limit);

    return {
      items: pagedItems,
      total: normalized.length,
      page: Math.floor(skip / limit) + 1,
      pageSize: limit,
      pages: normalized.length > 0 ? Math.ceil(normalized.length / limit) : 0,
    };
  }

  async getSignedDocument(
    documentId: string,
    currentUser: User,
  ): Promise<SignedDocumentDetailResponseDto> {
    const envelope = await this.requireCompletedEnvelope(documentId, currentUser);
    const listItem = this.toListItem(envelope);
    const htmlContent = this.composeEnvelopeHtml(envelope);

    return {
      ...listItem,
      htmlContent,
      signers: (envelope.recipients ?? []).map((recipient) => ({
        name: recipient.fullName,
        email: recipient.email,
        signedAt: recipient.signedAt?.toISOString() ?? null,
        status: recipient.status,
      })),
      documents: (envelope.documents ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((document) => ({
          id: document.id,
          name: document.name,
          order: document.sortOrder,
        })),
    };
  }

  async viewSignedDocumentHtml(documentId: string, currentUser: User): Promise<string> {
    const envelope = await this.requireCompletedEnvelope(documentId, currentUser);
    const title = this.escapeHtml(envelope.subject || 'Signed Document');
    const body = this.composeEnvelopeHtml(envelope, false);

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: 800px;
        margin: 0 auto;
        padding: 40px;
        line-height: 1.6;
        color: #1a1a2e;
      }
      .document {
        margin-bottom: 40px;
      }
      hr.page-break {
        border: none;
        border-top: 1px dashed #d1d5db;
        margin: 32px 0;
      }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
  }

  async downloadSignedDocument(
    documentId: string,
    format: 'html' | 'pdf',
    currentUser: User,
  ): Promise<SignedDocumentDownloadResult> {
    if (format !== 'html' && format !== 'pdf') {
      throw new BadRequestException({
        code: 'SIGNED_DOCUMENT_INVALID_FORMAT',
        message: 'format must be one of: html, pdf.',
      });
    }

    const envelope = await this.requireCompletedEnvelope(documentId, currentUser);

    if (format === 'pdf') {
      const acceptance = await this.acceptanceRepository.findOne({
        where: { envelopeId: envelope.id },
        order: { acceptedAt: 'DESC' },
      });

      if (acceptance?.signedPdfUrl) {
        return {
          redirectUrl: acceptance.signedPdfUrl,
          contentType: 'application/pdf',
          fileName: `${this.safeFileName(envelope.subject)}.pdf`,
          buffer: null,
        };
      }

      if (envelope.contractId) {
        const contract = await this.contractRepository.findOne({
          where: { id: envelope.contractId },
        });
        if (contract?.pdfPath) {
          const buffer = await this.pdfService.downloadContractPdf(contract);
          return {
            redirectUrl: null,
            contentType: 'application/pdf',
            fileName: `${this.safeFileName(envelope.subject)}.pdf`,
            buffer,
          };
        }
      }
    }

    const html = await this.viewSignedDocumentHtml(envelope.id, currentUser);
    return {
      redirectUrl: null,
      contentType: 'text/html',
      fileName: `${this.safeFileName(envelope.subject)}.html`,
      buffer: Buffer.from(html, 'utf8'),
    };
  }

  private async requireCompletedEnvelope(
    envelopeId: string,
    currentUser: User,
  ): Promise<ContractEnvelope> {
    const envelope = await this.envelopeRepository.findOne({
      where: {
        id: envelopeId,
        status: ContractEnvelopeStatus.COMPLETED,
      },
      relations: ['documents', 'recipients'],
    });

    if (!envelope) {
      throw new NotFoundException({
        code: 'SIGNED_DOCUMENT_NOT_FOUND',
        message: `Signed document ${envelopeId} was not found.`,
      });
    }

    assertClientBoundary(envelope.clientId, currentUser);
    return envelope;
  }

  private toListItem(envelope: ContractEnvelope): SignedDocumentListItemDto {
    const signedRecipient =
      (envelope.recipients ?? []).find((recipient) => recipient.status === 'signed') ??
      this.findMostRecentlySignedRecipient(envelope.recipients ?? []);

    return {
      id: envelope.id,
      name: envelope.subject,
      description: this.readEnvelopeDescription(envelope),
      documentType: this.getDocumentType(envelope),
      status: 'signed',
      signedAt: envelope.completedAt ?? null,
      signedByName: signedRecipient?.fullName ?? null,
      signedByEmail: signedRecipient?.email ?? null,
      documentCount: (envelope.documents ?? []).length,
      createdAt: envelope.createdAt,
    };
  }

  private findMostRecentlySignedRecipient(
    recipients: ContractEnvelopeRecipient[],
  ): ContractEnvelopeRecipient | null {
    if (recipients.length === 0) {
      return null;
    }
    return (
      recipients
        .filter((recipient) => recipient.signedAt)
        .sort((a, b) => (b.signedAt?.getTime() ?? 0) - (a.signedAt?.getTime() ?? 0))[0] ?? null
    );
  }

  private readEnvelopeDescription(envelope: ContractEnvelope): string | null {
    const metadataDescription = envelope.metadata?.['description'];
    if (typeof metadataDescription === 'string' && metadataDescription.trim().length > 0) {
      return metadataDescription.trim();
    }
    return null;
  }

  private getDocumentType(envelope: ContractEnvelope): string {
    const metadataType = envelope.metadata?.['contractType'];
    if (typeof metadataType === 'string' && metadataType.trim().length > 0) {
      return metadataType.trim().toLowerCase();
    }

    const templateKey = envelope.metadata?.['templateKey'];
    if (typeof templateKey === 'string' && templateKey.trim().length > 0) {
      return templateKey.trim().toLowerCase();
    }

    return 'other';
  }

  private composeEnvelopeHtml(envelope: ContractEnvelope, includeSeparators = true): string {
    const orderedDocuments = (envelope.documents ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const htmlParts: string[] = [];
    for (let index = 0; index < orderedDocuments.length; index += 1) {
      const document = orderedDocuments[index];
      if (document.content && document.content.trim().length > 0) {
        htmlParts.push(
          `<div class="document" data-doc-id="${this.escapeHtml(document.id)}">${document.content}</div>`,
        );
      }
      if (includeSeparators && index < orderedDocuments.length - 1) {
        htmlParts.push('<hr class="page-break" />');
      }
    }

    if (htmlParts.length === 0) {
      return '<p>No HTML content available for this signed document.</p>';
    }

    return htmlParts.join('\n');
  }

  private safeFileName(value: string): string {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-');
    return normalized.length > 0 ? normalized : 'signed-document';
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
