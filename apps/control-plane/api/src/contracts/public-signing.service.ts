import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import {
  IntegrationType,
  SmsProvider,
  StorageProvider,
} from '../common/interfaces/integration.interface';
import { ProviderFactoryService } from '../integrations/provider-factory.service';
import { resolveProviderChain } from '../integrations/provider-chain.util';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { ContractSigningService } from './contract-signing.service';
import {
  PublicDeclineRequestDto,
  PublicDeclineResponseDto,
  PublicMarkViewedResponseDto,
  PublicOtpSimpleResponseDto,
  PublicOtpStatusResponseDto,
  PublicRequestEmailOtpResponseDto,
  PublicRequestSmsOtpDto,
  PublicRequestSmsOtpResponseDto,
  PublicSignRequestDto,
  PublicSignResponseDto,
  PublicSigningDocumentDto,
  PublicSigningPageResponseDto,
  PublicSigningRecipientDto,
  PublicSigningOtpStatusDto,
  PublicVerifyOtpDto,
  UpdatePublicClientInfoDto,
} from './dto/public-signing.dto';
import {
  ContractEnvelopeRecipientStatus,
  ContractEnvelopeStatus,
} from './entities/contract-domain.enums';
import { ContractAcceptance } from './entities/contract-acceptance.entity';
import { ContractEnvelopeEvent } from './entities/contract-envelope-event.entity';
import { ContractEnvelopeRecipient } from './entities/contract-envelope-recipient.entity';
import { ContractEnvelope } from './entities/contract-envelope.entity';
import { SigningDocument } from './entities/signing-document.entity';
import { Client } from '../clients/entities/client.entity';
import {
  DeclineEnvelopeRecipientDto,
  SignEnvelopeRecipientDto,
  VerifyEnvelopeOtpDto,
} from './dto/signing.dto';
import { PdfService } from './pdf.service';

type PublicSigningContext = {
  recipient: ContractEnvelopeRecipient;
  envelope: ContractEnvelope;
};

type PublicDownloadResult = {
  buffer: Buffer;
  fileName: string;
  contentDisposition: 'inline' | 'attachment';
  contentType: string;
  headers: Record<string, string>;
};

@Injectable()
export class PublicSigningService {
  private readonly storageProviderChain: string[];
  private readonly smsProviderChain: string[];
  private readonly otpSecretPepper: string;
  private static readonly OTP_REQUEST_LIMIT_PER_HOUR = 5;

  constructor(
    @InjectRepository(ContractEnvelopeRecipient)
    private readonly envelopeRecipientRepository: Repository<ContractEnvelopeRecipient>,
    @InjectRepository(ContractEnvelope)
    private readonly envelopeRepository: Repository<ContractEnvelope>,
    @InjectRepository(ContractAcceptance)
    private readonly acceptanceRepository: Repository<ContractAcceptance>,
    @InjectRepository(ContractEnvelopeEvent)
    private readonly envelopeEventRepository: Repository<ContractEnvelopeEvent>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly contractSigningService: ContractSigningService,
    private readonly providerFactory: ProviderFactoryService,
    private readonly pdfService: PdfService,
    private readonly configService: ConfigService,
  ) {
    this.storageProviderChain = resolveProviderChain(
      this.configService.get<string>('STORAGE_PROVIDER_CHAIN'),
      this.configService.get<string>('STORAGE_PROVIDER'),
      ['s3', 'azure-blob'],
    );
    this.smsProviderChain = resolveProviderChain(
      this.configService.get<string>('SMS_PROVIDER_CHAIN'),
      this.configService.get<string>('SMS_PROVIDER'),
      ['noop-sms'],
    );

    const configuredSecret =
      this.configService.get<string>('CONTRACT_SIGNING_OTP_SECRET')?.trim() ||
      this.configService.get<string>('JWT_SECRET')?.trim() ||
      '';
    this.otpSecretPepper = configuredSecret || 'change-this-secret';
  }

