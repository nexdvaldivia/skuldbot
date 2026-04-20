import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { License, LicenseFeatures } from './entities/license.entity';
import { LicenseAudit, LicenseAuditAction } from './entities/license-audit.entity';
import { LicenseTypeFeature } from './entities/license-type-feature.entity';
import { QuotaPolicy, UsageCounter } from './entities/quota.entity';
import {
  LicenseRuntimeDecision,
  LicenseRuntimeDecisionType,
} from './entities/license-runtime-decision.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import {
  CreateLicenseDto,
  UpdateLicenseDto,
  UpdateLicenseTemplateDto,
  LicenseTemplateResponseDto,
  LicenseResponseDto,
  LicenseDetailResponseDto,
  LicenseValidationResponseDto,
  LicenseTenantStatusResponseDto,
  EntitlementCheckResponseDto,
  QuotaCheckResponseDto,
  QuotaConsumeResponseDto,
  RuntimeDecisionDto,
} from './dto/license.dto';
import { LookupsService } from '../lookups/lookups.service';
import {
  LOOKUP_DOMAIN_LICENSE_STATUS,
  LOOKUP_DOMAIN_LICENSE_TYPE,
} from '../lookups/lookups.constants';

const RESOURCE_LIMIT_MAP: Record<string, keyof LicenseFeatures> = {
  bots: 'maxBots',
  runners: 'maxRunners',
  concurrent_runs: 'maxConcurrentRuns',
  runs_per_month: 'maxRunsPerMonth',
};

export type RuntimeDecisionContext = {
  orchestratorId?: string | null;
  traceId?: string | null;
  metadata?: Record<string, unknown>;
};

type LicenseEvaluation = {
  valid: boolean;
  inGrace: boolean;
  message: string;
  signatureVerified: boolean;
  shouldStartGrace: boolean;
  shouldEndGrace: boolean;
};

@Injectable()
export class LicensesService {
  private readonly logger = new Logger(LicensesService.name);
  private readonly signingPrivateKey: crypto.KeyObject;
  private readonly signingPublicKey: crypto.KeyObject;
  private readonly signingKeyId: string;
  private readonly signingAlgorithm = 'ed25519';
  private readonly defaultGracePeriodDays: number;

  constructor(
    @InjectRepository(License)
    private readonly licenseRepository: Repository<License>,
    @InjectRepository(LicenseAudit)
    private readonly licenseAuditRepository: Repository<LicenseAudit>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(LicenseTypeFeature)
    private readonly licenseTypeFeatureRepository: Repository<LicenseTypeFeature>,
    @InjectRepository(QuotaPolicy)
    private readonly quotaPolicyRepository: Repository<QuotaPolicy>,
    @InjectRepository(UsageCounter)
    private readonly usageCounterRepository: Repository<UsageCounter>,
    @InjectRepository(LicenseRuntimeDecision)
    private readonly runtimeDecisionRepository: Repository<LicenseRuntimeDecision>,
    private readonly configService: ConfigService,
    private readonly lookupsService: LookupsService,
  ) {
    const keyMaterial = this.resolveSigningMaterial();
    this.signingPrivateKey = keyMaterial.privateKey;
    this.signingPublicKey = keyMaterial.publicKey;
    this.signingKeyId = keyMaterial.publicKeyId;
    this.defaultGracePeriodDays = this.resolveDefaultGraceDays();
  }

  async findAll(tenantId?: string): Promise<LicenseResponseDto[]> {
    const query = this.licenseRepository.createQueryBuilder('license');

    if (tenantId) {
      query.where('license.tenant_id = :tenantId', { tenantId });
    }

    const licenses = await query.orderBy('license.created_at', 'DESC').getMany();
    return licenses.map((license) => this.toResponseDto(license));
  }

  async findOne(id: string): Promise<LicenseDetailResponseDto> {
    const license = await this.licenseRepository.findOne({
      where: { id },
    });

    if (!license) {
      throw new NotFoundException(`License with ID ${id} not found`);
    }

    return this.toDetailDto(license);
  }

