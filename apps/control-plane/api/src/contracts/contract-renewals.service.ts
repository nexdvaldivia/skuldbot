import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { In, IsNull, Repository } from 'typeorm';
import { SubscriptionEntity } from '../integrations/payment/entities/subscription.entity';
import { User } from '../users/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { assertClientBoundary, ensureClientExists } from './contracts-access.util';
import {
  AcceptPendingContractDto,
  AcceptPendingContractResponseDto,
  ListContractRenewalRequirementsQueryDto,
  PendingContractsResponseDto,
  ProcessContractRenewalJobResponseDto,
  RequireReacceptanceDto,
  RequireReacceptanceResponseDto,
  WaiveRequirementDto,
  WaiveRequirementResponseDto,
} from './dto/contract-renewals.dto';
import {
  ContractAcceptanceMethod,
  ContractRenewalRequirementStatus,
} from './entities/contract-domain.enums';
import { ContractAcceptance } from './entities/contract-acceptance.entity';
import { ContractEvent } from './entities/contract-event.entity';
import { ContractRenewalRequirement } from './entities/contract-renewal-requirement.entity';
import { ContractTemplateVersion } from './entities/contract-template-version.entity';

@Injectable()
export class ContractRenewalsService {
  constructor(
    @InjectRepository(ContractRenewalRequirement)
    private readonly renewalRequirementRepository: Repository<ContractRenewalRequirement>,
    @InjectRepository(ContractTemplateVersion)
    private readonly templateVersionRepository: Repository<ContractTemplateVersion>,
    @InjectRepository(ContractAcceptance)
    private readonly acceptanceRepository: Repository<ContractAcceptance>,
    @InjectRepository(ContractEvent)
    private readonly contractEventRepository: Repository<ContractEvent>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepository: Repository<SubscriptionEntity>,
  ) {}

  async requireReacceptance(
    dto: RequireReacceptanceDto,
    currentUser: User,
  ): Promise<RequireReacceptanceResponseDto> {
    const templateVersion = await this.requirePublishedTemplateVersion(dto.templateId);
    if (!templateVersion.supersedesVersionId) {
      return this.buildEmptyRequireResponse(templateVersion.id, null);
    }

    const oldAcceptances = await this.loadOldActiveAcceptances(templateVersion.supersedesVersionId);
    if (oldAcceptances.length === 0) {
      return this.buildEmptyRequireResponse(
        templateVersion.id,
        templateVersion.supersedesVersionId,
      );
    }

    const clientById = await this.loadClientMap(oldAcceptances);
    const buildResult = await this.buildRenewalRequirements(
      oldAcceptances,
      templateVersion,
      dto,
      currentUser.id,
      clientById,
    );
    await this.persistRenewalRequirements(buildResult.requirements, currentUser.id);

    return {
      success: true,
      newTemplateId: templateVersion.id,
      oldTemplateId: templateVersion.supersedesVersionId,
      requirementsCreated: buildResult.requirements.length,
      notificationsSent: buildResult.notificationsSent,
      clientsAffected: buildResult.clientsAffected,
    };
  }

  async waiveRequirement(
    requirementId: string,
    dto: WaiveRequirementDto,
    currentUser: User,
  ): Promise<WaiveRequirementResponseDto> {
    const requirement = await this.requireRequirement(requirementId);
    if (requirement.status === ContractRenewalRequirementStatus.ACCEPTED) {
      throw new BadRequestException({
        code: 'CONTRACT_RENEWAL_ALREADY_ACCEPTED',
        message: `Requirement ${requirement.id} is already accepted and cannot be waived.`,
      });
    }

    const now = new Date();
    requirement.status = ContractRenewalRequirementStatus.WAIVED;
    requirement.waivedAt = now;
    requirement.waivedByUserId = currentUser.id;
    requirement.waiverReason = dto.reason.trim();
    requirement.renewalBlocked = false;
    requirement.blockedAt = null;
    requirement.blockedReason = null;
    requirement.metadata = {
      ...(requirement.metadata ?? {}),
      waivedByUserId: currentUser.id,
      waivedAt: now.toISOString(),
    };
    await this.renewalRequirementRepository.save(requirement);

    await this.recordContractEvent(
      requirement.oldAcceptanceId,
      'contract.renewal_waived',
      currentUser.id,
      {
        requirementId: requirement.id,
        reason: requirement.waiverReason,
      },
    );

    return {
      success: true,
      requirementId: requirement.id,
      waivedAt: now.toISOString(),
      waivedBy: currentUser.id,
      reason: requirement.waiverReason,
    };
  }