  async getSigningPage(token: string): Promise<PublicSigningPageResponseDto> {
    const { envelope, recipient } = await this.resolveSigningContext(token);
    const now = Date.now();
    const isExpired = this.isEnvelopeExpired(envelope, recipient, now);
    const otpStatus = this.resolveOtpStatus(recipient, envelope);

    return {
      envelopeId: envelope.id,
      subject: envelope.subject,
      status: envelope.status,
      expiresAt: envelope.expiresAt,
      sentAt: envelope.sentAt,
      recipient: this.toPublicRecipient(recipient, false),
      otherRecipients: (envelope.recipients ?? [])
        .filter((entry) => entry.id !== recipient.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((entry) => this.toPublicRecipient(entry, true)),
      documents: (envelope.documents ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((document) => this.toPublicDocument(token, document)),
      canSign:
        !isExpired &&
        otpStatus.canSign &&
        recipient.status !== ContractEnvelopeRecipientStatus.SIGNED &&
        recipient.status !== ContractEnvelopeRecipientStatus.DECLINED &&
        envelope.status !== ContractEnvelopeStatus.CANCELLED &&
        envelope.status !== ContractEnvelopeStatus.COMPLETED &&
        envelope.status !== ContractEnvelopeStatus.DECLINED,
      alreadySigned: recipient.status === ContractEnvelopeRecipientStatus.SIGNED,
      alreadyDeclined: recipient.status === ContractEnvelopeRecipientStatus.DECLINED,
      isExpired,
      otpStatus,
      clientInfo: await this.getClientInfo(envelope.clientId),
    };
  }

  async markViewed(
    token: string,
    ipAddress: string,
    userAgent: string | null,
  ): Promise<PublicMarkViewedResponseDto> {
    const { recipient } = await this.resolveSigningContext(token);
    const now = new Date();
    recipient.viewedAt = recipient.viewedAt ?? now;
    if (
      recipient.status === ContractEnvelopeRecipientStatus.PENDING ||
      recipient.status === ContractEnvelopeRecipientStatus.SENT
    ) {
      recipient.status = ContractEnvelopeRecipientStatus.VIEWED;
    }
    recipient.ipAddress = ipAddress;
    recipient.userAgent = userAgent;
    recipient.metadata = {
      ...(recipient.metadata ?? {}),
      publicViewedAt: now.toISOString(),
    };
    await this.envelopeRecipientRepository.save(recipient);
    await this.recordPublicEnvelopeEvent(
      recipient.envelopeId,
      recipient.id,
      'public.page_viewed',
      ipAddress,
      userAgent,
      {},
    );
    return {
      success: true,
      viewedAt: recipient.viewedAt,
    };
  }

  async updateClientInfo(
    token: string,
    dto: UpdatePublicClientInfoDto,
  ): Promise<Record<string, unknown>> {
    const { envelope, recipient } = await this.resolveSigningContext(token);
    if (recipient.status === ContractEnvelopeRecipientStatus.SIGNED) {
      throw new BadRequestException({
        code: 'CONTRACT_PUBLIC_INFO_ALREADY_SIGNED',
        message: 'Cannot update client info after signing.',
      });
    }

    const client = await this.clientRepository.findOne({ where: { id: envelope.clientId } });
    if (!client) {
      throw new NotFoundException({
        code: 'CLIENT_NOT_FOUND',
        message: `Client ${envelope.clientId} was not found.`,
      });
    }

    if (dto.companyName) {
      client.name = dto.companyName.trim();
    }

    const currentMetadata = client.metadata ?? {};
    client.metadata = {
      ...currentMetadata,
      legalInfo: {
        ...(typeof currentMetadata['legalInfo'] === 'object' &&
        currentMetadata['legalInfo'] !== null
          ? (currentMetadata['legalInfo'] as Record<string, unknown>)
          : {}),
        ...this.pickDefinedFields(dto),
      },
    };
    await this.clientRepository.save(client);
    return (await this.getClientInfo(client.id)) ?? { companyName: client.name };
  }

  async getOtpStatus(token: string): Promise<PublicOtpStatusResponseDto> {
    const { envelope, recipient } = await this.resolveSigningContext(token);
    const otp = this.resolveOtpStatus(recipient, envelope);
    return {
      valid: true,
      emailRequired: otp.emailRequired,
      smsRequired: otp.smsRequired,
      emailVerified: otp.emailVerified,
      smsVerified: otp.smsVerified,
      canSign: otp.canSign,
      verificationWindowMinutes: otp.verificationWindowMinutes,
      error: null,
    };
  }

  async requestEmailOtp(
    token: string,
    ipAddress: string,
    userAgent: string | null,
  ): Promise<PublicRequestEmailOtpResponseDto> {
    const { envelope, recipient } = await this.resolveSigningContext(token);
    this.assertOtpRequestRateLimit(recipient);
    await this.envelopeRecipientRepository.save(recipient);
    const actor = this.createPublicActor(envelope.clientId);
    await this.contractSigningService.resendEnvelope(
      envelope.id,
      { recipientId: recipient.id },
      actor,
    );

    const updatedRecipient = await this.envelopeRecipientRepository.findOne({
      where: { id: recipient.id },
    });
    if (!updatedRecipient) {
      throw new NotFoundException({
        code: 'CONTRACT_RECIPIENT_NOT_FOUND',
        message: `Recipient ${recipient.id} was not found after OTP resend.`,
      });
    }
    updatedRecipient.ipAddress = ipAddress;
    updatedRecipient.userAgent = userAgent;
    await this.envelopeRecipientRepository.save(updatedRecipient);
    await this.recordPublicEnvelopeEvent(
      envelope.id,
      updatedRecipient.id,
      'public.otp_requested',
      ipAddress,
      userAgent,
      { channel: 'email' },
    );

    return {
      success: true,
      message: 'Email verification code sent.',
      maskedEmail: this.maskEmail(updatedRecipient.email),
    };
  }

  async verifyEmailOtp(
    token: string,
    dto: PublicVerifyOtpDto,
    ipAddress: string,
    userAgent: string | null,
  ): Promise<PublicOtpSimpleResponseDto> {
    const { envelope, recipient } = await this.resolveSigningContext(token);
    const actor = this.createPublicActor(envelope.clientId);
    const verificationDto: VerifyEnvelopeOtpDto = { code: dto.code };
    try {
      await this.contractSigningService.verifyEnvelopeRecipientOtp(
        envelope.id,
        recipient.id,
        verificationDto,
        actor,
      );
    } catch (error) {
      await this.recordPublicEnvelopeEvent(
        envelope.id,
        recipient.id,
        'public.otp_failed',
        ipAddress,
        userAgent,
        { channel: 'email' },
      );
      throw error;
    }
    await this.recordPublicEnvelopeEvent(
      envelope.id,
      recipient.id,
      'public.otp_verified',
      ipAddress,
      userAgent,
      { channel: 'email' },
    );

    return {
      success: true,
      message: 'Email OTP verified.',
    };
  }

  async requestSmsOtp(
    token: string,
    dto: PublicRequestSmsOtpDto,
    ipAddress: string,
    userAgent: string | null,
  ): Promise<PublicRequestSmsOtpResponseDto> {
    const { recipient, envelope } = await this.resolveSigningContext(token);
    this.assertOtpRequestRateLimit(recipient);
    const code = this.generateOtpCode();
    const now = new Date();
    const expiresAt = this.resolveOtpExpiry(now);
    const normalizedPhone = dto.phone.trim();

    recipient.metadata = {
      ...(recipient.metadata ?? {}),
      publicSmsOtp: {
        phone: normalizedPhone,
        codeHash: this.hashOtpCode(code, normalizedPhone),
        expiresAt: expiresAt.toISOString(),
        attempts: 0,
        lockedAt: null,
        verifiedAt: null,
        requestedAt: now.toISOString(),
      },
      publicLastIpAddress: ipAddress,
      publicLastUserAgent: userAgent,
    };
    await this.envelopeRecipientRepository.save(recipient);

    await this.providerFactory.executeWithFallback<SmsProvider, unknown>(
      IntegrationType.SMS,
      'send',
      async (provider) =>
        provider.send({
          to: normalizedPhone,
          body: `Your Skuld signing OTP is ${code}. It expires in ${this.resolveOtpExpiryMinutes()} minutes.`,
        }),
      {
        tenantId: envelope.tenantId ?? undefined,
        providerChain: this.smsProviderChain,
      },
    );
    await this.recordPublicEnvelopeEvent(
      envelope.id,
      recipient.id,
      'public.otp_requested',
      ipAddress,
      userAgent,
      { channel: 'sms' },
    );

    return {
      success: true,
      message: 'SMS verification code sent.',
      maskedPhone: this.maskPhone(normalizedPhone),
    };
  }

  async verifySmsOtp(
    token: string,
    dto: PublicVerifyOtpDto,
    ipAddress: string,
    userAgent: string | null,
  ): Promise<PublicOtpSimpleResponseDto> {
    const { recipient, envelope } = await this.resolveSigningContext(token);
    const smsOtp = this.readSmsOtpState(recipient);
    if (!smsOtp) {
      throw new BadRequestException({
        code: 'CONTRACT_SMS_OTP_NOT_REQUESTED',
        message: 'SMS OTP has not been requested for this signing session.',
      });
    }

    const maxAttempts = this.resolveOtpMaxAttempts();
    if (smsOtp.lockedAt || smsOtp.attempts >= maxAttempts) {
      await this.recordPublicEnvelopeEvent(
        envelope.id,
        recipient.id,
        'public.otp_failed',
        ipAddress,
        userAgent,
        { channel: 'sms', reason: 'locked' },
      );
      throw new BadRequestException({
        code: 'CONTRACT_PUBLIC_OTP_LOCKED',
        message: 'SMS OTP is locked due to too many failed attempts.',
      });
    }

    if (new Date(smsOtp.expiresAt).getTime() < Date.now()) {
      await this.recordPublicEnvelopeEvent(
        envelope.id,
        recipient.id,
        'public.otp_failed',
        ipAddress,
        userAgent,
        { channel: 'sms', reason: 'expired' },
      );
      throw new BadRequestException({
        code: 'CONTRACT_SMS_OTP_EXPIRED',
        message: 'SMS OTP has expired. Request a new code.',
      });
    }

    const expectedHash = this.hashOtpCode(dto.code, smsOtp.phone);
    if (expectedHash !== smsOtp.codeHash) {
      const attempts = Number(smsOtp.attempts ?? 0) + 1;
      const lockedAt = attempts >= maxAttempts ? new Date().toISOString() : null;
      recipient.metadata = {
        ...(recipient.metadata ?? {}),
        publicSmsOtp: {
          ...smsOtp,
          attempts,
          lockedAt,
        },
      };
      await this.envelopeRecipientRepository.save(recipient);
      await this.recordPublicEnvelopeEvent(
        envelope.id,
        recipient.id,
        'public.otp_failed',
        ipAddress,
        userAgent,
        {
          channel: 'sms',
          attempts,
          locked: Boolean(lockedAt),
        },
      );
      if (lockedAt) {
        throw new BadRequestException({
          code: 'CONTRACT_PUBLIC_OTP_LOCKED',
          message: 'SMS OTP is locked due to too many failed attempts.',
        });
      }
      throw new BadRequestException({
        code: 'CONTRACT_SMS_OTP_INVALID',
        message: 'SMS OTP code is invalid.',
      });
    }

    recipient.metadata = {
      ...(recipient.metadata ?? {}),
      publicSmsOtp: {
        ...smsOtp,
        verifiedAt: new Date().toISOString(),
        attempts: 0,
        lockedAt: null,
      },
    };
    await this.envelopeRecipientRepository.save(recipient);
    await this.recordPublicEnvelopeEvent(
      envelope.id,
      recipient.id,
      'public.otp_verified',
      ipAddress,
      userAgent,
      { channel: 'sms' },
    );

    return {
      success: true,
      message: 'SMS OTP verified.',
    };
  }

  async sign(token: string, dto: PublicSignRequestDto): Promise<PublicSignResponseDto> {
    const { envelope, recipient } = await this.resolveSigningContext(token);
    const otpStatus = this.resolveOtpStatus(recipient, envelope);
    if (!otpStatus.canSign) {
      throw new BadRequestException({
        code: 'CONTRACT_PUBLIC_OTP_REQUIRED',
        message: 'Required verification factors are not completed.',
      });
    }

    const actor = this.createPublicActor(envelope.clientId);
    const signDto: SignEnvelopeRecipientDto = {
      signatureType: dto.signatureType,
      signatureValue: dto.signatureValue,
      ipAddress: dto.ipAddress,
      userAgent: dto.userAgent,
      evidence: dto.evidence,
    };
    const response = await this.contractSigningService.signEnvelopeRecipient(
      envelope.id,
      recipient.id,
      signDto,
      actor,
    );
    const updatedRecipient = response.recipients.find((entry) => entry.id === recipient.id) ?? null;
    await this.recordPublicEnvelopeEvent(
      envelope.id,
      recipient.id,
      'public.signed',
      dto.ipAddress,
      dto.userAgent ?? null,
      { signatureType: dto.signatureType },
    );

    return {
      success: true,
      message: 'Documents signed successfully.',
      envelopeCompleted: response.status === ContractEnvelopeStatus.COMPLETED,
      signedAt: updatedRecipient?.signedAt ?? null,
    };
  }

  async decline(token: string, dto: PublicDeclineRequestDto): Promise<PublicDeclineResponseDto> {
    const { envelope, recipient } = await this.resolveSigningContext(token);
    const actor = this.createPublicActor(envelope.clientId);
    const declineDto: DeclineEnvelopeRecipientDto = {
      reason: dto.reason,
      ipAddress: dto.ipAddress,
      userAgent: dto.userAgent,
    };
    const response = await this.contractSigningService.declineEnvelopeRecipient(
      envelope.id,
      recipient.id,
      declineDto,
      actor,
    );
    const updatedRecipient = response.recipients.find((entry) => entry.id === recipient.id) ?? null;
    await this.recordPublicEnvelopeEvent(
      envelope.id,
      recipient.id,
      'public.declined',
      dto.ipAddress,
      dto.userAgent ?? null,
      { reason: dto.reason ?? null },
    );
    return {
      success: true,
      message: 'You have declined to sign.',
      declinedAt: updatedRecipient?.declinedAt ?? null,
    };
  }

  async downloadPreviewPdf(
    token: string,
    documentId: string,
    download: boolean,
  ): Promise<PublicDownloadResult> {
    const { envelope } = await this.resolveSigningContext(token);
    const document = this.requireEnvelopeDocument(envelope, documentId);
    const fileName = `${this.toSafeFilename(document.name)}_preview.pdf`;

    if (
      document.content &&
      document.content.trim().length > 0 &&
      this.looksLikePdfContent(document.content)
    ) {
      return {
        buffer: this.decodePdfContent(document.content),
        fileName,
        contentDisposition: download ? 'attachment' : 'inline',
        contentType: 'application/pdf',
        headers: {
          'X-Document-Hash': document.contentHash,
        },
      };
    }

    if (envelope.contract?.pdfPath) {
      const buffer = await this.pdfService.downloadContractPdf(envelope.contract);
      return {
        buffer,
        fileName,
        contentDisposition: download ? 'attachment' : 'inline',
        contentType: 'application/pdf',
        headers: {
          'X-Document-Hash': document.contentHash,
        },
      };
    }

    throw new BadRequestException({
      code: 'CONTRACT_PUBLIC_PREVIEW_NOT_AVAILABLE',
      message: `Preview PDF is not available for document ${document.id}.`,
    });
  }

  async downloadFinalPdf(
    token: string,
    documentId: string,
    download: boolean,
  ): Promise<PublicDownloadResult> {
    const { envelope } = await this.resolveSigningContext(token);
    const document = this.requireEnvelopeDocument(envelope, documentId);
    const acceptance = await this.findLatestAcceptanceWithSignedPdf(envelope.id);
    if (!acceptance?.signedPdfUrl) {
      throw new NotFoundException({
        code: 'CONTRACT_PUBLIC_FINAL_PDF_NOT_FOUND',
        message: `Final signed PDF is not available for document ${document.id}.`,
      });
    }
    const buffer = await this.downloadFromStorage(
      acceptance.signedPdfUrl,
      envelope.tenantId ?? undefined,
    );
    return {
      buffer,
      fileName: `${this.toSafeFilename(document.name)}_signed.pdf`,
      contentDisposition: download ? 'attachment' : 'inline',
      contentType: 'application/pdf',
      headers: {
        'X-Signed-PDF-Hash': acceptance.signedPdfHash ?? '',
        'X-Document-Hash': document.contentHash,
      },
    };
  }

  async downloadSignedPdf(token: string, documentId: string): Promise<PublicDownloadResult> {
    const { recipient } = await this.resolveSigningContext(token);
    if (recipient.status !== ContractEnvelopeRecipientStatus.SIGNED) {
      throw new BadRequestException({
        code: 'CONTRACT_PUBLIC_SIGNED_PDF_NOT_ALLOWED',
        message: 'Signed PDF is only available after you sign the document.',
      });
    }
    return this.downloadFinalPdf(token, documentId, true);
  }

  private async resolveSigningContext(token: string): Promise<PublicSigningContext> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new BadRequestException({
        code: 'CONTRACT_PUBLIC_TOKEN_REQUIRED',
        message: 'Signing token is required.',
      });
    }

    const recipient = await this.envelopeRecipientRepository
      .createQueryBuilder('recipient')
      .where("recipient.metadata ->> 'publicSigningToken' = :token", { token: normalizedToken })
      .getOne();

    if (!recipient) {
      throw new NotFoundException({
        code: 'CONTRACT_PUBLIC_TOKEN_INVALID',
        message: 'Invalid or expired signing link.',
      });
    }

    const tokenExpiryRaw =
      typeof recipient.metadata?.['publicSigningTokenExpiresAt'] === 'string'
        ? (recipient.metadata['publicSigningTokenExpiresAt'] as string)
        : null;
    if (tokenExpiryRaw) {
      const expiresAtMs = new Date(tokenExpiryRaw).getTime();
      if (Number.isFinite(expiresAtMs) && expiresAtMs < Date.now()) {
        throw new BadRequestException({
          code: 'CONTRACT_PUBLIC_TOKEN_EXPIRED',
          message: 'Signing link has expired.',
        });
      }
    }

    const envelope = await this.envelopeRepository.findOne({
      where: { id: recipient.envelopeId },
      relations: ['recipients', 'documents', 'contract'],
    });
    if (!envelope) {
      throw new NotFoundException({
        code: 'CONTRACT_ENVELOPE_NOT_FOUND',
        message: `Envelope ${recipient.envelopeId} was not found.`,
      });
    }

    return {
      recipient,
      envelope,
    };
  }

