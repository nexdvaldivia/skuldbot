import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt, randomUUID, createHash, timingSafeEqual } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import {
  EmailProvider,
  IntegrationType,
  StorageProvider,
  UploadResult,
} from '../common/interfaces/integration.interface';
import { ProviderFactoryService } from '../integrations/provider-factory.service';
import { resolveProviderChain } from '../integrations/provider-chain.util';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import {
  assertClientBoundary,
  ensureClientExists,
  ensureTenantBelongsToClient,
  resolveEffectiveClientScope,
} from './contracts-access.util';
import {
  AcceptContractDto,
  ClientContractStatusResponseDto,
  CompleteEnvelopeOfflineDto,
  CreateEnvelopeDto,
  CreateEnvelopeRecipientDto,
  CreateEnvelopeFromTemplatesDto,
  CreateSigningDocumentDto,
  ContractAcceptanceResponseDto,
  EnvelopeDeliveryHistoryResponseDto,
  EnvelopeStatusSummaryDto,
  ContractEvidenceVerificationResponseDto,
  ContractEnvelopeResponseDto,
  ContractEnvelopeRecipientResponseDto,
  CountersignAcceptanceDto,
  DeclineEnvelopeRecipientDto,
  EnvelopeDeliveryHistoryItemDto,
  ListContractAcceptancesQueryDto,
  ListSentContractsQueryDto,
  ReassignEnvelopeRecipientDto,
  RenderedAcceptanceResponseDto,
  ResendEnvelopeDto,
  RevokeAcceptanceDto,
  SignEnvelopeRecipientDto,
  SigningDocumentResponseDto,
  UpdateEnvelopeDto,
  UpdateSigningDocumentDto,
  UploadEnvelopeOfflineEvidenceDto,
  VerifyEnvelopeOtpDto,
} from './dto/signing.dto';
import { SendTemplateForSignatureDto } from './dto/template.dto';
import {
  ContractAcceptanceMethod,
  ContractEnvelopeRecipientStatus,
  ContractEnvelopeStatus,
} from './entities/contract-domain.enums';
import { ContractAcceptance } from './entities/contract-acceptance.entity';
import { ContractEnvelopeEvent } from './entities/contract-envelope-event.entity';
import { ContractEnvelopeRecipient } from './entities/contract-envelope-recipient.entity';
import { ContractEnvelope } from './entities/contract-envelope.entity';
import { ContractEvent } from './entities/contract-event.entity';
import { ContractSigner, ContractSignerStatus } from './entities/contract-signer.entity';
import { ContractStatus, Contract } from './entities/contract.entity';
import { SigningDocument } from './entities/signing-document.entity';
import { ContractLegalService } from './contract-legal.service';
import { ContractSignatoryPolicyService } from './contract-signatory-policy.service';
import { ContractTemplateService } from './contract-template.service';