  async listAllRequirements(
    query: ListContractRenewalRequirementsQueryDto,
  ): Promise<Array<Record<string, unknown>>> {
    const qb = this.renewalRequirementRepository
      .createQueryBuilder('requirement')
      .leftJoinAndSelect('requirement.client', 'client')
      .leftJoinAndSelect('requirement.newTemplateVersion', 'newTemplateVersion')
      .leftJoinAndSelect('newTemplateVersion.template', 'template');

    if (query.statusFilter) {
      qb.andWhere('requirement.status = :status', { status: query.statusFilter });
    }

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const requirements = await qb
      .orderBy('requirement.deadline', 'DESC')
      .addOrderBy('requirement.createdAt', 'DESC')
      .take(limit)
      .skip(offset)
      .getMany();

    return requirements.map((requirement) => ({
      id: requirement.id,
      clientId: requirement.clientId,
      clientName: requirement.client?.name ?? null,
      templateId: requirement.newTemplateVersionId,
      templateName: requirement.newTemplateVersion?.template?.title ?? null,
      status: requirement.status,
      deadline: requirement.deadline.toISOString(),
      daysRemaining: this.daysUntilDeadline(requirement.deadline),
      notifiedAt: requirement.notifiedAt?.toISOString() ?? null,
      reminderSentAt: requirement.reminderSentAt?.toISOString() ?? null,
      acceptedAt: requirement.acceptedAt?.toISOString() ?? null,
      renewalBlocked: requirement.renewalBlocked,
      waivedAt: requirement.waivedAt?.toISOString() ?? null,
      createdAt: requirement.createdAt.toISOString(),
    }));
  }

  async getPendingContractsForClient(
    clientId: string,
    currentUser: User,
  ): Promise<PendingContractsResponseDto> {
    assertClientBoundary(clientId, currentUser);
    await ensureClientExists(this.clientRepository, clientId);

    const client = await this.clientRepository.findOne({ where: { id: clientId } });
    const pendingRequirements = await this.renewalRequirementRepository.find({
      where: {
        clientId,
        status: ContractRenewalRequirementStatus.PENDING,
      },
      relations: ['newTemplateVersion', 'newTemplateVersion.template'],
      order: {
        deadline: 'ASC',
        createdAt: 'ASC',
      },
    });

    return {
      clientId,
      clientName: client?.name ?? clientId,
      pendingCount: pendingRequirements.length,
      pendingContracts: pendingRequirements.map((requirement) => ({
        requirementId: requirement.id,
        templateId: requirement.newTemplateVersionId,
        templateName:
          requirement.newTemplateVersion?.template?.templateKey ?? requirement.newTemplateVersionId,
        templateDisplayName:
          requirement.newTemplateVersion?.template?.title ?? requirement.newTemplateVersionId,
        contractType: requirement.newTemplateVersion?.template?.templateKey ?? 'other',
        version: String(requirement.newTemplateVersion?.versionNumber ?? ''),
        deadline: requirement.deadline.toISOString(),
        daysRemaining: this.daysUntilDeadline(requirement.deadline),
        notifiedAt: requirement.notifiedAt?.toISOString() ?? null,
        reminderSentAt: requirement.reminderSentAt?.toISOString() ?? null,
      })),
    };
  }

  async acceptPendingContract(
    clientId: string,
    requirementId: string,
    dto: AcceptPendingContractDto,
    currentUser: User,
  ): Promise<AcceptPendingContractResponseDto> {
    assertClientBoundary(clientId, currentUser);
    const requirement = await this.requirePendingRequirementForClient(requirementId, clientId);
    const now = new Date();
    const newAcceptance = await this.createRenewalAcceptance(requirement, dto, currentUser.id, now);
    await this.markRequirementAccepted(requirement, newAcceptance.id, currentUser.id, now);

    await this.recordContractEvent(
      requirement.oldAcceptance!.id,
      'contract.renewal_accepted',
      currentUser.id,
      {
        requirementId: requirement.id,
        newAcceptanceId: newAcceptance.id,
      },
    );

    return {
      success: true,
      requirementId: requirement.id,
      acceptanceId: newAcceptance.id,
      acceptedAt: now.toISOString(),
      pdfUrl: newAcceptance.signedPdfUrl,
    };
  }

