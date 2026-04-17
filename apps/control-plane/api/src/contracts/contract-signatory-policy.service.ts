import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  ContractSignatoryPolicyListResponseDto,
  ContractSignatoryPolicyResponseDto,
  ContractSignatoryPolicyToggleResponseDto,
  ContractSignatoryResolutionPreviewRequestDto,
  ContractSignatoryResolutionPreviewResponseDto,
  CreateContractSignatoryPolicyDto,
  UpdateContractSignatoryPolicyDto,
} from './dto/signatory-policy.dto';
import { ContractSignatoryPolicy } from './entities/contract-signatory-policy.entity';
import { ContractSignatory } from './entities/contract-signatory.entity';
import { ContractTypeLookup } from './entities/contract-type-lookup.entity';

@Injectable()
export class ContractSignatoryPolicyService {
  constructor(
    @InjectRepository(ContractSignatoryPolicy)
    private readonly policyRepository: Repository<ContractSignatoryPolicy>,
    @InjectRepository(ContractSignatory)
    private readonly signatoryRepository: Repository<ContractSignatory>,
    @InjectRepository(ContractTypeLookup)
    private readonly contractTypeLookupRepository: Repository<ContractTypeLookup>,
  ) {}

  async listPolicies(
    contractType?: string,
    isActive?: boolean,
  ): Promise<ContractSignatoryPolicyListResponseDto> {
    const query = this.policyRepository
      .createQueryBuilder('policy')
      .leftJoinAndSelect('policy.signatory', 'signatory')
      .leftJoinAndSelect('policy.contractTypeLookup', 'contractTypeLookup')
      .where('1=1');

    if (contractType) {
      query.andWhere('policy.contractType = :contractType', {
        contractType: contractType.trim().toLowerCase(),
      });
    }

    if (isActive !== undefined) {
      query.andWhere('policy.isActive = :isActive', { isActive });
    }

    const policies = await query
      .orderBy('policy.contractType', 'ASC')
      .addOrderBy('policy.priority', 'ASC')
      .addOrderBy('policy.validFrom', 'DESC', 'NULLS LAST')
      .addOrderBy('policy.createdAt', 'DESC')
      .getMany();

    return {
      policies: policies.map((policy) => this.toPolicyResponse(policy)),
      total: policies.length,
    };
  }

  async listPolicyHistory(contractType?: string): Promise<ContractSignatoryPolicyListResponseDto> {
    return this.listPolicies(contractType, undefined);
  }

  async getPolicy(policyId: string): Promise<ContractSignatoryPolicyResponseDto> {
    const policy = await this.policyRepository.findOne({
      where: { id: policyId },
      relations: {
        signatory: true,
        contractTypeLookup: true,
      },
    });
    if (!policy) {
      throw new NotFoundException('Policy not found');
    }
    return this.toPolicyResponse(policy);
  }

  async createPolicy(
    dto: CreateContractSignatoryPolicyDto,
    currentUser: User,
  ): Promise<ContractSignatoryPolicyResponseDto> {
    const contractType = dto.contractType.trim().toLowerCase();
    await this.validateContractTypeExists(contractType);
    const signatory = await this.requireSignatory(dto.signatoryId);
    const validFrom = this.toDate(dto.validFrom);
    const validTo = this.toDate(dto.validTo);
    this.validateWindow(validFrom, validTo);

    const isActive = dto.isActive ?? true;
    const priority = dto.priority ?? 100;

    if (isActive && !signatory.isActive) {
      throw new BadRequestException('Cannot activate policy with an inactive signatory.');
    }

    if (isActive) {
      await this.assertNoActiveOverlap({
        contractType,
        priority,
        validFrom,
        validTo,
      });
    }

    const policy = this.policyRepository.create({
      contractType,
      signatoryId: signatory.id,
      priority,
      isActive,
      validFrom,
      validTo,
      notes: dto.notes?.trim() || null,
      createdByUserId: currentUser.id,
      updatedByUserId: currentUser.id,
    });
    const saved = await this.policyRepository.save(policy);
    return this.getPolicy(saved.id);
  }

