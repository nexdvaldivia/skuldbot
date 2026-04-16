import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  ContractLegalInfoResponseDto,
  ContractSignatoryResponseDto,
  CreateContractSignatoryDto,
  UpdateContractLegalInfoDto,
  UpdateContractSignatoryDto,
} from './dto/legal.dto';
import { ContractLegalInfo } from './entities/contract-legal-info.entity';
import { ContractSignatory } from './entities/contract-signatory.entity';

@Injectable()
export class ContractLegalService {
  constructor(
    @InjectRepository(ContractLegalInfo)
    private readonly legalInfoRepository: Repository<ContractLegalInfo>,
    @InjectRepository(ContractSignatory)
    private readonly signatoryRepository: Repository<ContractSignatory>,
  ) {}

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

  async upsertSignatory(
    dto: CreateContractSignatoryDto,
    currentUser: User,
  ): Promise<ContractSignatoryResponseDto> {
    let signatory = await this.signatoryRepository.findOne({
      where: { email: dto.email.trim().toLowerCase() },
    });

    if (!signatory) {
      signatory = this.signatoryRepository.create({
        fullName: dto.fullName.trim(),
        email: dto.email.trim().toLowerCase(),
        title: dto.title?.trim() || null,
        isActive: dto.isActive ?? true,
        isDefault: dto.isDefault ?? false,
        policies: dto.policies ?? {},
        metadata: dto.metadata ?? {},
        createdByUserId: currentUser.id,
        updatedByUserId: currentUser.id,
      });
    } else {
      signatory.fullName = dto.fullName.trim();
      signatory.title = dto.title?.trim() || null;
      signatory.isActive = dto.isActive ?? signatory.isActive;
      signatory.isDefault = dto.isDefault ?? signatory.isDefault;
      signatory.policies = {
        ...(signatory.policies ?? {}),
        ...(dto.policies ?? {}),
      };
      signatory.metadata = {
        ...(signatory.metadata ?? {}),
        ...(dto.metadata ?? {}),
      };
      signatory.updatedByUserId = currentUser.id;
    }

    if (signatory.isDefault) {
      await this.clearDefaultSignatory(signatory.id);
    }

    const saved = await this.signatoryRepository.save(signatory);
    return this.toSignatoryResponse(saved);
  }

  async updateSignatory(
    signatoryId: string,
    dto: UpdateContractSignatoryDto,
    currentUser: User,
  ): Promise<ContractSignatoryResponseDto> {
    const signatory = await this.signatoryRepository.findOne({ where: { id: signatoryId } });
    if (!signatory) {
      throw new Error(`Contract signatory ${signatoryId} was not found.`);
    }

    if (dto.fullName !== undefined) {
      signatory.fullName = dto.fullName.trim();
    }
    if (dto.email !== undefined) {
      signatory.email = dto.email.trim().toLowerCase();
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
    await this.signatoryRepository.delete({ id: signatoryId });
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
      policies: signatory.policies ?? {},
      metadata: signatory.metadata ?? {},
      createdAt: signatory.createdAt,
      updatedAt: signatory.updatedAt,
    };
  }
}
