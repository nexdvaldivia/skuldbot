import {
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { IntegrationType, StorageProvider } from '../common/interfaces/integration.interface';
import { ProviderFactoryService } from '../integrations/provider-factory.service';
import { resolveProviderChain } from '../integrations/provider-chain.util';
import { User } from '../users/entities/user.entity';
import {
  ContractSignatorySignatureResponseDto,
  ContractSignatorySignatureUploadUrlResponseDto,
  ContractLegalInfoResponseDto,
  ContractSignatoryResponseDto,
  CreateContractSignatoryDto,
  RequestContractSignatorySignatureUploadUrlDto,
  UploadContractSignatorySignatureDto,
  UpdateContractLegalInfoDto,
  UpdateContractSignatoryDto,
} from './dto/legal.dto';
import { ContractLegalInfo } from './entities/contract-legal-info.entity';
import { ContractSignatory } from './entities/contract-signatory.entity';

@Injectable()
export class ContractLegalService {
  private readonly storageProviderChain: string[];

  constructor(
    @InjectRepository(ContractLegalInfo)
    private readonly legalInfoRepository: Repository<ContractLegalInfo>,
    @InjectRepository(ContractSignatory)
    private readonly signatoryRepository: Repository<ContractSignatory>,
    private readonly providerFactory: ProviderFactoryService,
    private readonly configService: ConfigService,
  ) {
    this.storageProviderChain = resolveProviderChain(
      this.configService.get<string>('STORAGE_PROVIDER_CHAIN'),
      this.configService.get<string>('STORAGE_PROVIDER'),
      ['s3', 'azure-blob'],
    );
  }

  async getLegalInfo(): Promise<ContractLegalInfoResponseDto> {
    const info = await this.getOrCreateLegalInfo();
    return this.toLegalInfoResponse(info);
  }

  async updateLegalInfo(
    dto: UpdateContractLegalInfoDto,
    currentUser: User,
  ): Promise<ContractLegalInfoResponseDto> {
    const info = await this.getOrCreateLegalInfo();

    if (dto.legalName !== undefined) {
      info.legalName = dto.legalName.trim() || null;
    }
    if (dto.tradeName !== undefined) {
      info.tradeName = dto.tradeName.trim() || null;
    }
    if (dto.legalAddressLine1 !== undefined) {
      info.legalAddressLine1 = dto.legalAddressLine1.trim() || null;
    }
    if (dto.legalAddressLine2 !== undefined) {
      info.legalAddressLine2 = dto.legalAddressLine2.trim() || null;
    }
    if (dto.legalCity !== undefined) {
      info.legalCity = dto.legalCity.trim() || null;
    }
    if (dto.legalState !== undefined) {
      info.legalState = dto.legalState.trim() || null;
    }
    if (dto.legalPostalCode !== undefined) {
      info.legalPostalCode = dto.legalPostalCode.trim() || null;
    }
    if (dto.legalCountry !== undefined) {
      info.legalCountry = dto.legalCountry.trim() || null;
    }
    if (dto.representativeName !== undefined) {
      info.representativeName = dto.representativeName.trim() || null;
    }
    if (dto.representativeTitle !== undefined) {
      info.representativeTitle = dto.representativeTitle.trim() || null;
    }
    if (dto.representativeEmail !== undefined) {
      info.representativeEmail = dto.representativeEmail.trim().toLowerCase() || null;
    }
    if (dto.websiteUrl !== undefined) {
      info.websiteUrl = dto.websiteUrl.trim() || null;
    }
    if (dto.supportEmail !== undefined) {
      info.supportEmail = dto.supportEmail.trim().toLowerCase() || null;
    }
    if (dto.supportPhone !== undefined) {
      info.supportPhone = dto.supportPhone.trim() || null;
    }

    info.updatedByUserId = currentUser.id;
    info.metadata = {
      ...(info.metadata ?? {}),
      ...(dto.metadata ?? {}),
    };

    const saved = await this.legalInfoRepository.save(info);
    return this.toLegalInfoResponse(saved);
  }

  async listSignatories(onlyActive = false): Promise<ContractSignatoryResponseDto[]> {
    const signatories = await this.signatoryRepository.find({
      where: onlyActive ? { isActive: true } : {},
      order: {
        isDefault: 'DESC',
        fullName: 'ASC',
      },
    });

    return signatories.map((signatory) => this.toSignatoryResponse(signatory));
  }

  async getSignatoryById(signatoryId: string): Promise<ContractSignatoryResponseDto> {
    const signatory = await this.findSignatoryOrThrow(signatoryId);
    return this.toSignatoryResponse(signatory);
  }

  async createSignatory(
    dto: CreateContractSignatoryDto,
    currentUser: User,
  ): Promise<ContractSignatoryResponseDto> {
    const existing = await this.signatoryRepository.findOne({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (existing) {
      throw new ConflictException(
        `Contract signatory with email ${existing.email} already exists.`,
      );
    }

    const signatory = this.signatoryRepository.create({
      fullName: dto.fullName.trim(),
      email: dto.email.trim().toLowerCase(),
      title: dto.title?.trim() || null,
      isActive: dto.isActive ?? true,
      isDefault: dto.isDefault ?? false,
      policies: dto.policies ?? {},
      metadata: dto.metadata ?? {},
      createdByUserId: currentUser.id,
      updatedByUserId: currentUser.id,
      signatureStorageKey: null,
      signatureContentType: null,
      signatureSha256: null,
      signatureUploadedAt: null,
    });

    if (signatory.isDefault) {
      await this.clearDefaultSignatory(signatory.id);
    }

    const saved = await this.signatoryRepository.save(signatory);
    return this.toSignatoryResponse(saved);
  }

  async upsertSignatory(
    dto: CreateContractSignatoryDto,
    currentUser: User,
  ): Promise<ContractSignatoryResponseDto> {
    const existing = await this.signatoryRepository.findOne({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (!existing) {
      return this.createSignatory(dto, currentUser);
    }

    return this.updateSignatory(existing.id, dto, currentUser);
  }

  async bulkUpsertSignatories(
    dtos: CreateContractSignatoryDto[],
    currentUser: User,
  ): Promise<ContractSignatoryResponseDto[]> {
    const results: ContractSignatoryResponseDto[] = [];
    for (const dto of dtos) {
      results.push(await this.upsertSignatory(dto, currentUser));
    }
    return results;
  }

  async updateSignatory(
    signatoryId: string,
    dto: UpdateContractSignatoryDto,
    currentUser: User,
  ): Promise<ContractSignatoryResponseDto> {
    const signatory = await this.findSignatoryOrThrow(signatoryId);

    if (dto.fullName !== undefined) {
      signatory.fullName = dto.fullName.trim();
    }
    if (dto.email !== undefined) {
      const normalized = dto.email.trim().toLowerCase();
      const duplicated = await this.signatoryRepository.findOne({ where: { email: normalized } });
      if (duplicated && duplicated.id !== signatory.id) {
        throw new ConflictException(`Contract signatory with email ${normalized} already exists.`);
      }
      signatory.email = normalized;
    }
    if (dto.title !== undefined) {
      signatory.title = dto.title.trim() || null;
    }
    if (dto.isActive !== undefined) {
      signatory.isActive = dto.isActive;
    }
    if (dto.isDefault !== undefined) {
      signatory.isDefault = dto.isDefault;
    }
    if (dto.policies) {
      signatory.policies = {
        ...(signatory.policies ?? {}),
        ...dto.policies,
      };
    }
    if (dto.metadata) {
      signatory.metadata = {
        ...(signatory.metadata ?? {}),
        ...dto.metadata,
      };
    }

    if (signatory.isDefault) {
      await this.clearDefaultSignatory(signatory.id);
    }

    signatory.updatedByUserId = currentUser.id;
    const saved = await this.signatoryRepository.save(signatory);
    return this.toSignatoryResponse(saved);
  }

  async removeSignatory(signatoryId: string): Promise<void> {
    const signatory = await this.findSignatoryOrThrow(signatoryId);
    if (signatory.signatureStorageKey) {
      await this.providerFactory.executeWithFallback<StorageProvider, void>(
        IntegrationType.STORAGE,
        'delete',
        async (provider) => provider.delete(signatory.signatureStorageKey as string),
        {
          providerChain: this.storageProviderChain,
        },
      );
    }
    await this.signatoryRepository.delete({ id: signatoryId });
  }

  async requestSignatorySignatureUploadUrl(
    signatoryId: string,
    dto: RequestContractSignatorySignatureUploadUrlDto,
  ): Promise<ContractSignatorySignatureUploadUrlResponseDto> {
    await this.findSignatoryOrThrow(signatoryId);
    const key = this.buildSignatureStorageKey(signatoryId, dto.contentType);
    const { result } = await this.providerFactory.executeWithFallback<StorageProvider, string>(
      IntegrationType.STORAGE,
      'getSignedUrl',
      async (provider) => provider.getSignedUrl(key, 900),
      {
        providerChain: this.storageProviderChain,
      },
    );
    return {
      key,
      uploadUrl: result,
      expiresInSeconds: 900,
    };
  }

  async uploadSignatorySignature(
    signatoryId: string,
    dto: UploadContractSignatorySignatureDto,
    currentUser: User,
  ): Promise<ContractSignatorySignatureResponseDto> {
    const signatory = await this.findSignatoryOrThrow(signatoryId);
    const contentType = this.normalizeSignatureContentType(dto.contentType);
    const buffer = Buffer.from(dto.contentBase64, 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      throw new PayloadTooLargeException('Signature payload exceeds 2MB limit.');
    }

    const key = this.buildSignatureStorageKey(signatoryId, contentType);
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    await this.providerFactory.executeWithFallback<StorageProvider, unknown>(
      IntegrationType.STORAGE,
      'upload',
      async (provider) =>
        provider.upload({
          key,
          body: buffer,
          contentType,
          metadata: {
            signatoryId,
            uploadedBy: currentUser.id,
            sha256,
          },
        }),
      {
        providerChain: this.storageProviderChain,
      },
    );

    if (signatory.signatureStorageKey && signatory.signatureStorageKey !== key) {
      await this.providerFactory.executeWithFallback<StorageProvider, void>(
        IntegrationType.STORAGE,
        'delete',
        async (provider) => provider.delete(signatory.signatureStorageKey as string),
        {
          providerChain: this.storageProviderChain,
        },
      );
    }

    signatory.signatureStorageKey = key;
    signatory.signatureContentType = contentType;
    signatory.signatureSha256 = sha256;
    signatory.signatureUploadedAt = new Date();
    signatory.updatedByUserId = currentUser.id;
    await this.signatoryRepository.save(signatory);

    return this.getSignatorySignature(signatoryId);
  }

  async getSignatorySignature(signatoryId: string): Promise<ContractSignatorySignatureResponseDto> {
    const signatory = await this.findSignatoryOrThrow(signatoryId);
    if (!signatory.signatureStorageKey) {
      return {
        signatoryId: signatory.id,
        hasSignature: false,
        contentType: null,
        uploadedAt: null,
        signatureUrl: null,
      };
    }

    const { result } = await this.providerFactory.executeWithFallback<StorageProvider, string>(
      IntegrationType.STORAGE,
      'getSignedUrl',
      async (provider) => provider.getSignedUrl(signatory.signatureStorageKey as string, 900),
      {
        providerChain: this.storageProviderChain,
      },
    );

    return {
      signatoryId: signatory.id,
      hasSignature: true,
      contentType: signatory.signatureContentType,
      uploadedAt: signatory.signatureUploadedAt,
      signatureUrl: result,
    };
  }

  async removeSignatorySignature(
    signatoryId: string,
    currentUser: User,
  ): Promise<ContractSignatorySignatureResponseDto> {
    const signatory = await this.findSignatoryOrThrow(signatoryId);
    if (signatory.signatureStorageKey) {
      await this.providerFactory.executeWithFallback<StorageProvider, void>(
        IntegrationType.STORAGE,
        'delete',
        async (provider) => provider.delete(signatory.signatureStorageKey as string),
        {
          providerChain: this.storageProviderChain,
        },
      );
    }

    signatory.signatureStorageKey = null;
    signatory.signatureContentType = null;
    signatory.signatureSha256 = null;
    signatory.signatureUploadedAt = null;
    signatory.updatedByUserId = currentUser.id;
    await this.signatoryRepository.save(signatory);
    return this.getSignatorySignature(signatoryId);
  }

  async buildLegalVariableContext(): Promise<Record<string, string>> {
    const info = await this.getOrCreateLegalInfo();
    const signatory = await this.signatoryRepository.findOne({
      where: { isActive: true, isDefault: true },
      order: { updatedAt: 'DESC' },
    });

    return {
      skuld_legal_name: info.legalName ?? '',
      skuld_trade_name: info.tradeName ?? '',
      skuld_legal_address_line1: info.legalAddressLine1 ?? '',
      skuld_legal_address_line2: info.legalAddressLine2 ?? '',
      skuld_legal_city: info.legalCity ?? '',
      skuld_legal_state: info.legalState ?? '',
      skuld_legal_postal_code: info.legalPostalCode ?? '',
      skuld_legal_country: info.legalCountry ?? '',
      skuld_representative_name: signatory?.fullName ?? info.representativeName ?? '',
      skuld_representative_title: signatory?.title ?? info.representativeTitle ?? '',
      skuld_representative_email: signatory?.email ?? info.representativeEmail ?? '',
      skuld_support_email: info.supportEmail ?? '',
      skuld_support_phone: info.supportPhone ?? '',
      skuld_website_url: info.websiteUrl ?? '',
    };
  }

  private async getOrCreateLegalInfo(): Promise<ContractLegalInfo> {
    let info = await this.legalInfoRepository.findOne({
      order: {
        createdAt: 'ASC',
      },
    });

    if (!info) {
      info = this.legalInfoRepository.create({
        legalName: 'Skuld LLC',
        tradeName: 'SkuldBot',
        legalAddressLine1: null,
        legalAddressLine2: null,
        legalCity: null,
        legalState: null,
        legalPostalCode: null,
        legalCountry: null,
        representativeName: null,
        representativeTitle: null,
        representativeEmail: null,
        websiteUrl: null,
        supportEmail: null,
        supportPhone: null,
        metadata: {},
      });
      info = await this.legalInfoRepository.save(info);
    }

    return info;
  }

  private async clearDefaultSignatory(excludedSignatoryId: string): Promise<void> {
    const defaults = await this.signatoryRepository.find({ where: { isDefault: true } });
    const toUpdate = defaults.filter((item) => item.id !== excludedSignatoryId);
    if (toUpdate.length === 0) {
      return;
    }

    for (const signatory of toUpdate) {
      signatory.isDefault = false;
    }
    await this.signatoryRepository.save(toUpdate);
  }

  private toLegalInfoResponse(info: ContractLegalInfo): ContractLegalInfoResponseDto {
    return {
      id: info.id,
      legalName: info.legalName,
      tradeName: info.tradeName,
      legalAddressLine1: info.legalAddressLine1,
      legalAddressLine2: info.legalAddressLine2,
      legalCity: info.legalCity,
      legalState: info.legalState,
      legalPostalCode: info.legalPostalCode,
      legalCountry: info.legalCountry,
      representativeName: info.representativeName,
      representativeTitle: info.representativeTitle,
      representativeEmail: info.representativeEmail,
      websiteUrl: info.websiteUrl,
      supportEmail: info.supportEmail,
      supportPhone: info.supportPhone,
      metadata: info.metadata ?? {},
      updatedAt: info.updatedAt,
    };
  }

  private toSignatoryResponse(signatory: ContractSignatory): ContractSignatoryResponseDto {
    return {
      id: signatory.id,
      fullName: signatory.fullName,
      email: signatory.email,
      title: signatory.title,
      isActive: signatory.isActive,
      isDefault: signatory.isDefault,
      hasSignature: Boolean(signatory.signatureStorageKey),
      signatureContentType: signatory.signatureContentType,
      signatureUploadedAt: signatory.signatureUploadedAt,
      policies: signatory.policies ?? {},
      metadata: signatory.metadata ?? {},
      createdAt: signatory.createdAt,
      updatedAt: signatory.updatedAt,
    };
  }

  private async findSignatoryOrThrow(signatoryId: string): Promise<ContractSignatory> {
    const signatory = await this.signatoryRepository.findOne({ where: { id: signatoryId } });
    if (!signatory) {
      throw new NotFoundException(`Contract signatory ${signatoryId} was not found.`);
    }
    return signatory;
  }

  private buildSignatureStorageKey(signatoryId: string, contentType?: string): string {
    const extension = this.resolveSignatureExtension(contentType);
    return `contracts/signatories/${signatoryId}/signature-${Date.now()}.${extension}`;
  }

  private normalizeSignatureContentType(contentType?: string): string {
    const normalized = contentType?.trim().toLowerCase();
    if (!normalized) {
      return 'image/png';
    }

    const allowed = new Set(['image/png', 'image/jpeg', 'image/svg+xml']);
    if (!allowed.has(normalized)) {
      throw new ConflictException(`Unsupported signature content type: ${normalized}`);
    }
    return normalized;
  }

  private resolveSignatureExtension(contentType?: string): string {
    const normalized = this.normalizeSignatureContentType(contentType);
    if (normalized === 'image/jpeg') {
      return 'jpg';
    }
    if (normalized === 'image/svg+xml') {
      return 'svg';
    }
    return 'png';
  }
}