  async updatePolicy(
    policyId: string,
    dto: UpdateContractSignatoryPolicyDto,
    currentUser: User,
  ): Promise<ContractSignatoryPolicyResponseDto> {
    const policy = await this.policyRepository.findOne({ where: { id: policyId } });
    if (!policy) {
      throw new NotFoundException('Policy not found');
    }

    const nextContractType = dto.contractType
      ? dto.contractType.trim().toLowerCase()
      : policy.contractType;
    const nextSignatoryId = dto.signatoryId ?? policy.signatoryId;
    const nextPriority = dto.priority ?? policy.priority;
    const nextIsActive = dto.isActive ?? policy.isActive;
    const nextValidFrom = dto.clearValidFrom
      ? null
      : dto.validFrom !== undefined
        ? this.toDate(dto.validFrom)
        : policy.validFrom;
    const nextValidTo = dto.clearValidTo
      ? null
      : dto.validTo !== undefined
        ? this.toDate(dto.validTo)
        : policy.validTo;
    const nextNotes = dto.clearNotes
      ? null
      : dto.notes !== undefined
        ? dto.notes.trim() || null
        : policy.notes;

    await this.validateContractTypeExists(nextContractType);
    const signatory = await this.requireSignatory(nextSignatoryId);
    this.validateWindow(nextValidFrom, nextValidTo);

    if (nextIsActive && !signatory.isActive) {
      throw new BadRequestException('Cannot activate policy with an inactive signatory.');
    }

    if (nextIsActive) {
      await this.assertNoActiveOverlap({
        contractType: nextContractType,
        priority: nextPriority,
        validFrom: nextValidFrom,
        validTo: nextValidTo,
        excludePolicyId: policy.id,
      });
    }

    policy.contractType = nextContractType;
    policy.signatoryId = nextSignatoryId;
    policy.priority = nextPriority;
    policy.isActive = nextIsActive;
    policy.validFrom = nextValidFrom;
    policy.validTo = nextValidTo;
    policy.notes = nextNotes;
    policy.updatedByUserId = currentUser.id;

    await this.policyRepository.save(policy);
    return this.getPolicy(policy.id);
  }

  async activatePolicy(
    policyId: string,
    currentUser: User,
  ): Promise<ContractSignatoryPolicyToggleResponseDto> {
    const policy = await this.setPolicyActive(policyId, true, currentUser.id);
    return {
      success: true,
      policy,
    };
  }

  async deactivatePolicy(
    policyId: string,
    currentUser: User,
  ): Promise<ContractSignatoryPolicyToggleResponseDto> {
    const policy = await this.setPolicyActive(policyId, false, currentUser.id);
    return {
      success: true,
      policy,
    };
  }

  async resolvePreview(
    dto: ContractSignatoryResolutionPreviewRequestDto,
  ): Promise<ContractSignatoryResolutionPreviewResponseDto> {
    const resolvedAt = new Date();
    const requireReady = dto.requireReady ?? true;
    let policyId: string | null = null;
    let source = 'default';
    let signatory: ContractSignatory | null = null;

    if (dto.overrideSignatoryId) {
      signatory = await this.requireSignatory(dto.overrideSignatoryId);
      source = 'override';
    } else if (dto.contractType) {
      const policy = await this.resolvePolicyForContractType(dto.contractType);
      if (policy) {
        policyId = policy.id;
        signatory = policy.signatory ?? (await this.requireSignatory(policy.signatoryId));
        source = 'policy';
      }
    }

    if (!signatory) {
      signatory = await this.signatoryRepository.findOne({
        where: {
          isDefault: true,
          isActive: true,
          deletedAt: IsNull(),
        },
        order: {
          updatedAt: 'DESC',
        },
      });
      source = signatory ? 'default' : 'none';
    }

    if (!signatory) {
      return {
        contractType: dto.contractType ?? null,
        overrideSignatoryId: dto.overrideSignatoryId ?? null,
        resolutionSource: source,
        policyId,
        resolvedAt,
        signatoryId: null,
        signatoryName: null,
        signatoryTitle: null,
        signatoryEmail: null,
        signatoryIsActive: null,
        hasSignature: null,
        signatureHash: null,
        ready: false,
        message: 'No eligible signatory found for resolution.',
      };
    }

    const ready = signatory.isActive && Boolean(signatory.signatureStorageKey);
    return {
      contractType: dto.contractType ?? null,
      overrideSignatoryId: dto.overrideSignatoryId ?? null,
      resolutionSource: source,
      policyId,
      resolvedAt,
      signatoryId: signatory.id,
      signatoryName: signatory.fullName,
      signatoryTitle: signatory.title,
      signatoryEmail: signatory.email,
      signatoryIsActive: signatory.isActive,
      hasSignature: Boolean(signatory.signatureStorageKey),
      signatureHash: signatory.signatureSha256,
      ready: requireReady ? ready : true,
      message: ready
        ? 'Signatory is ready for countersignature.'
        : 'Signatory is missing required readiness (active + signature).',
    };
  }

  private async setPolicyActive(
    policyId: string,
    isActive: boolean,
    updatedByUserId: string,
  ): Promise<ContractSignatoryPolicyResponseDto> {
    const policy = await this.policyRepository.findOne({ where: { id: policyId } });
    if (!policy) {
      throw new NotFoundException('Policy not found');
    }

    if (policy.isActive === isActive) {
      return this.getPolicy(policy.id);
    }

    if (isActive) {
      const signatory = await this.requireSignatory(policy.signatoryId);
      if (!signatory.isActive) {
        throw new BadRequestException('Cannot activate policy with an inactive signatory.');
      }
      await this.assertNoActiveOverlap({
        contractType: policy.contractType,
        priority: policy.priority,
        validFrom: policy.validFrom,
        validTo: policy.validTo,
        excludePolicyId: policy.id,
      });
    }

    policy.isActive = isActive;
    policy.updatedByUserId = updatedByUserId;
    await this.policyRepository.save(policy);
    return this.getPolicy(policy.id);
  }