  private resolveOtpStatus(
    recipient: ContractEnvelopeRecipient,
    envelope: ContractEnvelope,
  ): PublicSigningOtpStatusDto {
    const smsOtp = this.readSmsOtpState(recipient);
    const emailRequired = true;
    const smsRequired =
      Boolean((envelope.metadata ?? {})['requireSmsOtp']) ||
      Boolean((envelope.metadata ?? {})['smsOtpRequired']);
    const emailVerified = Boolean(recipient.otpVerifiedAt);
    const smsVerified = Boolean(smsOtp?.verifiedAt);
    const verificationWindowMinutes = this.resolveOtpExpiryMinutes();
    return {
      emailRequired,
      smsRequired,
      emailVerified,
      smsVerified,
      canSign: emailVerified && (!smsRequired || smsVerified),
      verificationWindowMinutes,
    };
  }

  private readSmsOtpState(recipient: ContractEnvelopeRecipient): {
    phone: string;
    codeHash: string;
    expiresAt: string;
    attempts: number;
    lockedAt: string | null;
    verifiedAt: string | null;
  } | null {
    const metadata = recipient.metadata ?? {};
    const otp = metadata['publicSmsOtp'];
    if (!otp || typeof otp !== 'object') {
      return null;
    }
    const payload = otp as Record<string, unknown>;
    if (
      typeof payload['phone'] !== 'string' ||
      typeof payload['codeHash'] !== 'string' ||
      typeof payload['expiresAt'] !== 'string'
    ) {
      return null;
    }
    return {
      phone: payload['phone'],
      codeHash: payload['codeHash'],
      expiresAt: payload['expiresAt'],
      attempts: Number(payload['attempts'] ?? 0),
      lockedAt: typeof payload['lockedAt'] === 'string' ? payload['lockedAt'] : null,
      verifiedAt: typeof payload['verifiedAt'] === 'string' ? payload['verifiedAt'] : null,
    };
  }