  async triggerSendReminders(
    daysBeforeDeadline = 5,
  ): Promise<ProcessContractRenewalJobResponseDto> {
    const requirements = await this.renewalRequirementRepository.find({
      where: {
        status: ContractRenewalRequirementStatus.PENDING,
        reminderSentAt: IsNull(),
      },
    });

    const now = new Date();
    const remindedIds: string[] = [];
    for (const requirement of requirements) {
      if (this.daysUntilDeadline(requirement.deadline, now) <= daysBeforeDeadline) {
        requirement.reminderSentAt = now;
        remindedIds.push(requirement.id);
      }
    }

    if (remindedIds.length > 0) {
      await this.renewalRequirementRepository.save(
        requirements.filter((r) => remindedIds.includes(r.id)),
      );
    }

    return {
      success: true,
      jobType: 'send_reminders',
      results: {
        daysBeforeDeadline,
        remindedCount: remindedIds.length,
        reminderIds: remindedIds,
      },
    };
  }

  async triggerProcessExpired(): Promise<ProcessContractRenewalJobResponseDto> {
    const now = new Date();
    const requirements = await this.renewalRequirementRepository.find({
      where: {
        status: ContractRenewalRequirementStatus.PENDING,
      },
    });

    const expiredIds: string[] = [];
    for (const requirement of requirements) {
      if (requirement.deadline < now) {
        requirement.status = ContractRenewalRequirementStatus.EXPIRED;
        requirement.renewalBlocked = true;
        requirement.blockedAt = now;
        requirement.blockedReason = 'contract_not_accepted';
        expiredIds.push(requirement.id);
      }
    }

    if (expiredIds.length > 0) {
      await this.renewalRequirementRepository.save(
        requirements.filter((r) => expiredIds.includes(r.id)),
      );
    }

    return {
      success: true,
      jobType: 'process_expired',
      results: {
        expiredCount: expiredIds.length,
        requirementIds: expiredIds,
      },
    };
  }

  private async requireRequirement(requirementId: string): Promise<ContractRenewalRequirement> {
    const requirement = await this.renewalRequirementRepository.findOne({
      where: { id: requirementId },
    });
    if (!requirement) {
      throw new NotFoundException({
        code: 'CONTRACT_RENEWAL_REQUIREMENT_NOT_FOUND',
        message: `Requirement ${requirementId} was not found.`,
      });
    }
    return requirement;
  }

  private async requirePublishedTemplateVersion(
    templateVersionId: string,
  ): Promise<ContractTemplateVersion> {
    const templateVersion = await this.templateVersionRepository.findOne({
      where: { id: templateVersionId },
      relations: ['template'],
    });
    if (!templateVersion) {
      throw new NotFoundException({
        code: 'CONTRACT_TEMPLATE_VERSION_NOT_FOUND',
        message: `Template version ${templateVersionId} was not found.`,
      });
    }
    if (templateVersion.status !== 'published') {
      throw new BadRequestException({
        code: 'CONTRACT_TEMPLATE_VERSION_NOT_PUBLISHED',
        message: `Template version ${templateVersionId} must be published before requiring reacceptance.`,
      });
    }
    return templateVersion;
  }

  private buildEmptyRequireResponse(
    newTemplateId: string,
    oldTemplateId: string | null,
  ): RequireReacceptanceResponseDto {
    return {
      success: true,
      newTemplateId,
      oldTemplateId,
      requirementsCreated: 0,
      notificationsSent: 0,
      clientsAffected: [],
    };
  }

  private async loadOldActiveAcceptances(templateVersionId: string): Promise<ContractAcceptance[]> {
    return this.acceptanceRepository.find({
      where: {
        templateVersionId,
        revokedAt: IsNull(),
      },
      order: {
        acceptedAt: 'DESC',
      },
    });
  }

  private async loadClientMap(oldAcceptances: ContractAcceptance[]): Promise<Map<string, Client>> {
    const clientIds = Array.from(new Set(oldAcceptances.map((acceptance) => acceptance.clientId)));
    const clients =
      clientIds.length > 0
        ? await this.clientRepository.find({
            where: { id: In(clientIds) },
          })
        : [];
    return new Map(clients.map((client) => [client.id, client]));
  }