  private async resolvePolicyForContractType(
    contractTypeInput: string,
  ): Promise<ContractSignatoryPolicy | null> {
    const contractType = contractTypeInput.trim().toLowerCase();
    const now = new Date();

    const policies = await this.policyRepository
      .createQueryBuilder('policy')
      .leftJoinAndSelect('policy.signatory', 'signatory')
      .where('policy.contractType = :contractType', { contractType })
      .andWhere('policy.isActive = true')
      .orderBy('policy.priority', 'ASC')
      .addOrderBy('policy.validFrom', 'DESC', 'NULLS LAST')
      .addOrderBy('policy.createdAt', 'DESC')
      .getMany();

    for (const policy of policies) {
      const startsOk = !policy.validFrom || policy.validFrom <= now;
      const endsOk = !policy.validTo || policy.validTo > now;
      if (!startsOk || !endsOk) {
        continue;
      }
      if (policy.signatory && policy.signatory.deletedAt) {
        continue;
      }
      return policy;
    }

    return null;
  }

  private async validateContractTypeExists(contractType: string): Promise<void> {
    const contractTypeLookup = await this.contractTypeLookupRepository.findOne({
      where: { code: contractType },
    });
    if (!contractTypeLookup) {
      throw new BadRequestException(`Contract type '${contractType}' does not exist.`);
    }
  }

  private async requireSignatory(signatoryId: string): Promise<ContractSignatory> {
    const signatory = await this.signatoryRepository.findOne({
      where: { id: signatoryId, deletedAt: IsNull() },
    });
    if (!signatory) {
      throw new BadRequestException('Signatory not found.');
    }
    return signatory;
  }

  private validateWindow(validFrom: Date | null, validTo: Date | null): void {
    if (validFrom && validTo && validTo <= validFrom) {
      throw new BadRequestException('validTo must be greater than validFrom.');
    }
  }

  private async assertNoActiveOverlap(params: {
    contractType: string;
    priority: number;
    validFrom: Date | null;
    validTo: Date | null;
    excludePolicyId?: string;
  }): Promise<void> {
    const query = this.policyRepository
      .createQueryBuilder('policy')
      .where('policy.contractType = :contractType', { contractType: params.contractType })
      .andWhere('policy.priority = :priority', { priority: params.priority })
      .andWhere('policy.isActive = true');

    if (params.excludePolicyId) {
      query.andWhere('policy.id != :excludePolicyId', { excludePolicyId: params.excludePolicyId });
    }

    const existingPolicies = await query.getMany();

    for (const existing of existingPolicies) {
      if (
        this.windowsOverlap(params.validFrom, params.validTo, existing.validFrom, existing.validTo)
      ) {
        throw new ConflictException(
          `Policy window overlaps with another active policy at the same contractType and priority (policyId=${existing.id}).`,
        );
      }
    }
  }

  private windowsOverlap(
    startA: Date | null,
    endA: Date | null,
    startB: Date | null,
    endB: Date | null,
  ): boolean {
    const minDate = new Date(-8640000000000000);
    const maxDate = new Date(8640000000000000);
    const normalizedStartA = startA ?? minDate;
    const normalizedEndA = endA ?? maxDate;
    const normalizedStartB = startB ?? minDate;
    const normalizedEndB = endB ?? maxDate;
    return normalizedStartA < normalizedEndB && normalizedStartB < normalizedEndA;
  }

  private toPolicyResponse(policy: ContractSignatoryPolicy): ContractSignatoryPolicyResponseDto {
    const signatory = policy.signatory;
    return {
      id: policy.id,
      contractType: policy.contractType,
      contractTypeName: policy.contractTypeLookup?.name ?? null,
      signatoryId: policy.signatoryId,
      priority: policy.priority,
      isActive: policy.isActive,
      validFrom: policy.validFrom,
      validTo: policy.validTo,
      notes: policy.notes,
      createdByUserId: policy.createdByUserId,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
      signatory: {
        id: signatory?.id ?? policy.signatoryId,
        name: signatory?.fullName ?? '',
        title: signatory?.title ?? null,
        email: signatory?.email ?? '',
        isActive: signatory?.isActive ?? false,
        isDefault: signatory?.isDefault ?? false,
        hasSignature: Boolean(signatory?.signatureStorageKey),
      },
    };
  }

  private toDate(value?: string): Date | null {
    if (!value) {
      return null;
    }
    return new Date(value);
  }
}