  private assertOtpRequestRateLimit(recipient: ContractEnvelopeRecipient): void {
    const limit = this.resolveOtpRequestLimitPerHour();
    const now = Date.now();
    const metadata = recipient.metadata ?? {};
    const rawRate = metadata['publicOtpRateLimit'];
    const rateState =
      rawRate && typeof rawRate === 'object' ? (rawRate as Record<string, unknown>) : {};
    const windowStartedAtRaw =
      typeof rateState['windowStartedAt'] === 'string'
        ? new Date(rateState['windowStartedAt']).getTime()
        : NaN;
    const countRaw = Number(rateState['count'] ?? 0);
    const windowActive =
      Number.isFinite(windowStartedAtRaw) && now - windowStartedAtRaw < 60 * 60 * 1000;
    const count = windowActive ? countRaw : 0;

    if (count >= limit) {
      throw new BadRequestException({
        code: 'CONTRACT_PUBLIC_OTP_RATE_LIMITED',
        message: `OTP request limit exceeded (${limit} per hour).`,
      });
    }

    recipient.metadata = {
      ...metadata,
      publicOtpRateLimit: {
        windowStartedAt: windowActive
          ? new Date(windowStartedAtRaw).toISOString()
          : new Date(now).toISOString(),
        count: count + 1,
        lastRequestedAt: new Date(now).toISOString(),
      },
    };
  }

