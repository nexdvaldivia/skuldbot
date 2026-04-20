import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import {
  assertClientBoundary,
  ensureClientExists,
  ensureTenantBelongsToClient,
  resolveEffectiveClientScope,
} from './contracts-access.util';
import {
  CancelContractDto,
  ContractResponseDto,
  ContractSignerResponseDto,
  CreateContractDto,
  ListContractsQueryDto,
  SubmitContractDto,
  UpdateContractDraftDto,
  UpdateSignerStatusDto,
} from './dto/contract.dto';
import { ContractEvent } from './entities/contract-event.entity';
import { ContractSigner, ContractSignerStatus } from './entities/contract-signer.entity';
import { Contract, ContractStatus } from './entities/contract.entity';
import { PdfService } from './pdf.service';

@Injectable()
export class ContractsService {
  constructor(
    @InjectRepository(Contract)
    private readonly contractRepository: Repository<Contract>,
    @InjectRepository(ContractSigner)
    private readonly signerRepository: Repository<ContractSigner>,
    @InjectRepository(ContractEvent)
    private readonly eventRepository: Repository<ContractEvent>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly pdfService: PdfService,
  ) {}

  async listContracts(
    query: ListContractsQueryDto,
    currentUser: User,
  ): Promise<ContractResponseDto[]> {
    const qb = this.contractRepository
      .createQueryBuilder('contract')
      .leftJoinAndSelect('contract.signers', 'signers');

    const effectiveClientId = resolveEffectiveClientScope(query.clientId, currentUser);
    if (effectiveClientId) {
      qb.andWhere('contract.clientId = :clientId', { clientId: effectiveClientId });
    }

    if (query.tenantId) {
      qb.andWhere('contract.tenantId = :tenantId', { tenantId: query.tenantId });
    }

    if (query.status) {
      qb.andWhere('contract.status = :status', { status: query.status });
    }

    const contracts = await qb
      .orderBy('contract.createdAt', 'DESC')
      .addOrderBy('signers.sortOrder', 'ASC')
      .getMany();

    return contracts.map((contract) => this.toResponse(contract));
  }

  async getById(contractId: string, currentUser: User): Promise<ContractResponseDto> {
    const contract = await this.contractRepository.findOne({
      where: { id: contractId },
      relations: ['signers'],
    });

    if (!contract) {
      throw new NotFoundException({
        code: 'CONTRACT_NOT_FOUND',
        message: `Contract ${contractId} was not found.`,
      });
    }

    assertClientBoundary(contract.clientId, currentUser);

    return this.toResponse(contract);
  }

  async createContract(dto: CreateContractDto, currentUser: User): Promise<ContractResponseDto> {
    await ensureClientExists(this.clientRepository, dto.clientId);
    assertClientBoundary(dto.clientId, currentUser);
    await ensureTenantBelongsToClient(this.tenantRepository, dto.tenantId, dto.clientId);

    const contract = this.contractRepository.create({
      clientId: dto.clientId,
      tenantId: dto.tenantId ?? null,
      title: dto.title.trim(),
      templateKey: dto.templateKey.trim(),
      version: 1,
      status: ContractStatus.DRAFT,
      variables: dto.variables ?? {},
      documentJson: dto.documentJson ?? {},
      renderedHtml: null,
      pdfPath: null,
      envelopeProvider: null,
      envelopeId: null,
      signedAt: null,
      createdByUserId: currentUser.id,
      updatedByUserId: currentUser.id,
      metadata: {},
    });

    const saved = await this.contractRepository.save(contract);

    const signers = dto.signers.map((signer, index) =>
      this.signerRepository.create({
        contractId: saved.id,
        email: signer.email.trim().toLowerCase(),
        fullName: signer.fullName.trim(),
        roleLabel: signer.roleLabel.trim(),
        sortOrder: index,
        status: ContractSignerStatus.PENDING,
        signatureAudit: {},
        metadata: {},
      }),
    );
    await this.signerRepository.save(signers);

    await this.recordEvent(saved.id, 'contract.created', 'control-plane-api', {
      actorUserId: currentUser.id,
      signerCount: signers.length,
    });

    return this.getById(saved.id, currentUser);
  }

