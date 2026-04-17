import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt, createHash, timingSafeEqual } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { EmailProvider, IntegrationType } from '../common/interfaces/integration.interface';
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
  ContractAcceptanceResponseDto,
  ContractEvidenceVerificationResponseDto,
  ContractEnvelopeResponseDto,
  ContractEnvelopeRecipientResponseDto,
  CountersignAcceptanceDto,
  DeclineEnvelopeRecipientDto,
  ListContractAcceptancesQueryDto,
  ListSentContractsQueryDto,
  RenderedAcceptanceResponseDto,
  RevokeAcceptanceDto,
  SignEnvelopeRecipientDto,
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
import { ContractLegalService } from './contract-legal.service';
import { ContractSignatoryPolicyService } from './contract-signatory-policy.service';
import { ContractTemplateService } from './contract-template.service';

@Injectable()
export class ContractSigningService {
  private readonly logger = new Logger(ContractSigningService.name);
  private readonly emailProviderChain: string[];
  private readonly otpSecretPepper: string;

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

    const recipientsWithOtp = await this.createEnvelopeRecipients(envelope.id, signers, now);
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
        metadata: {},
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

    const recipients = envelope.recipients ?? [];
    const now = new Date();
    const anyDeclined = recipients.some(
      (recipient) => recipient.status === ContractEnvelopeRecipientStatus.DECLINED,
    );
    const allSigned =
      recipients.length > 0 &&
      recipients.every((recipient) => recipient.status === ContractEnvelopeRecipientStatus.SIGNED);

    if (anyDeclined) {
      envelope.status = ContractEnvelopeStatus.DECLINED;
      envelope.declinedAt = now;
      envelope.updatedByUserId = actorUserId;
      await this.envelopeRepository.save(envelope);
    } else if (allSigned) {
      envelope.status = ContractEnvelopeStatus.COMPLETED;
      envelope.completedAt = now;
      envelope.updatedByUserId = actorUserId;
      await this.envelopeRepository.save(envelope);

      if (envelope.contractId) {
        const contract = await this.contractRepository.findOne({
          where: { id: envelope.contractId },
        });
        if (contract) {
          contract.status = ContractStatus.SIGNED;
          contract.signedAt = now;
          contract.updatedByUserId = actorUserId;
          await this.contractRepository.save(contract);

          const primaryRecipient = recipients.slice().sort((a, b) => a.sortOrder - b.sortOrder)[0];
          if (primaryRecipient) {
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

          await this.recordContractEvent(contract.id, 'contract.signed', 'control-plane-api', {
            actorUserId,
            envelopeId: envelope.id,
          });
        }
      }
    } else {
      envelope.status = ContractEnvelopeStatus.SENT;
      envelope.updatedByUserId = actorUserId;
      await this.envelopeRepository.save(envelope);
    }

    const refreshed = await this.envelopeRepository.findOne({
      where: { id: envelope.id },
      relations: ['recipients'],
    });
    if (!refreshed) {
      throw new NotFoundException({
        code: 'CONTRACT_ENVELOPE_NOT_FOUND',
        message: `Envelope ${envelopeId} was not found after status recalculation.`,
      });
    }

    return this.toEnvelopeResponse(refreshed);
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
              '',
              'Use this OTP in the signing flow to verify your identity.',
            ].join('\n'),
            html: [
              `<p>Hello ${this.escapeHtml(recipient.fullName)},</p>`,
              '<p>You have a contract pending signature.</p>',
              `<p><strong>Envelope ID:</strong> ${this.escapeHtml(envelope.id)}</p>`,
              `<p><strong>OTP Code:</strong> ${this.escapeHtml(otpCode)}</p>`,
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