  private async getClientInfo(clientId: string): Promise<Record<string, unknown> | null> {
    const client = await this.clientRepository.findOne({ where: { id: clientId } });
    if (!client) {
      return null;
    }
    const legalInfo =
      typeof client.metadata?.['legalInfo'] === 'object' && client.metadata['legalInfo'] !== null
        ? (client.metadata['legalInfo'] as Record<string, unknown>)
        : {};
    return {
      companyName: client.name,
      ...legalInfo,
    };
  }

  private createPublicActor(clientId: string): User {
    return {
      id: '00000000-0000-0000-0000-000000000000',
      email: 'public-signing@system.local',
      passwordHash: null,
      firstName: 'Public',
      lastName: 'Signer',
      role: UserRole.CLIENT_USER,
      status: UserStatus.ACTIVE,
      clientId,
      client: null,
      roles: [],
      lastLoginAt: null,
      lastLoginIp: null,
      loginCount: 0,
      passwordChangedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      emailVerified: true,
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
      avatarStorageKey: null,
      avatarContentType: null,
      avatarSha256: null,
      avatarUploadedAt: null,
      settings: {},
      metadata: {},
      createdAt: new Date(0),
      updatedAt: new Date(0),
      isSkuld: () => false,
      isClientAdmin: () => false,
    };
  }