  async submitForSignature(
    contractId: string,
    dto: SubmitContractDto,
    currentUser: User,
  ): Promise<ContractResponseDto> {
    const contract = await this.findContractForUpdate(contractId);

    if (
      ![ContractStatus.DRAFT, ContractStatus.DECLINED, ContractStatus.CANCELLED].includes(
        contract.status,
      )
    ) {
      throw new BadRequestException({
        code: 'CONTRACT_STATUS_INVALID',
        message: `Contract in status ${contract.status} cannot be submitted for signature.`,
      });
    }

    contract.status = ContractStatus.PENDING_SIGNATURE;
    contract.envelopeProvider = dto.envelopeProvider.trim();
    contract.envelopeId = dto.envelopeId?.trim() || null;
    contract.updatedByUserId = currentUser.id;
    contract.signedAt = null;

    await this.contractRepository.save(contract);

    const signers = await this.signerRepository.find({
      where: { contractId },
      order: { sortOrder: 'ASC' },
    });

    const now = new Date();
    for (const signer of signers) {
      if (signer.status === ContractSignerStatus.PENDING) {
        signer.status = ContractSignerStatus.SENT;
      }
      if (!signer.sentAt) {
        signer.sentAt = now;
      }
    }
    await this.signerRepository.save(signers);

    await this.recordEvent(contractId, 'contract.submitted', dto.envelopeProvider, {
      actorUserId: currentUser.id,
      envelopeId: dto.envelopeId ?? null,
    });

    return this.getById(contractId, currentUser);
  }

  async updateContractDraft(
    contractId: string,
    dto: UpdateContractDraftDto,
    currentUser: User,
  ): Promise<ContractResponseDto> {
    const contract = await this.findContractForUpdate(contractId);
    assertClientBoundary(contract.clientId, currentUser);

    if (contract.status !== ContractStatus.DRAFT) {
      throw new BadRequestException({
        code: 'CONTRACT_STATUS_INVALID',
        message: 'Only draft contracts can be edited.',
      });
    }

    if (dto.title !== undefined) {
      contract.title = dto.title.trim();
    }
    if (dto.variables !== undefined) {
      contract.variables = dto.variables;
    }
    if (dto.documentJson !== undefined) {
      contract.documentJson = dto.documentJson;
    }

    contract.updatedByUserId = currentUser.id;
    contract.version += 1;
    await this.contractRepository.save(contract);

    if (dto.signers) {
      await this.signerRepository.delete({ contractId });
      const replacementSigners = dto.signers.map((signer, index) =>
        this.signerRepository.create({
          contractId,
          email: signer.email.trim().toLowerCase(),
          fullName: signer.fullName.trim(),
          roleLabel: signer.roleLabel.trim(),
          sortOrder: index,
          status: ContractSignerStatus.PENDING,
          signatureAudit: {},
          metadata: {},
        }),
      );
      await this.signerRepository.save(replacementSigners);
    }

    await this.recordEvent(contractId, 'contract.updated', 'control-plane-api', {
      actorUserId: currentUser.id,
      fields: Object.keys(dto),
    });

    return this.getById(contractId, currentUser);
  }

  async updateSignerStatus(
    contractId: string,
    signerId: string,
    dto: UpdateSignerStatusDto,
    currentUser: User,
  ): Promise<ContractResponseDto> {
    const contract = await this.findContractForUpdate(contractId);

    const signer = await this.signerRepository.findOne({
      where: { id: signerId, contractId },
    });
    if (!signer) {
      throw new NotFoundException({
        code: 'CONTRACT_SIGNER_NOT_FOUND',
        message: `Signer ${signerId} was not found for contract ${contractId}.`,
      });
    }

    signer.status = dto.status;
    signer.signatureAudit = {
      ...(signer.signatureAudit ?? {}),
      ...(dto.audit ?? {}),
    };

    const now = new Date();
    if (dto.status === ContractSignerStatus.VIEWED && !signer.viewedAt) {
      signer.viewedAt = now;
    }
    if (dto.status === ContractSignerStatus.SIGNED && !signer.signedAt) {
      signer.signedAt = now;
    }
    if (dto.status === ContractSignerStatus.DECLINED && !signer.declinedAt) {
      signer.declinedAt = now;
    }

    await this.signerRepository.save(signer);

    const allSigners = await this.signerRepository.find({ where: { contractId } });
    const allSigned = allSigners.length > 0 && allSigners.every((item) => item.signedAt);
    const anyDeclined = allSigners.some((item) => item.status === ContractSignerStatus.DECLINED);

    if (anyDeclined) {
      contract.status = ContractStatus.DECLINED;
      contract.signedAt = null;
    } else if (allSigned) {
      contract.status = ContractStatus.SIGNED;
      contract.signedAt = now;
    } else {
      contract.status = ContractStatus.PENDING_SIGNATURE;
      contract.signedAt = null;
    }
    contract.updatedByUserId = currentUser.id;

    await this.contractRepository.save(contract);

    await this.recordEvent(contractId, `contract.signer.${dto.status}`, 'control-plane-api', {
      actorUserId: currentUser.id,
      signerId,
    });

    return this.getById(contractId, currentUser);
  }