  private async buildRenewalRequirements(
    oldAcceptances: ContractAcceptance[],
    templateVersion: ContractTemplateVersion,
    dto: RequireReacceptanceDto,
    actorUserId: string,
    clientById: Map<string, Client>,
  ): Promise<{
    requirements: ContractRenewalRequirement[];
    notificationsSent: number;
    clientsAffected: RequireReacceptanceResponseDto['clientsAffected'];
  }> {
    const requirements: ContractRenewalRequirement[] = [];
    const clientSeen = new Set<string>();
    let notificationsSent = 0;
    const now = new Date();
    const clientsAffected: RequireReacceptanceResponseDto['clientsAffected'] = [];

    for (const acceptance of oldAcceptances) {
      if (clientSeen.has(acceptance.clientId)) {
        continue;
      }
      clientSeen.add(acceptance.clientId);

      const shouldSkip = await this.hasPendingRequirement(acceptance.clientId, templateVersion.id);
      if (shouldSkip) {
        continue;
      }

      const deadline = await this.resolveRequirementDeadline(
        acceptance,
        dto.customDeadlineDays,
        now,
      );
      const client = clientById.get(acceptance.clientId);
      const notificationEmail = acceptance.acceptedByEmail ?? client?.billingEmail ?? null;
      requirements.push(
        this.renewalRequirementRepository.create({
          clientId: acceptance.clientId,
          subscriptionId: null,
          oldAcceptanceId: acceptance.id,
          newTemplateVersionId: templateVersion.id,
          deadline,
          status: ContractRenewalRequirementStatus.PENDING,
          notificationEmail,
          notifiedAt: dto.notifyImmediately === false ? null : now,
          reminderSentAt: null,
          reminderDaysBefore: 5,
          acceptedAt: null,
          newAcceptanceId: null,
          renewalBlocked: false,
          blockedAt: null,
          blockedReason: null,
          waivedAt: null,
          waivedByUserId: null,
          waiverReason: null,
          notes: null,
          metadata: {
            source: 'contracts.renewals.require_reacceptance',
            actorUserId,
            supersededTemplateVersionId: templateVersion.supersedesVersionId,
          },
        }),
      );

      if (dto.notifyImmediately !== false) {
        notificationsSent += 1;
      }

      clientsAffected.push({
        clientId: acceptance.clientId,
        clientName: client?.name ?? acceptance.clientId,
        email: notificationEmail,
        deadline: deadline.toISOString(),
      });
    }

    return {
      requirements,
      notificationsSent,
      clientsAffected,
    };
  }

  private async hasPendingRequirement(
    clientId: string,
    templateVersionId: string,
  ): Promise<boolean> {
    return this.renewalRequirementRepository.exist({
      where: {
        clientId,
        newTemplateVersionId: templateVersionId,
        status: ContractRenewalRequirementStatus.PENDING,
      },
    });
  }

  private async persistRenewalRequirements(
    requirements: ContractRenewalRequirement[],
    actorUserId: string,
  ): Promise<void> {
    if (requirements.length === 0) {
      return;
    }
    await this.renewalRequirementRepository.save(requirements);
    await Promise.all(
      requirements.map((requirement) =>
        this.recordContractEvent(
          requirement.oldAcceptanceId,
          'contract.renewal_required',
          actorUserId,
          {
            requirementId: requirement.id,
            newTemplateVersionId: requirement.newTemplateVersionId,
            deadline: requirement.deadline.toISOString(),
          },
        ),
      ),
    );
  }

  private async requirePendingRequirementForClient(
    requirementId: string,
    clientId: string,
  ): Promise<ContractRenewalRequirement> {
    const requirement = await this.renewalRequirementRepository.findOne({
      where: { id: requirementId },
      relations: ['oldAcceptance', 'newTemplateVersion', 'newTemplateVersion.template'],
    });
    if (!requirement || requirement.clientId !== clientId) {
      throw new NotFoundException({
        code: 'CONTRACT_RENEWAL_REQUIREMENT_NOT_FOUND',
        message: `Requirement ${requirementId} was not found for client ${clientId}.`,
      });
    }
    if (requirement.status !== ContractRenewalRequirementStatus.PENDING) {
      throw new BadRequestException({
        code: 'CONTRACT_RENEWAL_REQUIREMENT_NOT_PENDING',
        message: `Requirement ${requirement.id} is not pending (status: ${requirement.status}).`,
      });
    }
    if (!requirement.oldAcceptance?.contractId) {
      throw new BadRequestException({
        code: 'CONTRACT_RENEWAL_MISSING_BASE_ACCEPTANCE',
        message: `Requirement ${requirement.id} does not have a contract reference to create a new acceptance.`,
      });
    }
    return requirement;
  }