  private toPublicRecipient(
    recipient: ContractEnvelopeRecipient,
    masked: boolean,
  ): PublicSigningRecipientDto {
    return {
      id: recipient.id,
      email: masked ? this.maskEmail(recipient.email) : recipient.email,
      fullName: recipient.fullName,
      roleLabel: recipient.roleLabel,
      status: recipient.status,
      sortOrder: recipient.sortOrder,
    };
  }

  private toPublicDocument(token: string, document: SigningDocument): PublicSigningDocumentDto {
    return {
      id: document.id,
      name: document.name,
      contentType: document.contentType,
      sortOrder: document.sortOrder,
      previewUrl: `/api/public/sign/${token}/documents/${document.id}/preview-pdf`,
      finalUrl: `/api/public/sign/${token}/documents/${document.id}/final-pdf`,
      signedUrl: `/api/public/sign/${token}/documents/${document.id}/signed-pdf`,
    };
  }

  private isEnvelopeExpired(
    envelope: ContractEnvelope,
    recipient: ContractEnvelopeRecipient,
    nowMs: number,
  ): boolean {
    const envelopeExpired = Boolean(envelope.expiresAt && envelope.expiresAt.getTime() < nowMs);
    const tokenExpiryRaw =
      typeof recipient.metadata?.['publicSigningTokenExpiresAt'] === 'string'
        ? (recipient.metadata['publicSigningTokenExpiresAt'] as string)
        : null;
    if (!tokenExpiryRaw) {
      return envelopeExpired;
    }
    const tokenExpired = new Date(tokenExpiryRaw).getTime() < nowMs;
    return envelopeExpired || tokenExpired;
  }

