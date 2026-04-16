import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt, createHash, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { EmailProvider, IntegrationType } from '../common/interfaces/integration.interface';
import { ProviderFactoryService } from '../integrations/provider-factory.service';
import { resolveProviderChain } from '../integrations/provider-chain.util';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { assertClientBoundary, resolveEffectiveClientScope } from './contracts-access.util';
import {
  ContractAcceptanceResponseDto,
  ContractEnvelopeResponseDto,
  ContractEnvelopeRecipientResponseDto,
  DeclineEnvelopeRecipientDto,
  ListContractAcceptancesQueryDto,
  ListSentContractsQueryDto,
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
    await this.ensureClientExists(dto.clientId);
    assertClientBoundary(dto.clientId, currentUser);
    await this.ensureTenantBelongsToClient(dto.tenantId, dto.clientId);

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

    const envelope = await this.envelopeRepository.save(
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
        createdByUserId: currentUser.id,
        updatedByUserId: currentUser.id,
        metadata: {
          source: 'contracts.template.send',
          templateKey: templateVersion.template.templateKey,
        },
      }),
    );

    contract.envelopeId = envelope.id;
    await this.contractRepository.save(contract);

    const recipients: ContractEnvelopeRecipient[] = [];
    for (const signer of signers) {
      const otpCode = this.generateOtpCode();
      const recipient = this.envelopeRecipientRepository.create({
        envelopeId: envelope.id,
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
      recipients.push(savedRecipient);

      await this.sendEnvelopeEmail(envelope, savedRecipient, otpCode);
    }

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
                acceptanceMethod: ContractAcceptanceMethod.ESIGN,
                ipAddress: primaryRecipient.ipAddress ?? '0.0.0.0',
                userAgent: primaryRecipient.userAgent,
                acceptedAt: now,
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

  private async ensureClientExists(clientId: string): Promise<void> {
    const exists = await this.clientRepository.exist({ where: { id: clientId } });
    if (!exists) {
      throw new BadRequestException({
        code: 'CLIENT_NOT_FOUND',
        message: `Client ${clientId} does not exist.`,
      });
    }
  }

  private async ensureTenantBelongsToClient(
    tenantId: string | undefined,
    clientId: string,
  ): Promise<void> {
    if (!tenantId) {
      return;
    }

    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new BadRequestException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant ${tenantId} does not exist.`,
      });
    }

    if (tenant.clientId !== clientId) {
      throw new BadRequestException({
        code: 'TENANT_CLIENT_MISMATCH',
        message: `Tenant ${tenantId} is not owned by client ${clientId}.`,
      });
    }
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
      acceptanceMethod: acceptance.acceptanceMethod,
      ipAddress: acceptance.ipAddress,
      userAgent: acceptance.userAgent,
      acceptedAt: acceptance.acceptedAt,
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