  private async createRenewalAcceptance(
    requirement: ContractRenewalRequirement,
    dto: AcceptPendingContractDto,
    actorUserId: string,
    now: Date,
  ): Promise<ContractAcceptance> {
    const contentSnapshot =
      requirement.newTemplateVersion?.renderedHtml ??
      this.stableStringify(requirement.newTemplateVersion?.documentJson ?? {});
    const contentSnapshotHash = createHash('sha256').update(contentSnapshot).digest('hex');
    const signatureHash = createHash('sha256')
      .update(
        `${dto.signerName.trim()}|${dto.signerEmail.trim().toLowerCase()}|${now.toISOString()}`,
      )
      .digest('hex');

    const newAcceptance = await this.acceptanceRepository.save(
      this.acceptanceRepository.create({
        contractId: requirement.oldAcceptance!.contractId,
        envelopeId: null,
        templateId: requirement.newTemplateVersion?.templateId ?? null,
        templateVersionId: requirement.newTemplateVersionId,
        clientId: requirement.clientId,
        tenantId: requirement.oldAcceptance?.tenantId ?? null,
        acceptedByName: dto.signerName.trim(),
        acceptedByEmail: dto.signerEmail.trim().toLowerCase(),
        acceptedByTitle: dto.signerTitle.trim(),
        acceptanceMethod: ContractAcceptanceMethod.ESIGN,
        ipAddress: 'api-call',
        userAgent: null,
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
        variablesUsed: null,
        effectiveDate: now,
        expirationDate: requirement.oldAcceptance?.expirationDate ?? null,
        supersededById: null,
        revokedAt: null,
        revocationReason: null,
        evidence: {
          source: 'contract-renewal',
          requirementId: requirement.id,
          signerPhone: dto.signerPhone ?? null,
        },
        metadata: {
          source: 'contracts.renewals.accept_pending',
          actorUserId,
        },
      }),
    );

    requirement.oldAcceptance!.supersededById = newAcceptance.id;
    await this.acceptanceRepository.save(requirement.oldAcceptance!);
    return newAcceptance;
  }

  private async markRequirementAccepted(
    requirement: ContractRenewalRequirement,
    newAcceptanceId: string,
    actorUserId: string,
    now: Date,
  ): Promise<void> {
    requirement.status = ContractRenewalRequirementStatus.ACCEPTED;
    requirement.acceptedAt = now;
    requirement.newAcceptanceId = newAcceptanceId;
    requirement.renewalBlocked = false;
    requirement.blockedAt = null;
    requirement.blockedReason = null;
    requirement.metadata = {
      ...(requirement.metadata ?? {}),
      acceptedByUserId: actorUserId,
      acceptedAt: now.toISOString(),
    };
    await this.renewalRequirementRepository.save(requirement);
  }

  private async resolveRequirementDeadline(
    acceptance: ContractAcceptance,
    customDeadlineDays: number | undefined,
    now: Date,
  ): Promise<Date> {
    if (customDeadlineDays && customDeadlineDays > 0) {
      return new Date(now.getTime() + customDeadlineDays * 24 * 60 * 60 * 1000);
    }

    if (acceptance.expirationDate && acceptance.expirationDate > now) {
      return acceptance.expirationDate;
    }

    const subscriptionId = (acceptance.metadata?.['subscriptionId'] as string | undefined) ?? null;
    if (subscriptionId) {
      const subscription = await this.subscriptionRepository.findOne({
        where: { id: subscriptionId },
      });
      if (subscription?.currentPeriodEnd && subscription.currentPeriodEnd > now) {
        return subscription.currentPeriodEnd;
      }
    }

    return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  }

  private daysUntilDeadline(deadline: Date, now = new Date()): number {
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((deadline.getTime() - now.getTime()) / millisecondsPerDay);
  }

  private stableStringify(value: unknown): string {
    const seen = new WeakSet<object>();
    const normalize = (input: unknown): unknown => {
      if (Array.isArray(input)) {
        return input.map((entry) => normalize(entry));
      }
      if (!input || typeof input !== 'object') {
        return input;
      }
      if (seen.has(input as object)) {
        return null;
      }
      seen.add(input as object);
      const sorted = Object.entries(input as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .reduce<Record<string, unknown>>((acc, [key, entry]) => {
          acc[key] = normalize(entry);
          return acc;
        }, {});
      return sorted;
    };
    return JSON.stringify(normalize(value));
  }

  private async recordContractEvent(
    acceptanceId: string | null,
    eventType: string,
    actorUserId: string | null,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!acceptanceId) {
      return;
    }
    const acceptance = await this.acceptanceRepository.findOne({
      where: { id: acceptanceId },
      select: ['id', 'contractId'],
    });
    if (!acceptance?.contractId) {
      return;
    }
    await this.contractEventRepository.save(
      this.contractEventRepository.create({
        contractId: acceptance.contractId,
        eventType,
        eventSource: 'control-plane-api',
        eventPayload: {
          actorUserId,
          ...metadata,
        },
        occurredAt: new Date(),
      }),
    );
  }
}