  private resolveOtpExpiryMinutes(): number {
    const rawMinutes = Number(
      this.configService.get<string>('CONTRACT_SIGNING_OTP_EXPIRY_MINUTES') ?? '15',
    );
    return Number.isFinite(rawMinutes) && rawMinutes > 0 ? Math.floor(rawMinutes) : 15;
  }

  private resolveOtpMaxAttempts(): number {
    const rawAttempts = Number(
      this.configService.get<string>('CONTRACT_SIGNING_OTP_MAX_ATTEMPTS') ?? '5',
    );
    return Number.isFinite(rawAttempts) && rawAttempts > 0 ? Math.floor(rawAttempts) : 5;
  }

  private resolveOtpRequestLimitPerHour(): number {
    const rawLimit = Number(
      this.configService.get<string>('CONTRACT_PUBLIC_OTP_REQUEST_LIMIT_PER_HOUR') ??
        String(PublicSigningService.OTP_REQUEST_LIMIT_PER_HOUR),
    );
    return Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.floor(rawLimit)
      : PublicSigningService.OTP_REQUEST_LIMIT_PER_HOUR;
  }

  private resolveOtpExpiry(from: Date): Date {
    const minutes = this.resolveOtpExpiryMinutes();
    return new Date(from.getTime() + minutes * 60 * 1000);
  }