@Injectable()
export class ContractSigningService {
  private readonly logger = new Logger(ContractSigningService.name);
  private readonly emailProviderChain: string[];
  private readonly storageProviderChain: string[];
  private readonly otpSecretPepper: string;
  private static readonly OFFLINE_EVIDENCE_MAX_BYTES = 50 * 1024 * 1024;
  private static readonly OFFLINE_EVIDENCE_ALLOWED_CONTENT_TYPES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
  ]);

  constructor(
    @InjectRepository(Contract)
    private readonly contractRepository: Repository<Contract>,
    @InjectRepository(ContractSigner)
    private readonly signerRepository: Repository<ContractSigner>,
    @InjectRepository(ContractEvent)
    private readonly contractEventRepository: Repository<ContractEvent>,
    @InjectRepository(ContractEnvelope)
    private readonly envelopeRepository: Repository<ContractEnvelope>,
    @InjectRepository(ContractEnvelopeRecipient)
    private readonly envelopeRecipientRepository: Repository<ContractEnvelopeRecipient>,
    @InjectRepository(ContractEnvelopeEvent)
    private readonly envelopeEventRepository: Repository<ContractEnvelopeEvent>,
    @InjectRepository(SigningDocument)
    private readonly signingDocumentRepository: Repository<SigningDocument>,
    @InjectRepository(ContractAcceptance)
    private readonly acceptanceRepository: Repository<ContractAcceptance>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly templateService: ContractTemplateService,
    private readonly contractLegalService: ContractLegalService,
    private readonly contractSignatoryPolicyService: ContractSignatoryPolicyService,
    private readonly providerFactory: ProviderFactoryService,
    private readonly configService: ConfigService,
  ) {
    this.emailProviderChain = resolveProviderChain(
      this.configService.get<string>('EMAIL_PROVIDER_CHAIN'),
      this.configService.get<string>('EMAIL_PROVIDER'),
      ['sendgrid', 'smtp'],
    );
    this.storageProviderChain = resolveProviderChain(
      this.configService.get<string>('STORAGE_PROVIDER_CHAIN'),
      this.configService.get<string>('STORAGE_PROVIDER'),
      ['s3', 'azure-blob'],
    );

    const configuredSecret =
      this.configService.get<string>('CONTRACT_SIGNING_OTP_SECRET')?.trim() ||
      this.configService.get<string>('JWT_SECRET')?.trim() ||
      '';

    const insecureDefaults = new Set([
      'change-this-secret',
      'change-this-secret-in-production',
      'change-this-refresh-secret',
      'change-this-refresh-secret-in-production',
      'contract-signing-default-secret',
    ]);

    if (!configuredSecret || insecureDefaults.has(configuredSecret)) {
      throw new Error(
        'CONTRACT_SIGNING_OTP_SECRET or JWT_SECRET must be configured with a secure non-default value.',
      );
    }

    this.otpSecretPepper = configuredSecret;
  }

  async sendTemplateForSignature(
    templateId: string,
    dto: SendTemplateForSignatureDto,
    currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    await ensureClientExists(this.clientRepository, dto.clientId);
    assertClientBoundary(dto.clientId, currentUser);
    await ensureTenantBelongsToClient(this.tenantRepository, dto.tenantId, dto.clientId);

    const templateVersion = await this.templateService.getPublishedTemplateVersion(templateId);

    const legalContext = await this.contractLegalService.buildLegalVariableContext();
    const contractVariables = {
      ...(dto.variables ?? {}),
      ...legalContext,
    };

    const contract = await this.contractRepository.save(
      this.contractRepository.create({
        clientId: dto.clientId,
        tenantId: dto.tenantId ?? null,
        title:
          dto.subject?.trim() || `${templateVersion.template.templateKey.toUpperCase()} Agreement`,
        templateKey: templateVersion.template.templateKey,
        version: templateVersion.versionNumber,
        status: ContractStatus.PENDING_SIGNATURE,
        variables: contractVariables,
        documentJson: templateVersion.documentJson ?? {},
        renderedHtml: templateVersion.renderedHtml,
        pdfPath: null,
        envelopeProvider: 'internal',
        envelopeId: null,
        signedAt: null,
        createdByUserId: currentUser.id,
        updatedByUserId: currentUser.id,
        metadata: {
          templateId,
          templateVersionId: templateVersion.id,
          source: 'contracts.template.send',
        },
      }),
    );

    const now = new Date();
    const signers = await this.signerRepository.save(
      dto.signers.map((signer, index) =>
        this.signerRepository.create({
          contractId: contract.id,
          email: signer.email.trim().toLowerCase(),
          fullName: signer.fullName.trim(),
          roleLabel: signer.roleLabel?.trim() || 'Signer',
          sortOrder: index,
          status: ContractSignerStatus.SENT,
          sentAt: now,
          viewedAt: null,
          signedAt: null,
          declinedAt: null,
          signatureAudit: {},
          metadata: {},
        }),
      ),
    );

    const envelope = await this.createSigningEnvelope(
      templateId,
      dto,
      templateVersion,
      contract,
      currentUser.id,
      now,
    );

    contract.envelopeId = envelope.id;
    await this.contractRepository.save(contract);

    const recipientsWithOtp = await this.createEnvelopeRecipients(
      envelope.id,
      signers,
      now,
      envelope.expiresAt,
    );
    await this.sendSigningNotifications(envelope, recipientsWithOtp);
    const recipients = recipientsWithOtp.map((entry) => entry.recipient);

    await this.recordEnvelopeEvent(envelope.id, null, 'envelope.sent', 'control-plane-api', {
      actorUserId: currentUser.id,
      recipientCount: recipients.length,
    });

    await this.recordContractEvent(contract.id, 'contract.submitted', 'control-plane-api', {
      actorUserId: currentUser.id,
      envelopeId: envelope.id,
      templateId,
      templateVersionId: templateVersion.id,
    });

    return this.toEnvelopeResponse({
      ...envelope,
      recipients,
    });
  }

  async createEnvelope(
    dto: CreateEnvelopeDto,
    currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    await ensureClientExists(this.clientRepository, dto.clientId);
    assertClientBoundary(dto.clientId, currentUser);
    await ensureTenantBelongsToClient(this.tenantRepository, dto.tenantId, dto.clientId);

    const now = new Date();
    const envelope = await this.envelopeRepository.save(
      this.envelopeRepository.create({
        contractId: dto.contractId ?? null,
        templateId: dto.templateId ?? null,
        templateVersionId: dto.templateVersionId ?? null,
        clientId: dto.clientId,
        tenantId: dto.tenantId ?? null,
        subject: dto.subject.trim(),
        status: ContractEnvelopeStatus.SENT,
        externalProvider: 'internal',
        externalEnvelopeId: null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : this.resolveEnvelopeExpiry(now),
        sentAt: now,
        completedAt: null,
        declinedAt: null,
        cancelledAt: null,
        createdByUserId: currentUser.id,
        updatedByUserId: currentUser.id,
        metadata: {
          ...(dto.metadata ?? {}),
          source: 'contracts.envelopes.create',
        },
      }),
    );

    const recipientsWithOtp = await this.createEnvelopeRecipientsFromInput(
      envelope.id,
      dto.recipients,
      now,
      envelope.expiresAt,
    );
    await this.sendSigningNotifications(envelope, recipientsWithOtp);
    await this.recordEnvelopeEvent(envelope.id, null, 'envelope.created', 'control-plane-api', {
      actorUserId: currentUser.id,
      recipientCount: recipientsWithOtp.length,
    });

    return this.loadEnvelopeResponse(envelope.id);
  }

  async createEnvelopeFromTemplates(
    dto: CreateEnvelopeFromTemplatesDto,
    currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    if (dto.templateIds.length === 0) {
      throw new BadRequestException({
        code: 'CONTRACT_ENVELOPE_TEMPLATE_REQUIRED',
        message: 'At least one templateId is required.',
      });
    }

    await ensureClientExists(this.clientRepository, dto.clientId);
    assertClientBoundary(dto.clientId, currentUser);
    await ensureTenantBelongsToClient(this.tenantRepository, dto.tenantId, dto.clientId);

    const versions = await Promise.all(
      dto.templateIds.map((templateId) =>
        this.templateService.getPublishedTemplateVersion(templateId),
      ),
    );
    const now = new Date();
    const primary = versions[0];

    const envelope = await this.envelopeRepository.save(
      this.envelopeRepository.create({
        contractId: null,
        templateId: dto.templateIds[0] ?? null,
        templateVersionId: primary.id,
        clientId: dto.clientId,
        tenantId: dto.tenantId ?? null,
        subject: dto.subject?.trim() || `${primary.template.title} - Signature Request`,
        status: ContractEnvelopeStatus.SENT,
        externalProvider: 'internal',
        externalEnvelopeId: null,
        expiresAt: this.resolveEnvelopeExpiry(now),
        sentAt: now,
        completedAt: null,
        declinedAt: null,
        cancelledAt: null,
        createdByUserId: currentUser.id,
        updatedByUserId: currentUser.id,
        metadata: {
          ...(dto.metadata ?? {}),
          source: 'contracts.envelopes.from_templates',
          templateIds: dto.templateIds,
        },
      }),
    );

    const recipientsWithOtp = await this.createEnvelopeRecipientsFromInput(
      envelope.id,
      dto.recipients,
      now,
      envelope.expiresAt,
    );
    await this.sendSigningNotifications(envelope, recipientsWithOtp);

    for (let index = 0; index < versions.length; index += 1) {
      const version = versions[index];
      const content = version.renderedHtml ?? this.stableStringify(version.documentJson ?? {});
      await this.signingDocumentRepository.save(
        this.signingDocumentRepository.create({
          envelopeId: envelope.id,
          name: version.template.title,
          contentType: 'pdf',
          content,
          contentHash: createHash('sha256').update(content).digest('hex'),
          sortOrder: index,
          templateId: dto.templateIds[index],
          templateVersionId: version.id,
          variables: null,
          createdByUserId: currentUser.id,
          updatedByUserId: currentUser.id,
          metadata: {},
        }),
      );
    }

    await this.recordEnvelopeEvent(
      envelope.id,
      null,
      'envelope.created_from_templates',
      'control-plane-api',
      {
        actorUserId: currentUser.id,
        recipientCount: recipientsWithOtp.length,
        templateCount: versions.length,
      },
    );

    return this.loadEnvelopeResponse(envelope.id);
  }

  async updateEnvelope(
    envelopeId: string,
    dto: UpdateEnvelopeDto,
    currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    const envelope = await this.requireEnvelope(envelopeId, currentUser);
    if (dto.subject !== undefined) {
      envelope.subject = dto.subject.trim();
    }
    if (dto.expiresAt !== undefined) {
      envelope.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }
    if (dto.metadata !== undefined) {
      envelope.metadata = {
        ...(envelope.metadata ?? {}),
        ...dto.metadata,
      };
    }
    envelope.updatedByUserId = currentUser.id;
    await this.envelopeRepository.save(envelope);

    await this.recordEnvelopeEvent(envelope.id, null, 'envelope.updated', 'control-plane-api', {
      actorUserId: currentUser.id,
    });

    return this.loadEnvelopeResponse(envelope.id);
  }

  async getEnvelopeStatusSummary(
    envelopeId: string,
    currentUser: User,
  ): Promise<EnvelopeStatusSummaryDto> {
    const envelope = await this.requireEnvelopeWithRecipients(envelopeId, currentUser);
    const recipients = envelope.recipients ?? [];
    const recipientCounts: Record<string, number> = {};

    for (const recipient of recipients) {
      const key = recipient.status;
      recipientCounts[key] = (recipientCounts[key] ?? 0) + 1;
    }

    return {
      envelopeId: envelope.id,
      status: envelope.status,
      recipientCounts,
      totalRecipients: recipients.length,
      completedRecipients: recipientCounts[ContractEnvelopeRecipientStatus.SIGNED] ?? 0,
      declinedRecipients: recipientCounts[ContractEnvelopeRecipientStatus.DECLINED] ?? 0,
      pendingRecipients:
        (recipientCounts[ContractEnvelopeRecipientStatus.PENDING] ?? 0) +
        (recipientCounts[ContractEnvelopeRecipientStatus.SENT] ?? 0) +
        (recipientCounts[ContractEnvelopeRecipientStatus.OTP_PENDING] ?? 0) +
        (recipientCounts[ContractEnvelopeRecipientStatus.OTP_VERIFIED] ?? 0),
      updatedAt: envelope.updatedAt,
    };
  }

  async voidEnvelope(envelopeId: string, currentUser: User): Promise<ContractEnvelopeResponseDto> {
    const envelope = await this.requireEnvelope(envelopeId, currentUser);
    this.assertEnvelopeTransition(
      envelope,
      'void',
      [ContractEnvelopeStatus.DRAFT, ContractEnvelopeStatus.SENT],
      ['sent'],
    );
    envelope.status = ContractEnvelopeStatus.CANCELLED;
    envelope.cancelledAt = new Date();
    envelope.updatedByUserId = currentUser.id;
    envelope.metadata = {
      ...(envelope.metadata ?? {}),
      lifecycleState: 'voided',
    };
    await this.envelopeRepository.save(envelope);

    await this.recordEnvelopeEvent(envelope.id, null, 'envelope.voided', 'control-plane-api', {
      actorUserId: currentUser.id,
    });
    return this.loadEnvelopeResponse(envelope.id);
  }

  async suspendEnvelope(
    envelopeId: string,
    currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    const envelope = await this.requireEnvelope(envelopeId, currentUser);
    this.assertEnvelopeTransition(envelope, 'suspend', [ContractEnvelopeStatus.SENT], ['sent']);
    envelope.metadata = {
      ...(envelope.metadata ?? {}),
      lifecycleState: 'suspended',
      suspendedAt: new Date().toISOString(),
      suspendedByUserId: currentUser.id,
    };
    envelope.updatedByUserId = currentUser.id;
    await this.envelopeRepository.save(envelope);
    await this.recordEnvelopeEvent(envelope.id, null, 'envelope.suspended', 'control-plane-api', {
      actorUserId: currentUser.id,
    });
    return this.loadEnvelopeResponse(envelope.id);
  }

  async resumeEnvelope(
    envelopeId: string,
    currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    const envelope = await this.requireEnvelope(envelopeId, currentUser);
    this.assertEnvelopeTransition(envelope, 'resume', [ContractEnvelopeStatus.SENT], ['suspended']);
    envelope.metadata = {
      ...(envelope.metadata ?? {}),
      lifecycleState: 'sent',
      resumedAt: new Date().toISOString(),
      resumedByUserId: currentUser.id,
    };
    envelope.updatedByUserId = currentUser.id;
    await this.envelopeRepository.save(envelope);
    await this.recordEnvelopeEvent(envelope.id, null, 'envelope.resumed', 'control-plane-api', {
      actorUserId: currentUser.id,
    });
    return this.loadEnvelopeResponse(envelope.id);
  }

  async reassignEnvelopeRecipient(
    envelopeId: string,
    dto: ReassignEnvelopeRecipientDto,
    currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    const envelope = await this.requireEnvelope(envelopeId, currentUser);
    const recipient = await this.envelopeRecipientRepository.findOne({
      where: { id: dto.recipientId, envelopeId: envelope.id },
    });
    if (!recipient) {
      throw new NotFoundException({
        code: 'CONTRACT_RECIPIENT_NOT_FOUND',
        message: `Recipient ${dto.recipientId} was not found for envelope ${envelope.id}.`,
      });
    }

    if (recipient.status === ContractEnvelopeRecipientStatus.SIGNED) {
      throw new BadRequestException({
        code: 'CONTRACT_RECIPIENT_ALREADY_SIGNED',
        message: `Recipient ${recipient.id} is already signed and cannot be reassigned.`,
      });
    }

    const otpCode = this.generateOtpCode();
    recipient.email = dto.email.trim().toLowerCase();
    if (dto.fullName !== undefined) {
      recipient.fullName = dto.fullName.trim();
    }
    if (dto.roleLabel !== undefined) {
      recipient.roleLabel = dto.roleLabel.trim();
    }
    recipient.status = ContractEnvelopeRecipientStatus.SENT;
    recipient.otpCodeHash = this.hashOtpCode(otpCode, recipient.email);
    recipient.otpExpiresAt = this.resolveOtpExpiry(new Date());
    recipient.otpVerifiedAt = null;
    recipient.otpAttempts = 0;
    recipient.signedAt = null;
    recipient.declinedAt = null;
    recipient.signatureType = null;
    recipient.signatureValue = null;
    recipient.signatureAssetPath = null;
    recipient.metadata = {
      ...(recipient.metadata ?? {}),
      reassignedAt: new Date().toISOString(),
      reassignedByUserId: currentUser.id,
    };
    recipient.metadata = this.ensureRecipientPublicSigningMetadata(
      recipient.metadata,
      envelope.expiresAt,
    );
    await this.envelopeRecipientRepository.save(recipient);

    await this.sendEnvelopeEmail(envelope, recipient, otpCode);
    await this.recordEnvelopeEvent(
      envelope.id,
      recipient.id,
      'recipient.reassigned',
      'control-plane-api',
      {
        actorUserId: currentUser.id,
        recipientId: recipient.id,
      },
    );

    return this.loadEnvelopeResponse(envelope.id);
  }

  async forceCloseEnvelope(
    envelopeId: string,
    currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    const envelope = await this.requireEnvelope(envelopeId, currentUser);
    envelope.status = ContractEnvelopeStatus.CANCELLED;
    envelope.cancelledAt = new Date();
    envelope.updatedByUserId = currentUser.id;
    envelope.metadata = {
      ...(envelope.metadata ?? {}),
      lifecycleState: 'force_closed',
      forceClosedAt: new Date().toISOString(),
      forceClosedByUserId: currentUser.id,
    };
    await this.envelopeRepository.save(envelope);

    await this.recordEnvelopeEvent(
      envelope.id,
      null,
      'envelope.force_closed',
      'control-plane-api',
      {
        actorUserId: currentUser.id,
      },
    );
    return this.loadEnvelopeResponse(envelope.id);
  }

  async resendEnvelope(
    envelopeId: string,
    dto: ResendEnvelopeDto,
    currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    const envelope = await this.requireEnvelope(envelopeId, currentUser);
    const recipients = await this.envelopeRecipientRepository.find({
      where: { envelopeId: envelope.id },
      order: { sortOrder: 'ASC' },
    });

    const targets = dto.recipientId
      ? recipients.filter((recipient) => recipient.id === dto.recipientId)
      : recipients.filter(
          (recipient) =>
            recipient.status !== ContractEnvelopeRecipientStatus.SIGNED &&
            recipient.status !== ContractEnvelopeRecipientStatus.DECLINED,
        );
    if (targets.length === 0) {
      throw new BadRequestException({
        code: 'CONTRACT_RESEND_TARGETS_EMPTY',
        message: `Envelope ${envelope.id} has no eligible recipients for resend.`,
      });
    }

    for (const recipient of targets) {
      const otpCode = this.generateOtpCode();
      recipient.status = ContractEnvelopeRecipientStatus.SENT;
      recipient.otpCodeHash = this.hashOtpCode(otpCode, recipient.email);
      recipient.otpExpiresAt = this.resolveOtpExpiry(new Date());
      recipient.otpVerifiedAt = null;
      recipient.otpAttempts = 0;
      recipient.metadata = {
        ...(recipient.metadata ?? {}),
        resentAt: new Date().toISOString(),
        resentByUserId: currentUser.id,
      };
      recipient.metadata = this.ensureRecipientPublicSigningMetadata(
        recipient.metadata,
        envelope.expiresAt,
      );
      await this.envelopeRecipientRepository.save(recipient);
      await this.sendEnvelopeEmail(envelope, recipient, otpCode);
      await this.recordEnvelopeEvent(
        envelope.id,
        recipient.id,
        'recipient.resent',
        'control-plane-api',
        {
          actorUserId: currentUser.id,
          recipientId: recipient.id,
        },
      );
    }

    return this.loadEnvelopeResponse(envelope.id);
  }

  async getEnvelopeDeliveryHistory(
    envelopeId: string,
    currentUser: User,
  ): Promise<EnvelopeDeliveryHistoryResponseDto> {
    const envelope = await this.requireEnvelope(envelopeId, currentUser);
    const events = await this.envelopeEventRepository.find({
      where: { envelopeId: envelope.id },
      order: { occurredAt: 'DESC', createdAt: 'DESC' },
    });

    return {
      envelopeId: envelope.id,
      events: events.map((event) => this.toEnvelopeDeliveryHistoryItem(event)),
    };
  }

  async uploadEnvelopeOfflineEvidence(
    envelopeId: string,
    dto: UploadEnvelopeOfflineEvidenceDto,
    currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    const envelope = await this.requireEnvelope(envelopeId, currentUser);
    const contentType = this.resolveOfflineEvidenceContentType(dto.contentType);
    const buffer = this.decodeBase64File(
      dto.contentBase64,
      'CONTRACT_OFFLINE_EVIDENCE_INVALID_BASE64',
    );
    this.assertOfflineEvidenceSize(buffer.length);
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const fileName = dto.fileName?.trim() || `offline-evidence-${Date.now()}.pdf`;

    const upload = await this.uploadOfflineEvidenceAsset(
      envelope,
      fileName,
      buffer,
      contentType,
      sha256,
    );

    envelope.updatedByUserId = currentUser.id;
    envelope.metadata = {
      ...(envelope.metadata ?? {}),
      offlineEvidence: {
        storageKey: upload.key,
        url: upload.url,
        contentType,
        sha256,
        sizeBytes: buffer.length,
        uploadedAt: new Date().toISOString(),
        uploadedByUserId: currentUser.id,
      },
    };
    await this.envelopeRepository.save(envelope);

    await this.recordEnvelopeEvent(
      envelope.id,
      null,
      'envelope.offline_evidence_uploaded',
      'control-plane-api',
      {
        actorUserId: currentUser.id,
        storageKey: upload.key,
        sha256,
        sizeBytes: buffer.length,
      },
    );

    return this.loadEnvelopeResponse(envelope.id);
  }

  async completeEnvelopeOffline(
    envelopeId: string,
    dto: CompleteEnvelopeOfflineDto,
    currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    const envelope = await this.requireEnvelope(envelopeId, currentUser);
    this.assertEnvelopeTransition(
      envelope,
      'complete_offline',
      [ContractEnvelopeStatus.SENT],
      ['sent', 'suspended'],
    );
    const now = new Date();
    envelope.status = ContractEnvelopeStatus.COMPLETED;
    envelope.completedAt = now;
    envelope.updatedByUserId = currentUser.id;
    envelope.metadata = {
      ...(envelope.metadata ?? {}),
      offlineCompletion: {
        acceptedByName: dto.acceptedByName.trim(),
        acceptedByEmail: dto.acceptedByEmail.trim().toLowerCase(),
        acceptedByTitle: dto.acceptedByTitle?.trim() || null,
        ipAddress: dto.ipAddress?.trim() || null,
        userAgent: dto.userAgent?.trim() || null,
        completedAt: now.toISOString(),
        completedByUserId: currentUser.id,
      },
    };
    await this.envelopeRepository.save(envelope);

    if (envelope.contractId) {
      const contract = await this.contractRepository.findOne({
        where: { id: envelope.contractId },
      });
      if (contract) {
        contract.status = ContractStatus.SIGNED;
        contract.signedAt = now;
        contract.updatedByUserId = currentUser.id;
        await this.contractRepository.save(contract);
      }
    }

    await this.recordEnvelopeEvent(
      envelope.id,
      null,
      'envelope.completed_offline',
      'control-plane-api',
      {
        actorUserId: currentUser.id,
        acceptedByEmail: dto.acceptedByEmail.trim().toLowerCase(),
      },
    );

    return this.loadEnvelopeResponse(envelope.id);
  }

  async addEnvelopeDocument(
    envelopeId: string,
    dto: CreateSigningDocumentDto,
    currentUser: User,
  ): Promise<SigningDocumentResponseDto> {
    const envelope = await this.requireEnvelope(envelopeId, currentUser);
    const content = dto.content ?? '';
    const document = await this.signingDocumentRepository.save(
      this.signingDocumentRepository.create({
        envelopeId: envelope.id,
        name: dto.name.trim(),
        contentType: dto.contentType?.trim().toLowerCase() || 'pdf',
        content: content.length > 0 ? content : null,
        contentHash: createHash('sha256').update(content).digest('hex'),
        sortOrder: dto.sortOrder ?? 0,
        templateId: dto.templateId ?? null,
        templateVersionId: dto.templateVersionId ?? null,
        variables: dto.variables ?? null,
        createdByUserId: currentUser.id,
        updatedByUserId: currentUser.id,
        metadata: dto.metadata ?? {},
      }),
    );
    await this.recordEnvelopeEvent(
      envelope.id,
      null,
      'envelope.document_added',
      'control-plane-api',
      {
        actorUserId: currentUser.id,
        documentId: document.id,
      },
    );
    return this.toSigningDocumentResponse(document);
  }

  async getEnvelopeDocument(
    envelopeId: string,
    documentId: string,
    currentUser: User,
  ): Promise<SigningDocumentResponseDto> {
    const envelope = await this.requireEnvelope(envelopeId, currentUser);
    const document = await this.requireSigningDocument(envelope.id, documentId);
    return this.toSigningDocumentResponse(document);
  }

  async updateEnvelopeDocument(
    envelopeId: string,
    documentId: string,
    dto: UpdateSigningDocumentDto,
    currentUser: User,
  ): Promise<SigningDocumentResponseDto> {
    const envelope = await this.requireEnvelope(envelopeId, currentUser);
    const document = await this.requireSigningDocument(envelope.id, documentId);

    if (dto.name !== undefined) {
      document.name = dto.name.trim();
    }
    if (dto.contentType !== undefined) {
      document.contentType = dto.contentType.trim().toLowerCase();
    }
    if (dto.content !== undefined) {
      document.content = dto.content;
      document.contentHash = createHash('sha256').update(dto.content).digest('hex');
    }
    if (dto.variables !== undefined) {
      document.variables = dto.variables;
    }
    if (dto.sortOrder !== undefined) {
      document.sortOrder = dto.sortOrder;
    }
    if (dto.metadata !== undefined) {
      document.metadata = {
        ...(document.metadata ?? {}),
        ...dto.metadata,
      };
    }
    document.updatedByUserId = currentUser.id;
    const saved = await this.signingDocumentRepository.save(document);

    await this.recordEnvelopeEvent(
      envelope.id,
      null,
      'envelope.document_updated',
      'control-plane-api',
      {
        actorUserId: currentUser.id,
        documentId: document.id,
      },
    );
    return this.toSigningDocumentResponse(saved);
  }

  async deleteEnvelopeDocument(
    envelopeId: string,
    documentId: string,
    currentUser: User,
  ): Promise<void> {
    const envelope = await this.requireEnvelope(envelopeId, currentUser);
    const document = await this.requireSigningDocument(envelope.id, documentId);
    await this.signingDocumentRepository.delete({ id: document.id });
    await this.recordEnvelopeEvent(
      envelope.id,
      null,
      'envelope.document_deleted',
      'control-plane-api',
      {
        actorUserId: currentUser.id,
        documentId: document.id,
      },
    );
  }

  private async createSigningEnvelope(
    templateId: string,
    dto: SendTemplateForSignatureDto,
    templateVersion: {
      id: string;
      template: { title: string; templateKey: string };
    },
    contract: Contract,
    actorUserId: string,
    now: Date,
  ): Promise<ContractEnvelope> {
    return this.envelopeRepository.save(
      this.envelopeRepository.create({
        contractId: contract.id,
        templateId,
        templateVersionId: templateVersion.id,
        clientId: dto.clientId,
        tenantId: dto.tenantId ?? null,
        subject: dto.subject?.trim() || `${templateVersion.template.title} - Signature Request`,
        status: ContractEnvelopeStatus.SENT,
        externalProvider: 'internal',
        externalEnvelopeId: null,
        expiresAt: this.resolveEnvelopeExpiry(now),
        sentAt: now,
        completedAt: null,
        declinedAt: null,
        cancelledAt: null,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        metadata: {
          source: 'contracts.template.send',
          templateKey: templateVersion.template.templateKey,
        },
      }),
    );
  }

  private async createEnvelopeRecipients(
    envelopeId: string,
    signers: ContractSigner[],
    now: Date,
    envelopeExpiresAt: Date | null,
  ): Promise<Array<{ recipient: ContractEnvelopeRecipient; otpCode: string }>> {
    const recipientsWithOtp: Array<{ recipient: ContractEnvelopeRecipient; otpCode: string }> = [];
    for (const signer of signers) {
      const otpCode = this.generateOtpCode();
      const recipient = this.envelopeRecipientRepository.create({
        envelopeId,
        signerId: signer.id,
        email: signer.email,
        fullName: signer.fullName,
        roleLabel: signer.roleLabel,
        sortOrder: signer.sortOrder,
        status: ContractEnvelopeRecipientStatus.SENT,
        otpCodeHash: this.hashOtpCode(otpCode, signer.email),
        otpExpiresAt: this.resolveOtpExpiry(now),
        otpVerifiedAt: null,
        otpAttempts: 0,
        viewedAt: null,
        signedAt: null,
        declinedAt: null,
        signatureType: null,
        signatureValue: null,
        signatureAssetPath: null,
        ipAddress: null,
        userAgent: null,
        metadata: this.ensureRecipientPublicSigningMetadata({}, envelopeExpiresAt),
      });

      const savedRecipient = await this.envelopeRecipientRepository.save(recipient);
      recipientsWithOtp.push({ recipient: savedRecipient, otpCode });
    }

    return recipientsWithOtp;
  }

  private async sendSigningNotifications(
    envelope: ContractEnvelope,
    recipientsWithOtp: Array<{ recipient: ContractEnvelopeRecipient; otpCode: string }>,
  ): Promise<void> {
    for (const entry of recipientsWithOtp) {
      await this.sendEnvelopeEmail(envelope, entry.recipient, entry.otpCode);
    }
  }

  private async createEnvelopeRecipientsFromInput(
    envelopeId: string,
    recipients: CreateEnvelopeRecipientDto[],
    now: Date,
    envelopeExpiresAt: Date | null,
  ): Promise<Array<{ recipient: ContractEnvelopeRecipient; otpCode: string }>> {
    const sorted = recipients
      .slice()
      .sort(
        (a, b) =>
          (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
      );
    const payload: Array<{ recipient: ContractEnvelopeRecipient; otpCode: string }> = [];

    for (let index = 0; index < sorted.length; index += 1) {
      const recipientInput = sorted[index];
      const otpCode = this.generateOtpCode();
      const recipient = await this.envelopeRecipientRepository.save(
        this.envelopeRecipientRepository.create({
          envelopeId,
          signerId: null,
          email: recipientInput.email.trim().toLowerCase(),
          fullName: recipientInput.fullName.trim(),
          roleLabel: recipientInput.roleLabel?.trim() || 'Signer',
          sortOrder: recipientInput.sortOrder ?? index,
          status: ContractEnvelopeRecipientStatus.SENT,
          otpCodeHash: this.hashOtpCode(otpCode, recipientInput.email.trim().toLowerCase()),
          otpExpiresAt: this.resolveOtpExpiry(now),
          otpVerifiedAt: null,
          otpAttempts: 0,
          viewedAt: null,
          signedAt: null,
          declinedAt: null,
          signatureType: null,
          signatureValue: null,
          signatureAssetPath: null,
          ipAddress: null,
          userAgent: null,
          metadata: this.ensureRecipientPublicSigningMetadata({}, envelopeExpiresAt),
        }),
      );

      payload.push({
        recipient,
        otpCode,
      });
    }

    return payload;
  }

  async listSentEnvelopes(
    query: ListSentContractsQueryDto,
    currentUser: User,
  ): Promise<ContractEnvelopeResponseDto[]> {
    const qb = this.envelopeRepository
      .createQueryBuilder('envelope')
      .leftJoinAndSelect('envelope.recipients', 'recipients');

    const effectiveClientId = resolveEffectiveClientScope(query.clientId, currentUser);
    if (effectiveClientId) {
      qb.andWhere('envelope.clientId = :clientId', { clientId: effectiveClientId });
    }

    if (query.tenantId) {
      qb.andWhere('envelope.tenantId = :tenantId', { tenantId: query.tenantId });
    }

    if (query.status) {
      qb.andWhere('envelope.status = :status', { status: query.status });
    }

    const envelopes = await qb
      .orderBy('envelope.createdAt', 'DESC')
      .addOrderBy('recipients.sortOrder', 'ASC')
      .getMany();

    return envelopes.map((envelope) => this.toEnvelopeResponse(envelope));
  }

  async getEnvelopeById(
    envelopeId: string,
    currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    const envelope = await this.envelopeRepository.findOne({
      where: { id: envelopeId },
      relations: ['recipients'],
    });

    if (!envelope) {
      throw new NotFoundException({
        code: 'CONTRACT_ENVELOPE_NOT_FOUND',
        message: `Envelope ${envelopeId} was not found.`,
      });
    }

    assertClientBoundary(envelope.clientId, currentUser);

    return this.toEnvelopeResponse(envelope);
  }

  async listAcceptances(
    query: ListContractAcceptancesQueryDto,
    currentUser: User,
  ): Promise<ContractAcceptanceResponseDto[]> {
    const qb = this.acceptanceRepository.createQueryBuilder('acceptance');

    const effectiveClientId = resolveEffectiveClientScope(query.clientId, currentUser);
    if (effectiveClientId) {
      qb.andWhere('acceptance.clientId = :clientId', { clientId: effectiveClientId });
    }

    if (query.tenantId) {
      qb.andWhere('acceptance.tenantId = :tenantId', { tenantId: query.tenantId });
    }

    if (query.contractId) {
      qb.andWhere('acceptance.contractId = :contractId', { contractId: query.contractId });
    }

    const acceptances = await qb.orderBy('acceptance.acceptedAt', 'DESC').getMany();

    return acceptances.map((acceptance) => this.toAcceptanceResponse(acceptance));
  }

  async getAcceptanceById(
    acceptanceId: string,
    currentUser: User,
  ): Promise<ContractAcceptanceResponseDto> {
    const acceptance = await this.acceptanceRepository.findOne({ where: { id: acceptanceId } });
    if (!acceptance) {
      throw new NotFoundException({
        code: 'CONTRACT_ACCEPTANCE_NOT_FOUND',
        message: `Contract acceptance ${acceptanceId} was not found.`,
      });
    }

    assertClientBoundary(acceptance.clientId, currentUser);

    return this.toAcceptanceResponse(acceptance);
  }

  async acceptContract(
    dto: AcceptContractDto,
    currentUser: User,
  ): Promise<ContractAcceptanceResponseDto> {
    const contract = await this.contractRepository.findOne({ where: { id: dto.contractId } });
    this.assertContractExists(contract, dto.contractId);
    assertClientBoundary(contract.clientId, currentUser);
    this.assertContractCanBeAccepted(contract);
    await this.assertNoActiveAcceptance(contract.id);

    const now = new Date();
    const acceptancePayload = this.buildAcceptancePayload(contract, dto, currentUser.id, now);
    const acceptance = await this.acceptanceRepository.save(
      this.acceptanceRepository.create(acceptancePayload),
    );

    await this.recordContractEvent(contract.id, 'contract.accepted', 'control-plane-api', {
      actorUserId: currentUser.id,
      acceptanceId: acceptance.id,
    });

    return this.toAcceptanceResponse(acceptance);
  }

  async countersignAcceptance(
    acceptanceId: string,
    dto: CountersignAcceptanceDto,
    currentUser: User,
  ): Promise<ContractAcceptanceResponseDto> {
    const acceptance = await this.requireAcceptance(acceptanceId);
    assertClientBoundary(acceptance.clientId, currentUser);

    if (acceptance.revokedAt) {
      throw new BadRequestException({
        code: 'CONTRACT_ACCEPTANCE_REVOKED',
        message: `Acceptance ${acceptance.id} is revoked and cannot be countersigned.`,
      });
    }

    const contract = await this.contractRepository.findOne({
      where: { id: acceptance.contractId },
    });
    if (!contract) {
      throw new NotFoundException({
        code: 'CONTRACT_NOT_FOUND',
        message: `Contract ${acceptance.contractId} was not found.`,
      });
    }

    const resolution = await this.contractSignatoryPolicyService.resolvePreview({
      contractType: contract.templateKey,
      requireReady: true,
    });
    if (!resolution.signatoryId || !resolution.ready) {
      throw new BadRequestException({
        code: 'CONTRACT_COUNTERSIGNATORY_NOT_READY',
        message: resolution.message,
      });
    }

    acceptance.countersignedAt = new Date();
    acceptance.countersignedBy = dto.countersignedBy?.trim() || resolution.signatoryName || null;
    acceptance.skuldSignatoryId = resolution.signatoryId;
    acceptance.skuldSignatoryName = resolution.signatoryName;
    acceptance.skuldSignatoryTitle = resolution.signatoryTitle;
    acceptance.skuldSignatoryEmail = resolution.signatoryEmail;
    acceptance.skuldSignatureHash = resolution.signatureHash;
    acceptance.skuldResolutionSource = resolution.resolutionSource;
    acceptance.skuldResolvedAt = resolution.resolvedAt;
    acceptance.metadata = {
      ...(acceptance.metadata ?? {}),
      countersignedByUserId: currentUser.id,
    };

    const saved = await this.acceptanceRepository.save(acceptance);
    await this.recordContractEvent(contract.id, 'contract.countersigned', 'control-plane-api', {
      actorUserId: currentUser.id,
      acceptanceId: acceptance.id,
      signatoryId: acceptance.skuldSignatoryId,
      source: acceptance.skuldResolutionSource,
    });
    return this.toAcceptanceResponse(saved);
  }

  async revokeAcceptance(
    acceptanceId: string,
    dto: RevokeAcceptanceDto,
    currentUser: User,
  ): Promise<ContractAcceptanceResponseDto> {
    const acceptance = await this.requireAcceptance(acceptanceId);
    assertClientBoundary(acceptance.clientId, currentUser);

    if (acceptance.revokedAt) {
      return this.toAcceptanceResponse(acceptance);
    }

    acceptance.revokedAt = new Date();
    acceptance.revocationReason = dto.reason.trim();
    acceptance.metadata = {
      ...(acceptance.metadata ?? {}),
      revokedByUserId: currentUser.id,
    };
    const saved = await this.acceptanceRepository.save(acceptance);

    await this.recordContractEvent(
      acceptance.contractId,
      'contract.acceptance_revoked',
      'control-plane-api',
      {
        actorUserId: currentUser.id,
        acceptanceId: acceptance.id,
        reason: acceptance.revocationReason,
      },
    );

    return this.toAcceptanceResponse(saved);
  }

  async verifyAcceptanceEvidence(
    acceptanceId: string,
    currentUser: User,
  ): Promise<ContractEvidenceVerificationResponseDto> {
    const acceptance = await this.requireAcceptance(acceptanceId);
    assertClientBoundary(acceptance.clientId, currentUser);

    const contentSnapshotHashActual = acceptance.contentSnapshot
      ? createHash('sha256').update(acceptance.contentSnapshot).digest('hex')
      : null;
    const contentSnapshotHashMatches = Boolean(
      contentSnapshotHashActual &&
      acceptance.contentSnapshotHash &&
      contentSnapshotHashActual === acceptance.contentSnapshotHash,
    );

    const signatureData = (acceptance.evidence?.['signatureData'] as string | undefined) ?? null;
    const signatureHashActual = signatureData
      ? createHash('sha256').update(signatureData).digest('hex')
      : null;
    const signatureHashMatches =
      signatureHashActual && acceptance.signatureHash
        ? signatureHashActual === acceptance.signatureHash
        : null;

    const signedPdfHashValidFormat = Boolean(
      acceptance.signedPdfHash && /^[a-fA-F0-9]{64}$/.test(acceptance.signedPdfHash),
    );

    const issues: string[] = [];
    if (!contentSnapshotHashMatches) {
      issues.push('Content snapshot hash mismatch.');
    }
    if (signatureData && signatureHashMatches === false) {
      issues.push('Signature hash mismatch.');
    }
    if (acceptance.signedPdfUrl && !acceptance.signedPdfHash) {
      issues.push('Signed PDF hash missing.');
    }
    if (acceptance.signedPdfHash && !acceptance.signedPdfUrl) {
      issues.push('Signed PDF URL missing.');
    }
    if (acceptance.signedPdfHash && !signedPdfHashValidFormat) {
      issues.push('Signed PDF hash has invalid format.');
    }

    return {
      acceptanceId: acceptance.id,
      contentSnapshotHashExpected: acceptance.contentSnapshotHash,
      contentSnapshotHashActual,
      contentSnapshotHashMatches,
      signatureHashExpected: acceptance.signatureHash,
      signatureHashActual,
      signatureHashMatches,
      signedPdfUrl: acceptance.signedPdfUrl,
      signedPdfHash: acceptance.signedPdfHash,
      signedPdfHashValidFormat,
      envelopeId: acceptance.envelopeId,
      issues,
      verified: issues.length === 0,
    };
  }

  async getClientContractStatus(
    clientId: string,
    currentUser: User,
  ): Promise<ClientContractStatusResponseDto> {
    assertClientBoundary(clientId, currentUser);
    const now = new Date();
    const acceptances = await this.acceptanceRepository.find({
      where: {
        clientId,
        revokedAt: IsNull(),
      },
      relations: ['contract'],
      order: {
        acceptedAt: 'DESC',
      },
    });

    const activeAcceptances = acceptances.filter(
      (acceptance) => !acceptance.expirationDate || acceptance.expirationDate > now,
    );

    const acceptedContracts: Record<
      string,
      Array<{
        acceptanceId: string;
        templateId: string | null;
        templateVersionId: string | null;
        templateName: string | null;
        version: number | null;
        acceptedAt: string;
        acceptedBy: string;
      }>
    > = {};

    for (const acceptance of activeAcceptances) {
      const contractType = acceptance.contract?.templateKey ?? 'unknown';
      if (!acceptedContracts[contractType]) {
        acceptedContracts[contractType] = [];
      }
      acceptedContracts[contractType].push({
        acceptanceId: acceptance.id,
        templateId: acceptance.templateId,
        templateVersionId: acceptance.templateVersionId,
        templateName: acceptance.contract?.title ?? null,
        version: acceptance.contract?.version ?? null,
        acceptedAt: acceptance.acceptedAt.toISOString(),
        acceptedBy: acceptance.acceptedByName,
      });
    }

    return {
      clientId,
      acceptedContracts,
      totalActiveAcceptances: activeAcceptances.length,
    };
  }

  async getRenderedAcceptance(
    acceptanceId: string,
    currentUser: User,
  ): Promise<RenderedAcceptanceResponseDto> {
    const acceptance = await this.requireAcceptance(acceptanceId);
    assertClientBoundary(acceptance.clientId, currentUser);

    const contract = await this.contractRepository.findOne({
      where: { id: acceptance.contractId },
    });
    if (!contract) {
      throw new NotFoundException({
        code: 'CONTRACT_NOT_FOUND',
        message: `Contract ${acceptance.contractId} was not found.`,
      });
    }

    return {
      acceptanceId: acceptance.id,
      contractId: acceptance.contractId,
      templateId: acceptance.templateId,
      templateVersionId: acceptance.templateVersionId,
      templateName: contract.title,
      templateVersion: contract.version,
      clientId: acceptance.clientId,
      acceptedAt: acceptance.acceptedAt.toISOString(),
      acceptedByName: acceptance.acceptedByName,
      acceptedByEmail: acceptance.acceptedByEmail,
      acceptedByTitle: acceptance.acceptedByTitle,
      contentSnapshot: acceptance.contentSnapshot,
      contentSnapshotHash: acceptance.contentSnapshotHash,
      variablesUsed: acceptance.variablesUsed,
      revokedAt: acceptance.revokedAt ? acceptance.revokedAt.toISOString() : null,
      revocationReason: acceptance.revocationReason,
    };
  }

  async verifyEnvelopeRecipientOtp(
    envelopeId: string,
    recipientId: string,
    dto: VerifyEnvelopeOtpDto,
    currentUser: User,
  ): Promise<ContractEnvelopeRecipientResponseDto> {
    const { recipient } = await this.requireEnvelopeRecipientContext(
      envelopeId,
      recipientId,
      currentUser,
    );

    const maxOtpAttempts = this.resolveOtpMaxAttempts();
    if (recipient.otpAttempts >= maxOtpAttempts) {
      throw new BadRequestException({
        code: 'CONTRACT_OTP_LOCKED',
        message: `OTP verification is locked after ${maxOtpAttempts} failed attempts.`,
      });
    }

    if (!recipient.otpCodeHash || !recipient.otpExpiresAt) {
      throw new BadRequestException({
        code: 'CONTRACT_OTP_NOT_REQUIRED',
        message: `Recipient ${recipient.id} does not require OTP verification.`,
      });
    }

    if (recipient.otpExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        code: 'CONTRACT_OTP_EXPIRED',
        message: 'OTP code has expired. Request a new signing session.',
      });
    }

    const expectedHash = this.hashOtpCode(dto.code.trim(), recipient.email);
    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    const providedBuffer = Buffer.from(recipient.otpCodeHash, 'hex');

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      recipient.otpAttempts += 1;
      const now = new Date();
      const locked = recipient.otpAttempts >= maxOtpAttempts;
      if (locked) {
        recipient.otpExpiresAt = now;
        recipient.metadata = {
          ...(recipient.metadata ?? {}),
          otpLockedAt: now.toISOString(),
          otpLockReason: 'max_attempts_exceeded',
        };
      }
      await this.envelopeRecipientRepository.save(recipient);
      await this.recordEnvelopeEvent(
        envelopeId,
        recipient.id,
        'recipient.otp_failed',
        'control-plane-api',
        {
          recipientId: recipient.id,
          otpAttempts: recipient.otpAttempts,
          maxOtpAttempts,
          locked,
        },
      );
      throw new BadRequestException({
        code: locked ? 'CONTRACT_OTP_LOCKED' : 'CONTRACT_OTP_INVALID',
        message: locked
          ? `OTP verification is locked after ${maxOtpAttempts} failed attempts.`
          : 'OTP code is invalid.',
      });
    }

    recipient.status = ContractEnvelopeRecipientStatus.OTP_VERIFIED;
    recipient.otpVerifiedAt = new Date();
    recipient.otpAttempts = 0;
    recipient.otpCodeHash = null;
    await this.envelopeRecipientRepository.save(recipient);

    await this.recordEnvelopeEvent(
      envelopeId,
      recipient.id,
      'recipient.otp_verified',
      'control-plane-api',
      {
        recipientId: recipient.id,
      },
    );

    return this.toEnvelopeRecipientResponse(recipient);
  }

  async signEnvelopeRecipient(
    envelopeId: string,
    recipientId: string,
    dto: SignEnvelopeRecipientDto,
    currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    const { envelope, recipient } = await this.requireEnvelopeRecipientContext(
      envelopeId,
      recipientId,
      currentUser,
    );
    if (recipient.status === ContractEnvelopeRecipientStatus.SIGNED) {
      throw new BadRequestException({
        code: 'CONTRACT_RECIPIENT_ALREADY_SIGNED',
        message: `Recipient ${recipient.id} is already signed.`,
      });
    }

    if (recipient.otpExpiresAt && !recipient.otpVerifiedAt) {
      throw new BadRequestException({
        code: 'CONTRACT_OTP_REQUIRED',
        message: 'Recipient must verify OTP before signing.',
      });
    }

    const contract = envelope.contractId
      ? await this.contractRepository.findOne({
          where: { id: envelope.contractId },
        })
      : null;
    const contentHash = this.computeSigningContentHash(contract, envelope);

    const now = new Date();
    recipient.status = ContractEnvelopeRecipientStatus.SIGNED;
    recipient.signatureType = dto.signatureType;
    recipient.signatureValue = dto.signatureValue;
    recipient.signedAt = now;
    recipient.ipAddress = dto.ipAddress?.trim() || recipient.ipAddress;
    recipient.userAgent = dto.userAgent?.trim() || recipient.userAgent;
    recipient.metadata = {
      ...(recipient.metadata ?? {}),
      ...(dto.evidence ?? {}),
      signedContentHash: contentHash,
      signedEnvelopeId: envelope.id,
      signedContractId: envelope.contractId,
      signedTemplateId: envelope.templateId,
      signedTemplateVersionId: envelope.templateVersionId,
      signedAt: now.toISOString(),
    };
    await this.envelopeRecipientRepository.save(recipient);

    if (recipient.signerId) {
      const signer = await this.signerRepository.findOne({
        where: { id: recipient.signerId },
      });
      if (signer) {
        signer.status = ContractSignerStatus.SIGNED;
        signer.signedAt = now;
        signer.signatureAudit = {
          ...(signer.signatureAudit ?? {}),
          signatureType: dto.signatureType,
          signedAt: now.toISOString(),
          ipAddress: recipient.ipAddress,
          userAgent: recipient.userAgent,
          contentHash,
          envelopeId: envelope.id,
          contractId: envelope.contractId,
          templateId: envelope.templateId,
          templateVersionId: envelope.templateVersionId,
        };
        await this.signerRepository.save(signer);
      }
    }

    await this.recordEnvelopeEvent(
      envelopeId,
      recipient.id,
      'recipient.signed',
      'control-plane-api',
      {
        recipientId: recipient.id,
        signatureType: dto.signatureType,
        contentHash,
        ipAddress: recipient.ipAddress,
        userAgent: recipient.userAgent,
      },
    );

    return this.recalculateEnvelopeAndContractStatus(envelopeId, currentUser.id);
  }

  async declineEnvelopeRecipient(
    envelopeId: string,
    recipientId: string,
    dto: DeclineEnvelopeRecipientDto,
    currentUser: User,
  ): Promise<ContractEnvelopeResponseDto> {
    const { recipient } = await this.requireEnvelopeRecipientContext(
      envelopeId,
      recipientId,
      currentUser,
    );

    const now = new Date();
    recipient.status = ContractEnvelopeRecipientStatus.DECLINED;
    recipient.declinedAt = now;
    recipient.ipAddress = dto.ipAddress?.trim() || recipient.ipAddress;
    recipient.userAgent = dto.userAgent?.trim() || recipient.userAgent;
    recipient.metadata = {
      ...(recipient.metadata ?? {}),
      declineReason: dto.reason?.trim() || null,
      ...(dto.evidence ?? {}),
      declinedAt: now.toISOString(),
      declineIpAddress: recipient.ipAddress,
      declineUserAgent: recipient.userAgent,
    };
    await this.envelopeRecipientRepository.save(recipient);

    if (recipient.signerId) {
      const signer = await this.signerRepository.findOne({
        where: { id: recipient.signerId },
      });
      if (signer) {
        signer.status = ContractSignerStatus.DECLINED;
        signer.declinedAt = now;
        signer.signatureAudit = {
          ...(signer.signatureAudit ?? {}),
          declinedAt: now.toISOString(),
          declineReason: dto.reason?.trim() || null,
          ipAddress: recipient.ipAddress,
          userAgent: recipient.userAgent,
        };
        await this.signerRepository.save(signer);
      }
    }

    await this.recordEnvelopeEvent(
      envelopeId,
      recipient.id,
      'recipient.declined',
      'control-plane-api',
      {
        recipientId: recipient.id,
        reason: dto.reason?.trim() || null,
        ipAddress: recipient.ipAddress,
        userAgent: recipient.userAgent,
      },
    );

    return this.recalculateEnvelopeAndContractStatus(envelopeId, currentUser.id);
  }

  private async requireEnvelopeRecipientContext(
    envelopeId: string,
    recipientId: string,
    currentUser: User,
  ): Promise<{ envelope: ContractEnvelope; recipient: ContractEnvelopeRecipient }> {
    const envelope = await this.envelopeRepository.findOne({ where: { id: envelopeId } });
    if (!envelope) {
      throw new NotFoundException({
        code: 'CONTRACT_ENVELOPE_NOT_FOUND',
        message: `Envelope ${envelopeId} was not found.`,
      });
    }

    assertClientBoundary(envelope.clientId, currentUser);

    const recipient = await this.envelopeRecipientRepository.findOne({
      where: {
        id: recipientId,
        envelopeId,
      },
    });

    if (!recipient) {
      throw new NotFoundException({
        code: 'CONTRACT_RECIPIENT_NOT_FOUND',
        message: `Recipient ${recipientId} was not found for envelope ${envelopeId}.`,
      });
    }

    return {
      envelope,
      recipient,
    };
  }

  private async recalculateEnvelopeAndContractStatus(
    envelopeId: string,
    actorUserId: string,
  ): Promise<ContractEnvelopeResponseDto> {
    const envelope = await this.requireEnvelopeWithRecipientsOrThrow(
      envelopeId,
      `Envelope ${envelopeId} was not found.`,
    );
    const recipients = envelope.recipients ?? [];
    const now = new Date();

    if (this.hasDeclinedRecipient(recipients)) {
      await this.markEnvelopeAsDeclined(envelope, actorUserId, now);
    } else if (this.hasAllRecipientsSigned(recipients)) {
      await this.markEnvelopeAsCompleted(envelope, actorUserId, now);
      await this.syncSignedContractFromCompletedEnvelope(envelope, recipients, actorUserId, now);
    } else {
      await this.markEnvelopeAsSent(envelope, actorUserId);
    }

    const refreshed = await this.requireEnvelopeWithRecipientsOrThrow(
      envelope.id,
      `Envelope ${envelopeId} was not found after status recalculation.`,
    );
    return this.toEnvelopeResponse(refreshed);
  }

  private hasDeclinedRecipient(recipients: ContractEnvelopeRecipient[]): boolean {
    return recipients.some(
      (recipient) => recipient.status === ContractEnvelopeRecipientStatus.DECLINED,
    );
  }

  private hasAllRecipientsSigned(recipients: ContractEnvelopeRecipient[]): boolean {
    return (
      recipients.length > 0 &&
      recipients.every((recipient) => recipient.status === ContractEnvelopeRecipientStatus.SIGNED)
    );
  }

  private async markEnvelopeAsDeclined(
    envelope: ContractEnvelope,
    actorUserId: string,
    now: Date,
  ): Promise<void> {
    envelope.status = ContractEnvelopeStatus.DECLINED;
    envelope.declinedAt = now;
    envelope.updatedByUserId = actorUserId;
    await this.envelopeRepository.save(envelope);
  }

  private async markEnvelopeAsCompleted(
    envelope: ContractEnvelope,
    actorUserId: string,
    now: Date,
  ): Promise<void> {
    envelope.status = ContractEnvelopeStatus.COMPLETED;
    envelope.completedAt = now;
    envelope.updatedByUserId = actorUserId;
    await this.envelopeRepository.save(envelope);
  }

  private async markEnvelopeAsSent(envelope: ContractEnvelope, actorUserId: string): Promise<void> {
    envelope.status = ContractEnvelopeStatus.SENT;
    envelope.updatedByUserId = actorUserId;
    await this.envelopeRepository.save(envelope);
  }

  private async syncSignedContractFromCompletedEnvelope(
    envelope: ContractEnvelope,
    recipients: ContractEnvelopeRecipient[],
    actorUserId: string,
    now: Date,
  ): Promise<void> {
    if (!envelope.contractId) {
      return;
    }
    const contract = await this.contractRepository.findOne({
      where: { id: envelope.contractId },
    });
    if (!contract) {
      return;
    }

    contract.status = ContractStatus.SIGNED;
    contract.signedAt = now;
    contract.updatedByUserId = actorUserId;
    await this.contractRepository.save(contract);
    await this.createAcceptanceFromCompletedEnvelope(contract, envelope, recipients, now);
    await this.recordContractEvent(contract.id, 'contract.signed', 'control-plane-api', {
      actorUserId,
      envelopeId: envelope.id,
    });
  }

  private async createAcceptanceFromCompletedEnvelope(
    contract: Contract,
    envelope: ContractEnvelope,
    recipients: ContractEnvelopeRecipient[],
    now: Date,
  ): Promise<void> {
    const primaryRecipient = recipients.slice().sort((a, b) => a.sortOrder - b.sortOrder)[0];
    if (!primaryRecipient) {
      return;
    }

    const contentHash = this.computeSigningContentHash(contract, envelope);
    const contentSnapshot = this.resolveAcceptanceSnapshot(contract);
    const signatureHash = primaryRecipient.signatureValue
      ? createHash('sha256').update(primaryRecipient.signatureValue).digest('hex')
      : null;

    await this.acceptanceRepository.save(
      this.acceptanceRepository.create({
        contractId: contract.id,
        envelopeId: envelope.id,
        templateId: envelope.templateId,
        templateVersionId: envelope.templateVersionId,
        clientId: envelope.clientId,
        tenantId: envelope.tenantId,
        acceptedByName: primaryRecipient.fullName,
        acceptedByEmail: primaryRecipient.email,
        acceptedByTitle: primaryRecipient.roleLabel,
        acceptanceMethod: ContractAcceptanceMethod.ESIGN,
        ipAddress: primaryRecipient.ipAddress ?? '0.0.0.0',
        userAgent: primaryRecipient.userAgent,
        acceptedAt: now,
        contentSnapshotHash: createHash('sha256').update(contentSnapshot).digest('hex'),
        contentSnapshot,
        signatureHash,
        countersignedAt: null,
        countersignedBy: null,
        skuldSignatoryId: null,
        skuldSignatoryName: null,
        skuldSignatoryTitle: null,
        skuldSignatoryEmail: null,
        skuldSignatureHash: null,
        skuldResolutionSource: null,
        skuldResolvedAt: null,
        signedPdfUrl: null,
        signedPdfHash: null,
        variablesUsed: contract.variables ?? {},
        effectiveDate: now,
        expirationDate: null,
        supersededById: null,
        revokedAt: null,
        revocationReason: null,
        evidence: {
          recipientCount: recipients.length,
          envelopeId: envelope.id,
          contentHash,
          templateId: envelope.templateId,
          templateVersionId: envelope.templateVersionId,
        },
        metadata: {},
      }),
    );
  }

  private async requireEnvelopeWithRecipientsOrThrow(
    envelopeId: string,
    message: string,
  ): Promise<ContractEnvelope> {
    const envelope = await this.envelopeRepository.findOne({
      where: { id: envelopeId },
      relations: ['recipients'],
    });
    if (!envelope) {
      throw new NotFoundException({
        code: 'CONTRACT_ENVELOPE_NOT_FOUND',
        message,
      });
    }
    return envelope;
  }

  private async recordEnvelopeEvent(
    envelopeId: string,
    recipientId: string | null,
    eventType: string,
    eventSource: string,
    eventPayload: Record<string, unknown>,
  ): Promise<void> {
    await this.envelopeEventRepository.save(
      this.envelopeEventRepository.create({
        envelopeId,
        recipientId,
        eventType,
        eventSource,
        eventPayload,
      }),
    );
  }

  private async recordContractEvent(
    contractId: string,
    eventType: string,
    eventSource: string,
    eventPayload: Record<string, unknown>,
  ): Promise<void> {
    await this.contractEventRepository.save(
      this.contractEventRepository.create({
        contractId,
        eventType,
        eventSource,
        eventPayload,
      }),
    );
  }

  private async sendEnvelopeEmail(
    envelope: ContractEnvelope,
    recipient: ContractEnvelopeRecipient,
    otpCode: string,
  ): Promise<void> {
    const signingToken = this.getRecipientPublicSigningToken(recipient);
    const signingLink = signingToken ? this.buildPublicSigningLink(signingToken) : null;
    try {
      await this.providerFactory.executeWithFallback<EmailProvider, unknown>(
        IntegrationType.EMAIL,
        'send',
        async (provider) =>
          provider.send({
            to: recipient.email,
            subject: envelope.subject,
            text: [
              `Hello ${recipient.fullName},`,
              '',
              'You have a contract pending signature.',
              `Envelope ID: ${envelope.id}`,
              `OTP Code: ${otpCode}`,
              ...(signingLink ? [`Signing Link: ${signingLink}`] : []),
              '',
              'Use this OTP in the signing flow to verify your identity.',
            ].join('\n'),
            html: [
              `<p>Hello ${this.escapeHtml(recipient.fullName)},</p>`,
              '<p>You have a contract pending signature.</p>',
              `<p><strong>Envelope ID:</strong> ${this.escapeHtml(envelope.id)}</p>`,
              `<p><strong>OTP Code:</strong> ${this.escapeHtml(otpCode)}</p>`,
              ...(signingLink
                ? [
                    `<p><strong>Signing Link:</strong> <a href="${this.escapeHtml(
                      signingLink,
                    )}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(
                      signingLink,
                    )}</a></p>`,
                  ]
                : []),
              '<p>Use this OTP in the signing flow to verify your identity.</p>',
            ].join(''),
          }),
        {
          tenantId: envelope.tenantId ?? undefined,
          providerChain: this.emailProviderChain,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_email_error';
      this.logger.warn(`Failed to deliver contract envelope email: ${message}`);
      await this.recordEnvelopeEvent(
        envelope.id,
        recipient.id,
        'recipient.delivery_failed',
        'control-plane-api',
        { message },
      );
    }
  }

  private resolveEnvelopeExpiry(from: Date): Date {
    const rawDays = Number(this.configService.get<string>('CONTRACT_ENVELOPE_EXPIRY_DAYS') ?? '14');
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.floor(rawDays) : 14;
    return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private resolveOtpExpiry(from: Date): Date {
    const rawMinutes = Number(
      this.configService.get<string>('CONTRACT_SIGNING_OTP_EXPIRY_MINUTES') ?? '15',
    );
    const minutes = Number.isFinite(rawMinutes) && rawMinutes > 0 ? Math.floor(rawMinutes) : 15;
    return new Date(from.getTime() + minutes * 60 * 1000);
  }

  private resolveOtpMaxAttempts(): number {
    const rawAttempts = Number(
      this.configService.get<string>('CONTRACT_SIGNING_OTP_MAX_ATTEMPTS') ?? '5',
    );
    return Number.isFinite(rawAttempts) && rawAttempts > 0 ? Math.floor(rawAttempts) : 5;
  }

  private generateOtpCode(): string {
    return String(randomInt(100000, 1_000_000));
  }

  private hashOtpCode(code: string, recipientEmail: string): string {
    return createHash('sha256')
      .update(`${recipientEmail.toLowerCase()}::${code}::${this.otpSecretPepper}`)
      .digest('hex');
  }

  private ensureRecipientPublicSigningMetadata(
    metadata: Record<string, unknown> | null | undefined,
    envelopeExpiresAt: Date | null,
  ): Record<string, unknown> {
    const current = metadata ?? {};
    const existingToken =
      typeof current['publicSigningToken'] === 'string' ? current['publicSigningToken'] : null;
    const existingExpiresAt =
      typeof current['publicSigningTokenExpiresAt'] === 'string'
        ? current['publicSigningTokenExpiresAt']
        : null;
    const token = existingToken ?? randomUUID().replace(/-/g, '');
    const expiresAt =
      existingExpiresAt ??
      (envelopeExpiresAt ?? this.resolveEnvelopeExpiry(new Date())).toISOString();
    return {
      ...current,
      publicSigningToken: token,
      publicSigningTokenExpiresAt: expiresAt,
    };
  }

  private getRecipientPublicSigningToken(recipient: ContractEnvelopeRecipient): string | null {
    const metadata = recipient.metadata ?? {};
    const token =
      typeof metadata['publicSigningToken'] === 'string' ? metadata['publicSigningToken'] : null;
    return token && token.trim().length > 0 ? token.trim() : null;
  }

  private buildPublicSigningLink(token: string): string {
    const baseUrl = this.resolvePublicSigningBaseUrl();
    return `${baseUrl}/${encodeURIComponent(token)}`;
  }

  private resolvePublicSigningBaseUrl(): string {
    const configured =
      this.configService.get<string>('PUBLIC_SIGNING_BASE_URL')?.trim() ||
      this.configService.get<string>('FRONTEND_URL')?.trim() ||
      'http://localhost:3004/sign';
    const withoutTrailing = configured.replace(/\/+$/, '');
    if (withoutTrailing.endsWith('/sign')) {
      return withoutTrailing;
    }
    return `${withoutTrailing}/sign`;
  }

  private computeSigningContentHash(contract: Contract | null, envelope: ContractEnvelope): string {
    const payload: Record<string, unknown> = {
      envelopeId: envelope.id,
      contractId: envelope.contractId,
      templateId: envelope.templateId,
      templateVersionId: envelope.templateVersionId,
      contractVersion: contract?.version ?? null,
      contractTemplateKey: contract?.templateKey ?? null,
      renderedHtml: contract?.renderedHtml ?? null,
      documentJson: contract?.documentJson ?? {},
      variables: contract?.variables ?? {},
    };

    return createHash('sha256').update(this.stableStringify(payload)).digest('hex');
  }

  private assertContractExists(
    contract: Contract | null,
    contractId: string,
  ): asserts contract is Contract {
    if (!contract) {
      throw new NotFoundException({
        code: 'CONTRACT_NOT_FOUND',
        message: `Contract ${contractId} was not found.`,
      });
    }
  }

  private assertContractCanBeAccepted(contract: Contract): void {
    if (contract.status !== ContractStatus.SIGNED) {
      throw new BadRequestException({
        code: 'CONTRACT_STATUS_INVALID',
        message: `Contract ${contract.id} must be in signed status before acceptance.`,
      });
    }
  }

  private async assertNoActiveAcceptance(contractId: string): Promise<void> {
    const existingActive = await this.acceptanceRepository.findOne({
      where: {
        contractId,
        revokedAt: IsNull(),
      },
      order: {
        acceptedAt: 'DESC',
      },
    });

    if (existingActive) {
      throw new BadRequestException({
        code: 'CONTRACT_ACCEPTANCE_ALREADY_EXISTS',
        message: `Contract ${contractId} already has an active acceptance.`,
      });
    }
  }

  private buildAcceptancePayload(
    contract: Contract,
    dto: AcceptContractDto,
    actorUserId: string,
    now: Date,
  ): Partial<ContractAcceptance> {
    const contentSnapshot = this.resolveAcceptanceSnapshot(contract);
    const contentSnapshotHash = createHash('sha256').update(contentSnapshot).digest('hex');
    const signatureHash = dto.signatureData
      ? createHash('sha256').update(dto.signatureData).digest('hex')
      : null;

    return {
      contractId: contract.id,
      envelopeId: contract.envelopeId,
      templateId: (contract.metadata?.['templateId'] as string | undefined) ?? null,
      templateVersionId: (contract.metadata?.['templateVersionId'] as string | undefined) ?? null,
      clientId: contract.clientId,
      tenantId: contract.tenantId,
      acceptedByName: dto.acceptedByName.trim(),
      acceptedByEmail: dto.acceptedByEmail.trim().toLowerCase(),
      acceptedByTitle: dto.acceptedByTitle?.trim() || null,
      acceptanceMethod: dto.acceptanceMethod ?? ContractAcceptanceMethod.ESIGN,
      ipAddress: dto.ipAddress?.trim() || '0.0.0.0',
      userAgent: dto.userAgent?.trim() || null,
      acceptedAt: now,
      contentSnapshotHash,
      contentSnapshot,
      signatureHash,
      countersignedAt: null,
      countersignedBy: null,
      skuldSignatoryId: null,
      skuldSignatoryName: null,
      skuldSignatoryTitle: null,
      skuldSignatoryEmail: null,
      skuldSignatureHash: null,
      skuldResolutionSource: null,
      skuldResolvedAt: null,
      signedPdfUrl: null,
      signedPdfHash: null,
      variablesUsed: {
        ...(contract.variables ?? {}),
        ...(dto.variables ?? {}),
      },
      effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : now,
      expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : null,
      supersededById: null,
      revokedAt: null,
      revocationReason: null,
      evidence: {
        source: 'contracts.accept',
        envelopeId: contract.envelopeId,
        signatureData: dto.signatureData ?? null,
        actorUserId,
      },
      metadata: {},
    };
  }

  private resolveAcceptanceSnapshot(contract: Contract): string {
    if (contract.renderedHtml && contract.renderedHtml.trim().length > 0) {
      return contract.renderedHtml;
    }
    return this.stableStringify({
      title: contract.title,
      templateKey: contract.templateKey,
      version: contract.version,
      documentJson: contract.documentJson ?? {},
      variables: contract.variables ?? {},
    });
  }

  private async requireAcceptance(acceptanceId: string): Promise<ContractAcceptance> {
    const acceptance = await this.acceptanceRepository.findOne({
      where: { id: acceptanceId },
      relations: ['contract'],
    });

    if (!acceptance) {
      throw new NotFoundException({
        code: 'CONTRACT_ACCEPTANCE_NOT_FOUND',
        message: `Contract acceptance ${acceptanceId} was not found.`,
      });
    }

    return acceptance;
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    const objectValue = value as Record<string, unknown>;
    const keys = Object.keys(objectValue).sort();
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${this.stableStringify(objectValue[key])}`,
    );
    return `{${entries.join(',')}}`;
  }

  private async loadEnvelopeResponse(envelopeId: string): Promise<ContractEnvelopeResponseDto> {
    const envelope = await this.envelopeRepository.findOne({
      where: { id: envelopeId },
      relations: ['recipients'],
    });
    if (!envelope) {
      throw new NotFoundException({
        code: 'CONTRACT_ENVELOPE_NOT_FOUND',
        message: `Envelope ${envelopeId} was not found.`,
      });
    }
    return this.toEnvelopeResponse(envelope);
  }

  private async requireEnvelope(envelopeId: string, currentUser: User): Promise<ContractEnvelope> {
    const envelope = await this.envelopeRepository.findOne({
      where: { id: envelopeId },
    });
    if (!envelope) {
      throw new NotFoundException({
        code: 'CONTRACT_ENVELOPE_NOT_FOUND',
        message: `Envelope ${envelopeId} was not found.`,
      });
    }
    assertClientBoundary(envelope.clientId, currentUser);
    return envelope;
  }

  private async requireEnvelopeWithRecipients(
    envelopeId: string,
    currentUser: User,
  ): Promise<ContractEnvelope> {
    const envelope = await this.envelopeRepository.findOne({
      where: { id: envelopeId },
      relations: ['recipients'],
    });
    if (!envelope) {
      throw new NotFoundException({
        code: 'CONTRACT_ENVELOPE_NOT_FOUND',
        message: `Envelope ${envelopeId} was not found.`,
      });
    }
    assertClientBoundary(envelope.clientId, currentUser);
    return envelope;
  }

  private async requireSigningDocument(
    envelopeId: string,
    documentId: string,
  ): Promise<SigningDocument> {
    const document = await this.signingDocumentRepository.findOne({
      where: { id: documentId, envelopeId },
    });
    if (!document) {
      throw new NotFoundException({
        code: 'SIGNING_DOCUMENT_NOT_FOUND',
        message: `Document ${documentId} was not found for envelope ${envelopeId}.`,
      });
    }
    return document;
  }

  private toEnvelopeDeliveryHistoryItem(
    event: ContractEnvelopeEvent,
  ): EnvelopeDeliveryHistoryItemDto {
    return {
      id: event.id,
      envelopeId: event.envelopeId,
      recipientId: event.recipientId,
      eventType: event.eventType,
      eventSource: event.eventSource,
      eventPayload: event.eventPayload ?? {},
      occurredAt: event.occurredAt,
    };
  }

  private toSigningDocumentResponse(document: SigningDocument): SigningDocumentResponseDto {
    return {
      id: document.id,
      envelopeId: document.envelopeId,
      name: document.name,
      contentType: document.contentType,
      contentHash: document.contentHash,
      sortOrder: document.sortOrder,
      templateId: document.templateId,
      templateVersionId: document.templateVersionId,
      variables: document.variables,
      metadata: document.metadata ?? {},
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }

  private decodeBase64File(contentBase64: string, errorCode: string): Buffer {
    let buffer: Buffer;
    try {
      buffer = Buffer.from(contentBase64, 'base64');
    } catch {
      throw new BadRequestException({
        code: errorCode,
        message: 'Input content is not valid base64.',
      });
    }

    if (buffer.length === 0) {
      throw new BadRequestException({
        code: `${errorCode}_EMPTY`,
        message: 'Input content cannot be empty.',
      });
    }

    return buffer;
  }

  private resolveOfflineEvidenceContentType(contentType: string | undefined): string {
    const normalized = contentType?.trim().toLowerCase() || 'application/pdf';
    if (!ContractSigningService.OFFLINE_EVIDENCE_ALLOWED_CONTENT_TYPES.has(normalized)) {
      throw new BadRequestException({
        code: 'CONTRACT_OFFLINE_EVIDENCE_CONTENT_TYPE_INVALID',
        message:
          'Offline evidence must be one of: application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, image/jpeg, image/png.',
      });
    }
    return normalized;
  }

  private assertOfflineEvidenceSize(sizeBytes: number): void {
    if (sizeBytes > ContractSigningService.OFFLINE_EVIDENCE_MAX_BYTES) {
      throw new PayloadTooLargeException({
        code: 'CONTRACT_OFFLINE_EVIDENCE_TOO_LARGE',
        message: `Offline evidence exceeds ${ContractSigningService.OFFLINE_EVIDENCE_MAX_BYTES} bytes.`,
      });
    }
  }

  private assertEnvelopeTransition(
    envelope: ContractEnvelope,
    action: string,
    allowedStatuses: ContractEnvelopeStatus[],
    allowedLifecycleStates: string[],
  ): void {
    const lifecycleState = this.getEnvelopeLifecycleState(envelope);
    const statusAllowed = allowedStatuses.includes(envelope.status);
    const lifecycleAllowed = allowedLifecycleStates.includes(lifecycleState);
    if (statusAllowed && lifecycleAllowed) {
      return;
    }
    throw new BadRequestException({
      code: 'CONTRACT_ENVELOPE_STATUS_TRANSITION_INVALID',
      message: `Envelope ${envelope.id} cannot execute '${action}' from status '${envelope.status}' and lifecycle '${lifecycleState}'.`,
    });
  }

  private getEnvelopeLifecycleState(envelope: ContractEnvelope): string {
    const metadata = envelope.metadata ?? {};
    const rawState = metadata.lifecycleState;
    return typeof rawState === 'string' && rawState.trim().length > 0
      ? rawState.trim().toLowerCase()
      : 'sent';
  }

  private async uploadOfflineEvidenceAsset(
    envelope: ContractEnvelope,
    fileName: string,
    body: Buffer,
    contentType: string,
    sha256: string,
  ): Promise<UploadResult> {
    const key = [
      'contracts',
      'envelopes',
      envelope.id,
      'offline-evidence',
      `${Date.now()}-${fileName.replaceAll(' ', '_')}`,
    ].join('/');

    const executed = await this.providerFactory.executeWithFallback<StorageProvider, UploadResult>(
      IntegrationType.STORAGE,
      'upload',
      async (provider) =>
        provider.upload({
          key,
          body,
          contentType,
          metadata: {
            envelope_id: envelope.id,
            client_id: envelope.clientId,
            sha256,
          },
        }),
      {
        tenantId: envelope.tenantId ?? undefined,
        providerChain: this.storageProviderChain,
      },
    );

    return executed.result;
  }

  private toEnvelopeResponse(envelope: ContractEnvelope): ContractEnvelopeResponseDto {
    return {
      id: envelope.id,
      contractId: envelope.contractId,
      templateId: envelope.templateId,
      templateVersionId: envelope.templateVersionId,
      clientId: envelope.clientId,
      tenantId: envelope.tenantId,
      subject: envelope.subject,
      status: envelope.status,
      externalProvider: envelope.externalProvider,
      externalEnvelopeId: envelope.externalEnvelopeId,
      expiresAt: envelope.expiresAt,
      sentAt: envelope.sentAt,
      completedAt: envelope.completedAt,
      declinedAt: envelope.declinedAt,
      cancelledAt: envelope.cancelledAt,
      metadata: envelope.metadata ?? {},
      recipients: (envelope.recipients ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((recipient) => this.toEnvelopeRecipientResponse(recipient)),
      createdAt: envelope.createdAt,
      updatedAt: envelope.updatedAt,
    };
  }

  private toEnvelopeRecipientResponse(
    recipient: ContractEnvelopeRecipient,
  ): ContractEnvelopeRecipientResponseDto {
    return {
      id: recipient.id,
      signerId: recipient.signerId,
      email: recipient.email,
      fullName: recipient.fullName,
      roleLabel: recipient.roleLabel,
      sortOrder: recipient.sortOrder,
      status: recipient.status,
      otpVerifiedAt: recipient.otpVerifiedAt,
      viewedAt: recipient.viewedAt,
      signedAt: recipient.signedAt,
      declinedAt: recipient.declinedAt,
      signatureType: recipient.signatureType,
      ipAddress: recipient.ipAddress,
      userAgent: recipient.userAgent,
      metadata: recipient.metadata ?? {},
    };
  }

  private toAcceptanceResponse(acceptance: ContractAcceptance): ContractAcceptanceResponseDto {
    return {
      id: acceptance.id,
      contractId: acceptance.contractId,
      envelopeId: acceptance.envelopeId,
      templateId: acceptance.templateId,
      templateVersionId: acceptance.templateVersionId,
      clientId: acceptance.clientId,
      tenantId: acceptance.tenantId,
      acceptedByName: acceptance.acceptedByName,
      acceptedByEmail: acceptance.acceptedByEmail,
      acceptedByTitle: acceptance.acceptedByTitle,
      acceptanceMethod: acceptance.acceptanceMethod,
      ipAddress: acceptance.ipAddress,
      userAgent: acceptance.userAgent,
      acceptedAt: acceptance.acceptedAt,
      contentSnapshotHash: acceptance.contentSnapshotHash,
      contentSnapshot: acceptance.contentSnapshot,
      signatureHash: acceptance.signatureHash,
      countersignedAt: acceptance.countersignedAt,
      countersignedBy: acceptance.countersignedBy,
      skuldSignatoryId: acceptance.skuldSignatoryId,
      skuldSignatoryName: acceptance.skuldSignatoryName,
      skuldSignatoryTitle: acceptance.skuldSignatoryTitle,
      skuldSignatoryEmail: acceptance.skuldSignatoryEmail,
      skuldSignatureHash: acceptance.skuldSignatureHash,
      skuldResolutionSource: acceptance.skuldResolutionSource,
      skuldResolvedAt: acceptance.skuldResolvedAt,
      signedPdfUrl: acceptance.signedPdfUrl,
      signedPdfHash: acceptance.signedPdfHash,
      variablesUsed: acceptance.variablesUsed,
      effectiveDate: acceptance.effectiveDate,
      expirationDate: acceptance.expirationDate,
      supersededById: acceptance.supersededById,
      revokedAt: acceptance.revokedAt,
      revocationReason: acceptance.revocationReason,
      evidence: acceptance.evidence ?? {},
      metadata: acceptance.metadata ?? {},
      createdAt: acceptance.createdAt,
    };
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