  async cancelContract(
    contractId: string,
    dto: CancelContractDto,
    currentUser: User,
  ): Promise<ContractResponseDto> {
    const contract = await this.findContractForUpdate(contractId);

    if ([ContractStatus.SIGNED, ContractStatus.EXPIRED].includes(contract.status)) {
      throw new BadRequestException({
        code: 'CONTRACT_STATUS_INVALID',
        message: `Contract in status ${contract.status} cannot be cancelled.`,
      });
    }

    contract.status = ContractStatus.CANCELLED;
    contract.updatedByUserId = currentUser.id;
    await this.contractRepository.save(contract);

    await this.recordEvent(contractId, 'contract.cancelled', 'control-plane-api', {
      actorUserId: currentUser.id,
      reason: dto.reason,
    });

    return this.getById(contractId, currentUser);
  }

  async generatePdf(contractId: string, currentUser: User): Promise<ContractResponseDto> {
    const contract = await this.findContractForUpdate(contractId);
    assertClientBoundary(contract.clientId, currentUser);

    const { renderedHtml, pdfPath } = await this.pdfService.generateAndStoreContractPdf(contract);

    contract.renderedHtml = renderedHtml;
    contract.pdfPath = pdfPath;
    contract.updatedByUserId = currentUser.id;
    await this.contractRepository.save(contract);

    await this.recordEvent(contractId, 'contract.pdf.generated', 'control-plane-api', {
      actorUserId: currentUser.id,
      pdfPath,
    });

    return this.getById(contractId, currentUser);
  }

  async downloadPdf(
    contractId: string,
    currentUser: User,
  ): Promise<{ fileName: string; buffer: Buffer }> {
    const contract = await this.findContractForUpdate(contractId);
    assertClientBoundary(contract.clientId, currentUser);

    if (!contract.pdfPath) {
      throw new BadRequestException({
        code: 'CONTRACT_PDF_NOT_GENERATED',
        message: `Contract ${contractId} does not have a generated PDF yet.`,
      });
    }

    const buffer = await this.pdfService.downloadContractPdf(contract);
    return {
      fileName: this.buildPdfFileName(contract),
      buffer,
    };
  }

  private async findContractForUpdate(contractId: string): Promise<Contract> {
    const contract = await this.contractRepository.findOne({
      where: { id: contractId },
    });
    if (!contract) {
      throw new NotFoundException({
        code: 'CONTRACT_NOT_FOUND',
        message: `Contract ${contractId} was not found.`,
      });
    }
    return contract;
  }

  private async recordEvent(
    contractId: string,
    eventType: string,
    eventSource: string | null,
    eventPayload: Record<string, unknown>,
  ): Promise<void> {
    const event = this.eventRepository.create({
      contractId,
      eventType,
      eventSource,
      eventPayload,
    });
    await this.eventRepository.save(event);
  }

  private toSignerResponse(signer: ContractSigner): ContractSignerResponseDto {
    return {
      id: signer.id,
      email: signer.email,
      fullName: signer.fullName,
      roleLabel: signer.roleLabel,
      sortOrder: signer.sortOrder,
      status: signer.status,
      sentAt: signer.sentAt,
      viewedAt: signer.viewedAt,
      signedAt: signer.signedAt,
      declinedAt: signer.declinedAt,
    };
  }

  private toResponse(contract: Contract): ContractResponseDto {
    return {
      id: contract.id,
      clientId: contract.clientId,
      tenantId: contract.tenantId,
      title: contract.title,
      templateKey: contract.templateKey,
      version: contract.version,
      status: contract.status,
      variables: contract.variables ?? {},
      documentJson: contract.documentJson ?? {},
      renderedHtml: contract.renderedHtml,
      pdfPath: contract.pdfPath,
      envelopeProvider: contract.envelopeProvider,
      envelopeId: contract.envelopeId,
      signedAt: contract.signedAt,
      metadata: contract.metadata ?? {},
      signers: (contract.signers ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((signer) => this.toSignerResponse(signer)),
      createdAt: contract.createdAt,
      updatedAt: contract.updatedAt,
    };
  }

  private buildPdfFileName(contract: Contract): string {
    const baseTitle = contract.title?.trim() || `contract-${contract.id}`;
    const slug = baseTitle
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-+|-+$/g, '');
    return `${slug || `contract-${contract.id}`}.pdf`;
  }
}