  private requireEnvelopeDocument(envelope: ContractEnvelope, documentId: string): SigningDocument {
    const document = (envelope.documents ?? []).find((item) => item.id === documentId);
    if (!document) {
      throw new NotFoundException({
        code: 'CONTRACT_SIGNING_DOCUMENT_NOT_FOUND',
        message: `Document ${documentId} was not found for envelope ${envelope.id}.`,
      });
    }
    return document;
  }

  private async findLatestAcceptanceWithSignedPdf(
    envelopeId: string,
  ): Promise<ContractAcceptance | null> {
    return this.acceptanceRepository.findOne({
      where: {
        envelopeId,
        revokedAt: IsNull(),
      },
      order: {
        acceptedAt: 'DESC',
      },
    });
  }

  private async downloadFromStorage(key: string, tenantId?: string): Promise<Buffer> {
    const { result } = await this.providerFactory.executeWithFallback<StorageProvider, Buffer>(
      IntegrationType.STORAGE,
      'download',
      async (provider) => provider.download(key),
      {
        tenantId,
        providerChain: this.storageProviderChain,
      },
    );
    return result;
  }

  private looksLikePdfContent(content: string): boolean {
    return content.startsWith('JVBER') || content.includes('%PDF');
  }

  private decodePdfContent(content: string): Buffer {
    if (content.startsWith('%PDF')) {
      return Buffer.from(content, 'utf8');
    }
    return Buffer.from(content, 'base64');
  }

  private pickDefinedFields(dto: UpdatePublicClientInfoDto): Record<string, unknown> {
    const entries = Object.entries(dto).filter(([, value]) => value !== undefined);
    return Object.fromEntries(entries);
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!local || !domain) {
      return email;
    }
    if (local.length <= 2) {
      return `${local[0] ?? '*'}***@${domain}`;
    }
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
  }

  private maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) {
      return '***';
    }
    return `***${digits.slice(-4)}`;
  }

  private generateOtpCode(): string {
    return String(randomInt(100000, 1_000_000));
  }

  private hashOtpCode(code: string, recipientPhone: string): string {
    return createHash('sha256')
      .update(`${recipientPhone.toLowerCase()}::${code}::${this.otpSecretPepper}`)
      .digest('hex');
  }

  private async recordPublicEnvelopeEvent(
    envelopeId: string,
    recipientId: string,
    eventType: string,
    ipAddress: string | null | undefined,
    userAgent: string | null | undefined,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.envelopeEventRepository.save({
      envelopeId,
      recipientId,
      eventType,
      eventSource: 'public-signing-api',
      eventPayload: {
        ...payload,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });
  }

  private toSafeFilename(value: string): string {
    return value
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w.-]/g, '-');
  }
}