  async create(dto: CreateLicenseDto): Promise<LicenseDetailResponseDto> {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: dto.tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${dto.tenantId} not found`);
    }

    const licenseType = dto.type.trim().toLowerCase();
    await this.lookupsService.assertActiveCode(
      LOOKUP_DOMAIN_LICENSE_TYPE,
      licenseType,
      `Invalid license type "${dto.type}"`,
    );

    // Generate license key
    const key = this.generateLicenseKey();

    // Merge DB-driven plan template with request overrides
    const defaultFeatures = await this.getLicenseTemplateFeatures(licenseType);
    const features = { ...defaultFeatures, ...dto.features };
    const activeStatus = await this.lookupsService.getDefaultCode(
      LOOKUP_DOMAIN_LICENSE_STATUS,
      'active',
    );

    const gracePeriodDays = this.resolveGracePeriodDays(dto.gracePeriodDays);

    const license = this.licenseRepository.create({
      id: crypto.randomUUID(),
      tenantId: dto.tenantId,
      key,
      type: licenseType,
      status: activeStatus,
      features,
      signatureAlgorithm: this.signingAlgorithm,
      publicKeyId: this.signingKeyId,
      signature: '',
      validFrom: new Date(dto.validFrom),
      validUntil: new Date(dto.validUntil),
      gracePeriodDays,
      gracePeriodEndsAt: null,
      firstActivatedAt: null,
      validationCount: 0,
    });
    this.signLicense(license);

    const saved = await this.licenseRepository.save(license);
    await this.recordLicenseAudit(saved, 'issued', {
      issuedAt: new Date().toISOString(),
      licenseType,
      gracePeriodDays: saved.gracePeriodDays,
    });
    this.logger.log(`Created license ${key} for tenant ${tenant.slug}`);

    return this.toDetailDto(saved, { includePlainKey: true });
  }

  async update(id: string, dto: UpdateLicenseDto): Promise<LicenseDetailResponseDto> {
    const license = await this.licenseRepository.findOne({
      where: { id },
    });

    if (!license) {
      throw new NotFoundException(`License with ID ${id} not found`);
    }

    let featuresUpdated = false;
    let renewed = false;

    if (dto.status) {
      const status = dto.status.trim().toLowerCase();
      await this.lookupsService.assertActiveCode(
        LOOKUP_DOMAIN_LICENSE_STATUS,
        status,
        `Invalid license status "${dto.status}"`,
      );
      license.status = status;
    }

    if (dto.validUntil) {
      const nextValidUntil = new Date(dto.validUntil);
      renewed = nextValidUntil.getTime() > license.validUntil.getTime();
      license.validUntil = nextValidUntil;
      if (renewed) {
        license.gracePeriodEndsAt = null;
      }
    }

    if (dto.features) {
      license.features = { ...license.features, ...dto.features };
      featuresUpdated = true;
    }

    if (dto.gracePeriodDays !== undefined) {
      license.gracePeriodDays = this.resolveGracePeriodDays(dto.gracePeriodDays);
    }

    this.signLicense(license);
    const saved = await this.licenseRepository.save(license);
    if (featuresUpdated) {
      await this.recordLicenseAudit(saved, 'features_updated', {
        updatedAt: new Date().toISOString(),
      });
    }
    if (renewed) {
      await this.recordLicenseAudit(saved, 'renewed', {
        validUntil: saved.validUntil.toISOString(),
      });
    }
    return this.toDetailDto(saved);
  }

  async revoke(id: string): Promise<LicenseDetailResponseDto> {
    const license = await this.licenseRepository.findOne({
      where: { id },
    });

    if (!license) {
      throw new NotFoundException(`License with ID ${id} not found`);
    }

    await this.lookupsService.assertActiveCode(
      LOOKUP_DOMAIN_LICENSE_STATUS,
      'revoked',
      'Lookup value "revoked" must be active to revoke licenses',
    );
    license.status = 'revoked';
    if (!license.gracePeriodEndsAt) {
      const now = new Date();
      const graceEndsAt = new Date(now);
      graceEndsAt.setDate(
        graceEndsAt.getDate() + this.resolveGracePeriodDays(license.gracePeriodDays),
      );
      license.gracePeriodEndsAt = graceEndsAt;
      await this.recordLicenseAudit(license, 'grace_started', {
        startedAt: now.toISOString(),
        gracePeriodEndsAt: graceEndsAt.toISOString(),
      });
    }
    this.signLicense(license);
    const saved = await this.licenseRepository.save(license);

    this.logger.log(`Revoked license ${license.key}`);
    await this.recordLicenseAudit(saved, 'revoked', {
      revokedAt: new Date().toISOString(),
      gracePeriodEndsAt: saved.gracePeriodEndsAt?.toISOString() ?? null,
    });
    return this.toDetailDto(saved);
  }

  async validate(key: string): Promise<LicenseValidationResponseDto> {
    const license = await this.licenseRepository.findOne({
      where: { key },
      relations: ['tenant'],
    });

    if (!license) {
      return {
        valid: false,
        tenantId: null,
        tenantSlug: null,
        type: null,
        features: null,
        expiresAt: null,
        gracePeriodEndsAt: null,
        signatureVerified: false,
        validationCount: null,
        message: 'License key not found',
      };
    }

    const now = new Date();
    await this.ensureLicenseSignature(license);
    const evaluation = this.evaluateLicense(license, now);
    let effectiveEvaluation = evaluation;
    const shouldPersist =
      evaluation.valid ||
      evaluation.shouldStartGrace ||
      evaluation.shouldEndGrace ||
      license.lastValidatedAt === null;

    if (evaluation.shouldStartGrace) {
      const graceEndsAt = new Date(now);
      graceEndsAt.setDate(
        graceEndsAt.getDate() + this.resolveGracePeriodDays(license.gracePeriodDays),
      );
      license.gracePeriodEndsAt = graceEndsAt;
      await this.recordLicenseAudit(license, 'grace_started', {
        startedAt: now.toISOString(),
        gracePeriodEndsAt: graceEndsAt.toISOString(),
      });
      effectiveEvaluation = {
        ...evaluation,
        valid: true,
        inGrace: true,
        message: `License is in grace period until ${graceEndsAt.toISOString()}`,
      };
    }

    if (evaluation.shouldEndGrace) {
      license.gracePeriodEndsAt = null;
      await this.recordLicenseAudit(license, 'grace_ended', {
        endedAt: now.toISOString(),
      });
    }

    if (effectiveEvaluation.valid) {
      license.lastValidatedAt = now;
      if (!license.firstActivatedAt) {
        license.firstActivatedAt = now;
      }
      license.validationCount = (license.validationCount ?? 0) + 1;
      await this.recordLicenseAudit(license, 'validated', {
        validatedAt: now.toISOString(),
        inGrace: effectiveEvaluation.inGrace,
      });
    } else if (!effectiveEvaluation.signatureVerified) {
      await this.recordLicenseAudit(license, 'signature_invalid', {
        checkedAt: now.toISOString(),
      });
    } else {
      await this.recordLicenseAudit(license, 'validation_failed', {
        checkedAt: now.toISOString(),
        message: effectiveEvaluation.message,
      });
    }

    if (shouldPersist) {
      await this.licenseRepository.save(license);
    }

    return {
      valid: effectiveEvaluation.valid,
      tenantId: license.tenantId,
      tenantSlug: license.tenant?.slug || null,
      type: license.type,
      features: effectiveEvaluation.valid ? this.toRuntimeFeatures(license.features) : null,
      expiresAt: license.validUntil,
      gracePeriodEndsAt: license.gracePeriodEndsAt,
      signatureVerified: effectiveEvaluation.signatureVerified,
      validationCount: license.validationCount ?? 0,
      message: effectiveEvaluation.message,
    };
  }

  async getTenantStatus(tenantId: string): Promise<LicenseTenantStatusResponseDto> {
    const license = await this.licenseRepository.findOne({
      where: { tenantId },
      order: {
        validUntil: 'DESC',
        createdAt: 'DESC',
      },
    });

    if (!license) {
      return {
        tenantId,
        hasLicense: false,
        licenseId: null,
        type: null,
        status: 'missing',
        isActive: false,
        validFrom: null,
        validUntil: null,
        daysRemaining: null,
        quotaState: 'blocked',
        features: null,
      };
    }

    await this.ensureLicenseSignature(license);
    const now = new Date();
    const millisRemaining = license.validUntil.getTime() - now.getTime();
    const daysRemaining = Math.ceil(millisRemaining / (1000 * 60 * 60 * 24));

    const evaluation = this.evaluateLicense(license, new Date());
    const isActive = evaluation.valid;
    const isBlockedStatus = await this.licenseStatusBlocksUsage(license.status);
    const quotaState: string =
      !isActive || isBlockedStatus
        ? 'blocked'
        : evaluation.inGrace || daysRemaining <= 7
          ? 'grace'
          : 'normal';

    return {
      tenantId,
      hasLicense: true,
      licenseId: license.id,
      type: license.type,
      status: license.status,
      isActive,
      validFrom: license.validFrom,
      validUntil: license.validUntil,
      daysRemaining,
      quotaState,
      features: this.toRuntimeFeatures(license.features),
    };
  }

  async checkEntitlement(
    tenantId: string,
    resourceType: string,
    requestedCount: number,
    context?: RuntimeDecisionContext,
  ): Promise<EntitlementCheckResponseDto> {
    const requested = Number.isFinite(requestedCount) ? Math.max(0, requestedCount) : 0;
    const quota = await this.checkQuota(
      tenantId,
      resourceType,
      requested,
      undefined,
      context,
      false,
    );

    const latestLicense = await this.licenseRepository.findOne({
      where: { tenantId },
      order: { validUntil: 'DESC', createdAt: 'DESC' },
    });

    const response = {
      tenantId,
      resourceType,
      requestedCount: requested,
      allowed: quota.allowed,
      reason: quota.reason,
      licenseType: latestLicense?.type ?? null,
      licenseStatus: latestLicense?.status ?? 'missing',
      limit: quota.limit,
      currentUsage: quota.currentUsage,
      projectedUsage: quota.projectedUsage,
      state: quota.state,
    };

    await this.recordRuntimeDecision({
      tenantId,
      decisionType: 'entitlement_check',
      resourceType,
      requested,
      projected: quota.projectedUsage,
      limit: quota.limit,
      period: quota.period,
      state: quota.state,
      allowed: quota.allowed,
      consumed: null,
      reason: quota.reason,
      context,
    });

    return response;
  }

  async checkQuota(
    tenantId: string,
    resourceType: string,
    requestedAmount: number = 0,
    period?: string,
    context?: RuntimeDecisionContext,
    recordDecision = true,
  ): Promise<QuotaCheckResponseDto> {
    const normalizedResourceType = resourceType.trim().toLowerCase();
    const normalizedPeriod = period ?? this.getCurrentPeriod();
    const requested = Number.isFinite(requestedAmount) ? Math.max(0, requestedAmount) : 0;

    const license = await this.loadLatestTenantLicense(tenantId);
    const evaluation = license ? this.evaluateLicense(license, new Date()) : null;
    if (!license || !evaluation?.valid) {
      const blocked = this.buildBlockedQuotaResponse(
        tenantId,
        normalizedResourceType,
        normalizedPeriod,
        requested,
        evaluation ? evaluation.message : 'License missing or inactive',
      );
      if (recordDecision) {
        await this.recordQuotaDecision(blocked, requested, context);
      }
      return blocked;
    }

    const policy = await this.quotaPolicyRepository.findOne({
      where: { tenantId, resourceType: normalizedResourceType },
    });
    const defaultLimit = this.resolveLicenseLimit(license.features, normalizedResourceType);
    const effectiveLimit = policy?.limitValue ?? defaultLimit;
    const warningThresholdPercent = policy?.warningThresholdPercent ?? 80;
    const graceThresholdPercent = policy?.graceThresholdPercent ?? 110;

    const counter = await this.usageCounterRepository.findOne({
      where: {
        tenantId,
        resourceType: normalizedResourceType,
        period: normalizedPeriod,
      },
    });
    const currentUsage = counter ? Number(counter.consumed) : 0;
    const projectedUsage = currentUsage + requested;

    const state = this.computeQuotaState(
      effectiveLimit,
      projectedUsage,
      warningThresholdPercent,
      graceThresholdPercent,
    );
    const allowed = state !== 'blocked' && (!policy?.blockWhenExceeded || state !== 'grace');
    const reason = this.buildQuotaReason(state, effectiveLimit);

    const response = {
      tenantId,
      resourceType: normalizedResourceType,
      period: normalizedPeriod,
      limit: effectiveLimit,
      currentUsage,
      requestedAmount: requested,
      projectedUsage,
      warningThresholdPercent,
      graceThresholdPercent,
      state,
      allowed,
      reason,
    };

    if (recordDecision) {
      await this.recordQuotaDecision(response, requested, context);
    }

    return response;
  }

  private async loadLatestTenantLicense(tenantId: string): Promise<License | null> {
    const license = await this.licenseRepository.findOne({
      where: { tenantId },
      order: { validUntil: 'DESC', createdAt: 'DESC' },
    });
    if (license) {
      await this.ensureLicenseSignature(license);
    }
    return license;
  }

  private buildBlockedQuotaResponse(
    tenantId: string,
    resourceType: string,
    period: string,
    requestedAmount: number,
    reason: string,
  ): QuotaCheckResponseDto {
    return {
      tenantId,
      resourceType,
      period,
      limit: null,
      currentUsage: 0,
      requestedAmount,
      projectedUsage: requestedAmount,
      warningThresholdPercent: 80,
      graceThresholdPercent: 110,
      state: 'blocked',
      allowed: false,
      reason,
    };
  }

  private async recordQuotaDecision(
    response: QuotaCheckResponseDto,
    requested: number,
    context?: RuntimeDecisionContext,
  ): Promise<void> {
    await this.recordRuntimeDecision({
      tenantId: response.tenantId,
      decisionType: 'quota_check',
      resourceType: response.resourceType,
      requested,
      projected: response.projectedUsage,
      limit: response.limit,
      period: response.period,
      state: response.state,
      allowed: response.allowed,
      consumed: null,
      reason: response.reason,
      context,
    });
  }

  async consumeQuota(
    tenantId: string,
    resourceType: string,
    amount: number,
    period?: string,
    context?: RuntimeDecisionContext,
  ): Promise<QuotaConsumeResponseDto> {
    const normalizedAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    const check = await this.checkQuota(
      tenantId,
      resourceType,
      normalizedAmount,
      period,
      context,
      false,
    );

    if (!check.allowed) {
      const blocked = {
        ...check,
        consumed: false,
      };
      await this.recordRuntimeDecision({
        tenantId,
        decisionType: 'quota_consume',
        resourceType: check.resourceType,
        requested: normalizedAmount,
        projected: check.projectedUsage,
        limit: check.limit,
        period: check.period,
        state: check.state,
        allowed: false,
        consumed: false,
        reason: check.reason,
        context,
      });
      return blocked;
    }

    const counter = await this.usageCounterRepository.findOne({
      where: {
        tenantId,
        resourceType: check.resourceType,
        period: check.period,
      },
    });

    if (counter) {
      counter.consumed = Number(counter.consumed) + normalizedAmount;
      await this.usageCounterRepository.save(counter);
    } else {
      const created = this.usageCounterRepository.create({
        tenantId,
        resourceType: check.resourceType,
        period: check.period,
        consumed: normalizedAmount,
      });
      await this.usageCounterRepository.save(created);
    }

    const afterConsume = await this.checkQuota(
      tenantId,
      check.resourceType,
      0,
      check.period,
      context,
      false,
    );
    const consumed = {
      ...afterConsume,
      consumed: true,
    };

    await this.recordRuntimeDecision({
      tenantId,
      decisionType: 'quota_consume',
      resourceType: check.resourceType,
      requested: normalizedAmount,
      projected: consumed.projectedUsage,
      limit: consumed.limit,
      period: consumed.period,
      state: consumed.state,
      allowed: consumed.allowed,
      consumed: true,
      reason: consumed.reason,
      context,
    });

    return consumed;
  }

  async listRuntimeDecisions(
    tenantId: string,
    options?: {
      limit?: number;
      resourceType?: string;
      decisionType?: LicenseRuntimeDecisionType;
    },
  ): Promise<RuntimeDecisionDto[]> {
    const limit = Math.max(1, Math.min(options?.limit ?? 100, 500));
    const query = this.runtimeDecisionRepository.createQueryBuilder('decision');
    query.where('decision.tenantId = :tenantId', { tenantId });

    if (options?.resourceType?.trim()) {
      query.andWhere('decision.resourceType = :resourceType', {
        resourceType: options.resourceType.trim().toLowerCase(),
      });
    }
    if (options?.decisionType) {
      query.andWhere('decision.decisionType = :decisionType', {
        decisionType: options.decisionType,
      });
    }

    const decisions = await query.orderBy('decision.createdAt', 'DESC').take(limit).getMany();

    return decisions.map((decision) => ({
      id: decision.id,
      tenantId: decision.tenantId,
      decisionType: decision.decisionType,
      resourceType: decision.resourceType,
      requested: Number(decision.requested || 0),
      projected: Number(decision.projected || 0),
      limit:
        decision.limit === null || decision.limit === undefined ? null : Number(decision.limit),
      period: decision.period,
      state: decision.state,
      allowed: decision.allowed,
      consumed: decision.consumed,
      reason: decision.reason,
      orchestratorId: decision.orchestratorId,
      traceId: decision.traceId,
      createdAt: decision.createdAt,
    }));
  }

  async generateForTenant(
    tenantId: string,
    type: string,
    durationDays: number = 365,
  ): Promise<LicenseDetailResponseDto> {
    const now = new Date();
    const validUntil = new Date(now);
    validUntil.setDate(validUntil.getDate() + durationDays);

    return this.create({
      tenantId,
      type,
      validFrom: now.toISOString(),
      validUntil: validUntil.toISOString(),
    });
  }

  async getLicenseTemplate(licenseType: string): Promise<LicenseTemplateResponseDto> {
    const normalized = licenseType.trim().toLowerCase();
    await this.lookupsService.assertActiveCode(
      LOOKUP_DOMAIN_LICENSE_TYPE,
      normalized,
      `Invalid license type "${licenseType}"`,
    );
    const features = await this.getLicenseTemplateFeatures(normalized);
    return {
      licenseType: normalized,
      features,
    };
  }

  async updateLicenseTemplate(
    licenseType: string,
    dto: UpdateLicenseTemplateDto,
  ): Promise<LicenseTemplateResponseDto> {
    const normalized = licenseType.trim().toLowerCase();
    const lookupValue = await this.getLicenseTypeLookupValueOrThrow(normalized);
    const current = await this.getLicenseTemplateFeatures(normalized);
    const next = { ...current, ...dto.features };

    for (const [featureKey, rawValue] of Object.entries(next)) {
      const isBoolean = typeof rawValue === 'boolean';
      const isNumber = typeof rawValue === 'number' && Number.isFinite(rawValue);
      if (!isBoolean && !isNumber) {
        throw new BadRequestException(`Feature "${featureKey}" must be a boolean or finite number`);
      }

      const existing = await this.licenseTypeFeatureRepository.findOne({
        where: {
          licenseTypeLookupValueId: lookupValue.id,
          featureKey,
        },
      });

      const row = existing ?? this.licenseTypeFeatureRepository.create();
      row.licenseTypeLookupValueId = lookupValue.id;
      row.featureKey = featureKey;
      row.valueType = isBoolean ? 'boolean' : 'number';
      row.booleanValue = isBoolean ? Boolean(rawValue) : null;
      row.numberValue = isBoolean ? null : Number(rawValue);
      row.isActive = true;
      await this.licenseTypeFeatureRepository.save(row);
    }

    const refreshed = await this.getLicenseTemplateFeatures(normalized);
    return {
      licenseType: normalized,
      features: refreshed,
    };
  }

  private resolveSigningMaterial(): {
    privateKey: crypto.KeyObject;
    publicKey: crypto.KeyObject;
    publicKeyId: string;
  } {
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    const privatePemRaw = this.configService.get<string>('LICENSE_SIGNING_PRIVATE_KEY_PEM');
    const publicPemRaw = this.configService.get<string>('LICENSE_SIGNING_PUBLIC_KEY_PEM');
    const publicKeyIdRaw = this.configService.get<string>('LICENSE_SIGNING_KEY_ID');

    if (privatePemRaw && publicPemRaw && publicKeyIdRaw) {
      return {
        privateKey: crypto.createPrivateKey(this.normalizePem(privatePemRaw)),
        publicKey: crypto.createPublicKey(this.normalizePem(publicPemRaw)),
        publicKeyId: publicKeyIdRaw.trim(),
      };
    }

    if (nodeEnv === 'production') {
      throw new Error(
        'LICENSE_SIGNING_PRIVATE_KEY_PEM, LICENSE_SIGNING_PUBLIC_KEY_PEM, and LICENSE_SIGNING_KEY_ID are required in production.',
      );
    }

    const generated = crypto.generateKeyPairSync('ed25519');
    this.logger.warn(
      'License signing keys are not configured. Using ephemeral keys for non-production runtime only.',
    );
    return {
      privateKey: generated.privateKey,
      publicKey: generated.publicKey,
      publicKeyId: 'ephemeral-dev-key',
    };
  }

  private normalizePem(input: string): string {
    const trimmed = input.trim();
    if (trimmed.includes('BEGIN')) {
      return trimmed;
    }

    const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
    if (!decoded.includes('BEGIN')) {
      throw new Error('Invalid PEM payload for license signing material.');
    }
    return decoded;
  }

  private resolveDefaultGraceDays(): number {
    const configured = Number(this.configService.get<string>('LICENSE_GRACE_PERIOD_DAYS', '30'));
    if (!Number.isFinite(configured)) {
      return 30;
    }
    return Math.min(120, Math.max(0, Math.floor(configured)));
  }

  private resolveGracePeriodDays(input?: number): number {
    const source = input ?? this.defaultGracePeriodDays;
    if (!Number.isFinite(source)) {
      return this.defaultGracePeriodDays;
    }
    return Math.min(120, Math.max(0, Math.floor(source)));
  }

  private signLicense(license: License): void {
    const payload = this.serializeLicenseForSignature(license);
    const signature = crypto.sign(null, Buffer.from(payload, 'utf8'), this.signingPrivateKey);
    license.signatureAlgorithm = this.signingAlgorithm;
    license.publicKeyId = this.signingKeyId;
    license.signature = signature.toString('base64');
  }

  private verifyLicenseSignature(license: License): boolean {
    if (
      !license.signature ||
      !license.publicKeyId ||
      !license.signatureAlgorithm ||
      license.signatureAlgorithm.toLowerCase() !== this.signingAlgorithm
    ) {
      return false;
    }

    const payload = this.serializeLicenseForSignature(license);
    const signature = Buffer.from(license.signature, 'base64');
    return crypto.verify(null, Buffer.from(payload, 'utf8'), this.signingPublicKey, signature);
  }

  private serializeLicenseForSignature(license: License): string {
    return this.canonicalStringify({
      id: license.id,
      tenantId: license.tenantId,
      key: license.key,
      type: license.type,
      status: license.status,
      validFrom: license.validFrom.toISOString(),
      validUntil: license.validUntil.toISOString(),
      gracePeriodDays: this.resolveGracePeriodDays(license.gracePeriodDays),
      features: license.features ?? {},
      metadata: license.metadata ?? {},
    });
  }

  private canonicalStringify(value: unknown): string {
    const normalize = (input: unknown): unknown => {
      if (Array.isArray(input)) {
        return input.map(normalize);
      }

      if (input && typeof input === 'object') {
        const object = input as Record<string, unknown>;
        return Object.keys(object)
          .sort((a, b) => a.localeCompare(b))
          .reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = normalize(object[key]);
            return acc;
          }, {});
      }

      return input;
    };

    return JSON.stringify(normalize(value));
  }

  private evaluateLicense(license: License, now: Date): LicenseEvaluation {
    const signatureVerified = this.verifyLicenseSignature(license);
    if (!signatureVerified) {
      return {
        valid: false,
        inGrace: false,
        message: 'License signature verification failed',
        signatureVerified,
        shouldStartGrace: false,
        shouldEndGrace: false,
      };
    }

    if (license.validFrom.getTime() > now.getTime()) {
      return {
        valid: false,
        inGrace: false,
        message: 'License is not yet active',
        signatureVerified,
        shouldStartGrace: false,
        shouldEndGrace: false,
      };
    }

    const isRevoked = license.status !== 'active';
    const isExpired = license.validUntil.getTime() < now.getTime();
    const graceEndsAt = license.gracePeriodEndsAt;
    const inGrace =
      graceEndsAt !== null &&
      graceEndsAt !== undefined &&
      graceEndsAt.getTime() >= now.getTime() &&
      (isRevoked || isExpired);

    if (!isRevoked && !isExpired) {
      return {
        valid: true,
        inGrace: false,
        message: 'License is valid',
        signatureVerified,
        shouldStartGrace: false,
        shouldEndGrace: false,
      };
    }

    if (inGrace) {
      return {
        valid: true,
        inGrace: true,
        message: `License is in grace period until ${graceEndsAt.toISOString()}`,
        signatureVerified,
        shouldStartGrace: false,
        shouldEndGrace: false,
      };
    }

    const shouldStartGrace = (isRevoked || isExpired) && !graceEndsAt;
    const shouldEndGrace =
      graceEndsAt !== null && graceEndsAt !== undefined && graceEndsAt.getTime() < now.getTime();

    if (isRevoked) {
      return {
        valid: false,
        inGrace: false,
        message: 'License is revoked',
        signatureVerified,
        shouldStartGrace,
        shouldEndGrace,
      };
    }

    return {
      valid: false,
      inGrace: false,
      message: 'License has expired',
      signatureVerified,
      shouldStartGrace,
      shouldEndGrace,
    };
  }

  private async ensureLicenseSignature(license: License): Promise<void> {
    if (license.signature && license.publicKeyId) {
      return;
    }

    this.signLicense(license);
    await this.licenseRepository.save(license);
    await this.recordLicenseAudit(license, 'renewed', {
      reason: 'legacy_unsigned_license_backfilled',
      updatedAt: new Date().toISOString(),
    });
  }

  private async recordLicenseAudit(
    license: Pick<License, 'id' | 'tenantId'>,
    action: LicenseAuditAction,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      const row = this.licenseAuditRepository.create({
        licenseId: license.id,
        tenantId: license.tenantId,
        action,
        ipAddress: null,
        userAgent: null,
        details,
      });
      await this.licenseAuditRepository.save(row);
    } catch (error) {
      this.logger.warn(
        `Could not persist license audit action "${action}" for ${license.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private generateLicenseKey(): string {
    // Format: SKULD-XXXX-XXXX-XXXX-XXXX
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const random = crypto.randomBytes(16);
    const segments: string[] = [];
    for (let i = 0; i < 4; i++) {
      const start = i * 4;
      const segment = Array.from(random.subarray(start, start + 4))
        .map((value) => chars[value % chars.length])
        .join('');
      segments.push(segment);
    }

    return `SKULD-${segments.join('-')}`;
  }

  private toResponseDto(
    license: License,
    options?: {
      includePlainKey?: boolean;
    },
  ): LicenseResponseDto {
    return {
      id: license.id,
      tenantId: license.tenantId,
      key: options?.includePlainKey ? license.key : this.maskLicenseKey(license.key),
      type: license.type,
      status: license.status,
      validFrom: license.validFrom,
      validUntil: license.validUntil,
      isValid: this.resolveLicenseValidity(license),
      createdAt: license.createdAt,
      updatedAt: license.updatedAt,
    };
  }

  private resolveLicenseValidity(
    license: Pick<License, 'status' | 'validFrom' | 'validUntil' | 'gracePeriodEndsAt'> & {
      isValid?: () => boolean;
    },
  ): boolean {
    if (typeof license.isValid === 'function') {
      return license.isValid();
    }

    const now = Date.now();
    const inActiveWindow =
      license.status === 'active' &&
      license.validFrom.getTime() <= now &&
      license.validUntil.getTime() >= now;
    if (inActiveWindow) {
      return true;
    }

    return license.gracePeriodEndsAt ? license.gracePeriodEndsAt.getTime() >= now : false;
  }

  private toDetailDto(
    license: License,
    options?: {
      includePlainKey?: boolean;
    },
  ): LicenseDetailResponseDto {
    return {
      ...this.toResponseDto(license, options),
      features: license.features,
      lastValidatedAt: license.lastValidatedAt,
      firstActivatedAt: license.firstActivatedAt,
      validationCount: license.validationCount ?? 0,
      gracePeriodDays: license.gracePeriodDays,
      gracePeriodEndsAt: license.gracePeriodEndsAt,
      signatureAlgorithm: license.signatureAlgorithm,
      publicKeyId: license.publicKeyId ?? '',
      metadata: license.metadata,
    };
  }

  private maskLicenseKey(key: string): string {
    const normalized = key.trim();
    if (!normalized) {
      return normalized;
    }

    const segments = normalized.split('-');
    if (segments.length <= 2) {
      const visible = normalized.slice(0, Math.min(8, normalized.length));
      return `${visible}...`;
    }

    return `${segments[0]}-${segments[1]}-...`;
  }

  private toRuntimeFeatures(features: LicenseFeatures): LicenseFeatures {
    if (!features?.ssoConfig || typeof features.ssoConfig !== 'object') {
      return features;
    }

    const ssoConfig = features.ssoConfig as Record<string, unknown>;
    const encrypted = ssoConfig.clientSecretEncrypted;
    const hasPlain = typeof ssoConfig.clientSecret === 'string';

    if (typeof encrypted !== 'string' || hasPlain) {
      return features;
    }

    try {
      const clientSecret = this.decryptSecret(encrypted);
      return {
        ...features,
        ssoConfig: {
          ...ssoConfig,
          clientSecret,
        },
      };
    } catch (error) {
      this.logger.error(
        'Failed to decrypt SSO client secret for runtime license validation.',
        error instanceof Error ? error.stack : undefined,
      );
      return features;
    }
  }

  private async getLicenseTemplateFeatures(licenseType: string): Promise<LicenseFeatures> {
    const targetLookupValue = await this.getLicenseTypeLookupValueOrThrow(licenseType);

    const rows = await this.licenseTypeFeatureRepository.find({
      where: {
        licenseTypeLookupValueId: targetLookupValue.id,
        isActive: true,
      },
      order: { featureKey: 'ASC' },
    });

    if (rows.length === 0) {
      throw new BadRequestException(`License type "${licenseType}" has no feature template rows`);
    }

    const features: Record<string, unknown> = {};
    for (const row of rows) {
      if (row.valueType === 'boolean') {
        features[row.featureKey] = Boolean(row.booleanValue);
      } else {
        features[row.featureKey] = row.numberValue === null ? 0 : Number(row.numberValue);
      }
    }

    return features as unknown as LicenseFeatures;
  }

  private async getLicenseTypeLookupValueOrThrow(licenseType: string) {
    const normalized = licenseType.trim().toLowerCase();
    await this.lookupsService.assertActiveCode(
      LOOKUP_DOMAIN_LICENSE_TYPE,
      normalized,
      `Invalid license type "${licenseType}"`,
    );
    const licenseTypeValues = await this.lookupsService.listValuesByDomainCode(
      LOOKUP_DOMAIN_LICENSE_TYPE,
    );
    const targetLookupValue = licenseTypeValues.find(
      (value) => value.code === normalized && value.isActive,
    );
    if (!targetLookupValue) {
      throw new BadRequestException(`Lookup license type "${licenseType}" not found`);
    }
    return targetLookupValue;
  }

  private async licenseStatusBlocksUsage(status: string): Promise<boolean> {
    const metadata = await this.lookupsService.getMetadata(LOOKUP_DOMAIN_LICENSE_STATUS, status);
    return metadata?.['blocksUsage'] === true;
  }

  private resolveLicenseLimit(features: LicenseFeatures, resourceType: string): number | null {
    const featureKey = RESOURCE_LIMIT_MAP[resourceType];
    if (!featureKey) {
      return null;
    }

    const rawLimit = features[featureKey];
    if (typeof rawLimit !== 'number') {
      return null;
    }
    return rawLimit;
  }

  private computeQuotaState(
    limit: number | null,
    projectedUsage: number,
    warningThresholdPercent: number,
    graceThresholdPercent: number,
  ): 'normal' | 'approaching' | 'at_limit' | 'grace' | 'blocked' {
    if (limit === null || limit < 0) {
      return 'normal';
    }

    const warningThreshold = limit * (warningThresholdPercent / 100);
    const graceThreshold = limit * (graceThresholdPercent / 100);

    if (projectedUsage > graceThreshold) {
      return 'blocked';
    }
    if (projectedUsage > limit) {
      return 'grace';
    }
    if (projectedUsage === limit) {
      return 'at_limit';
    }
    if (projectedUsage >= warningThreshold) {
      return 'approaching';
    }

    return 'normal';
  }

  private buildQuotaReason(
    state: 'normal' | 'approaching' | 'at_limit' | 'grace' | 'blocked',
    limit: number | null,
  ): string {
    if (limit === null) {
      return 'No explicit limit configured for resource';
    }

    switch (state) {
      case 'normal':
        return `Within quota limit (${limit})`;
      case 'approaching':
        return `Approaching quota limit (${limit})`;
      case 'at_limit':
        return `At quota limit (${limit})`;
      case 'grace':
        return `Above quota limit (${limit}) in grace window`;
      case 'blocked':
        return `Quota exceeded and blocked (limit ${limit})`;
      default:
        return 'Quota evaluation completed';
    }
  }

  private getCurrentPeriod(): string {
    return new Date().toISOString().slice(0, 7);
  }

  private decryptSecret(payload: string): string {
    const [version, saltB64, ivB64, tagB64, encrypted] = payload.split(':');
    if (version !== 'v1' || !saltB64 || !ivB64 || !tagB64 || !encrypted) {
      throw new Error('Invalid encrypted payload format');
    }

    const encryptionKey = this.getEncryptionKey();
    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const key = crypto.pbkdf2Sync(encryptionKey, salt, 100000, 32, 'sha256');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private getEncryptionKey(): string {
    const key =
      this.configService.get<string>('SSO_ENCRYPTION_KEY') ||
      this.configService.get<string>('INTEGRATIONS_ENCRYPTION_KEY');

    if (!key) {
      throw new Error('SSO_ENCRYPTION_KEY or INTEGRATIONS_ENCRYPTION_KEY must be configured.');
    }

    return key;
  }

  private async recordRuntimeDecision(input: {
    tenantId: string;
    decisionType: LicenseRuntimeDecisionType;
    resourceType: string;
    requested: number;
    projected: number;
    limit: number | null;
    period: string | null;
    state: string | null;
    allowed: boolean;
    consumed: boolean | null;
    reason: string | null;
    context?: RuntimeDecisionContext;
  }): Promise<void> {
    try {
      const row = this.runtimeDecisionRepository.create({
        tenantId: input.tenantId,
        decisionType: input.decisionType,
        resourceType: input.resourceType.trim().toLowerCase(),
        requested: Number.isFinite(input.requested) ? Math.max(0, input.requested) : 0,
        projected: Number.isFinite(input.projected) ? Math.max(0, input.projected) : 0,
        limit: input.limit === null || input.limit === undefined ? null : Number(input.limit),
        period: input.period,
        state: input.state,
        allowed: input.allowed,
        consumed: input.consumed,
        reason: input.reason,
        orchestratorId: input.context?.orchestratorId?.trim() || null,
        traceId: input.context?.traceId?.trim() || null,
        metadata: input.context?.metadata || {},
      });
      await this.runtimeDecisionRepository.save(row);
    } catch (error) {
      this.logger.warn(
        `Could not persist license runtime decision (${input.decisionType}) for tenant ${input.tenantId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
