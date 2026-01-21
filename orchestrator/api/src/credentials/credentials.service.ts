import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like, LessThan, MoreThan, Between } from 'typeorm';
import {
  Credential,
  CredentialType,
  CredentialStatus,
  CredentialScope,
  VaultProvider,
  CredentialAccessLog,
  CredentialRotationHistory,
  CredentialFolder,
  VaultConnection,
} from './entities/credential.entity';
import { EncryptionService } from './encryption.service';
import {
  CreateCredentialDto,
  UpdateCredentialDto,
  UpdateCredentialValueDto,
  RotateCredentialDto,
  ListCredentialsQueryDto,
  ListAccessLogsQueryDto,
  CredentialSummaryDto,
  CredentialDetailDto,
  DecryptedCredentialDto,
  CredentialAccessLogDto,
  CredentialRotationHistoryDto,
  PaginatedCredentialsDto,
  PaginatedAccessLogsDto,
  CredentialStatsDto,
  CreateVaultConnectionDto,
  UpdateVaultConnectionDto,
  VaultConnectionDto,
  CreateFolderDto,
  UpdateFolderDto,
  FolderDto,
  FetchCredentialDto,
  BulkFetchCredentialsDto,
  BulkCredentialsResponseDto,
} from './dto/credential.dto';

/**
 * Enterprise-grade Credentials Service.
 *
 * Provides secure credential management with:
 * - AES-256-GCM encryption for at-rest protection
 * - External vault integration (HashiCorp, AWS, Azure, GCP)
 * - Fine-grained access control (scope, bots, environments)
 * - Automatic rotation policies
 * - Complete audit trail
 * - Expiration tracking and alerting
 */
@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);

  constructor(
    @InjectRepository(Credential)
    private readonly credentialRepository: Repository<Credential>,
    @InjectRepository(CredentialAccessLog)
    private readonly accessLogRepository: Repository<CredentialAccessLog>,
    @InjectRepository(CredentialRotationHistory)
    private readonly rotationHistoryRepository: Repository<CredentialRotationHistory>,
    @InjectRepository(CredentialFolder)
    private readonly folderRepository: Repository<CredentialFolder>,
    @InjectRepository(VaultConnection)
    private readonly vaultConnectionRepository: Repository<VaultConnection>,
    private readonly encryptionService: EncryptionService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // CREDENTIAL CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new credential
   */
  async create(
    tenantId: string,
    userId: string,
    dto: CreateCredentialDto,
  ): Promise<CredentialDetailDto> {
    // Check for duplicate key
    const existing = await this.credentialRepository.findOne({
      where: { tenantId, key: dto.key },
    });

    if (existing) {
      throw new ConflictException(
        `Credential with key '${dto.key}' already exists`,
      );
    }

    // Validate folder exists if specified
    if (dto.folderId) {
      const folder = await this.folderRepository.findOne({
        where: { id: dto.folderId, tenantId },
      });
      if (!folder) {
        throw new NotFoundException(`Folder not found: ${dto.folderId}`);
      }
    }

    // Encrypt the credential value
    let encryptedData: string | null = null;
    let encryptionKeyId: string | null = null;
    let vaultReference: string | null = null;

    const vaultProvider = dto.vaultProvider || VaultProvider.INTERNAL;

    if (vaultProvider === VaultProvider.INTERNAL) {
      encryptedData = this.encryptionService.encryptCredentialValue(dto.value);
      encryptionKeyId = this.encryptionService.getCurrentKeyId();
    } else {
      // External vault - store reference only
      vaultReference = dto.vaultReference || null;
      // TODO: Integrate with external vault provider
    }

    // Create credential entity
    const credential = this.credentialRepository.create({
      tenantId,
      name: dto.name,
      key: dto.key,
      description: dto.description || null,
      type: dto.type,
      status: CredentialStatus.ACTIVE,
      scope: dto.scope || CredentialScope.GLOBAL,
      vaultProvider,
      vaultReference,
      encryptedData,
      encryptionKeyId,
      labels: dto.labels || {},
      metadata: dto.metadata || {},
      allowedBotIds: dto.allowedBotIds || [],
      allowedEnvironments: dto.allowedEnvironments || [],
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      rotationConfig: dto.rotationConfig
        ? {
            enabled: dto.rotationConfig.enabled,
            intervalDays: dto.rotationConfig.intervalDays || 90,
            notifyDaysBefore: dto.rotationConfig.notifyDaysBefore,
            rotationStrategy: dto.rotationConfig.rotationStrategy,
            rotationScript: dto.rotationConfig.rotationScript,
            maxFailures: dto.rotationConfig.maxFailures,
            lastRotatedAt: new Date(),
            nextRotationAt: dto.rotationConfig.enabled
              ? this.calculateNextRotation(dto.rotationConfig.intervalDays || 90)
              : undefined,
          }
        : undefined,
      auditConfig: dto.auditConfig || {
        logAccess: true,
        logDecryption: true,
        alertOnUnauthorized: true,
      },
      createdBy: userId,
      updatedBy: userId,
    });

    await this.credentialRepository.save(credential);

    this.logger.log(
      `Created credential ${credential.id} (${credential.key}) for tenant ${tenantId}`,
    );

    return this.toDetailDto(credential);
  }

  /**
   * List credentials with filtering
   */
  async findAll(
    tenantId: string,
    query: ListCredentialsQueryDto,
  ): Promise<PaginatedCredentialsDto> {
    const {
      search,
      type,
      status,
      scope,
      vaultProvider,
      folderId,
      botId,
      environment,
      label,
      expiringSoon,
      limit = 50,
      offset = 0,
      sortBy = 'name',
      sortOrder = 'asc',
    } = query;

    const qb = this.credentialRepository
      .createQueryBuilder('cred')
      .where('cred.tenantId = :tenantId', { tenantId });

    // Search filter
    if (search) {
      qb.andWhere(
        '(cred.name ILIKE :search OR cred.key ILIKE :search OR cred.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Type filter
    if (type) {
      qb.andWhere('cred.type = :type', { type });
    }

    // Status filter
    if (status) {
      qb.andWhere('cred.status = :status', { status });
    }

    // Scope filter
    if (scope) {
      qb.andWhere('cred.scope = :scope', { scope });
    }

    // Vault provider filter
    if (vaultProvider) {
      qb.andWhere('cred.vaultProvider = :vaultProvider', { vaultProvider });
    }

    // Bot ID filter (for BOT_SPECIFIC scope)
    if (botId) {
      qb.andWhere(':botId = ANY(cred.allowedBotIds)', { botId });
    }

    // Environment filter
    if (environment) {
      qb.andWhere(':environment = ANY(cred.allowedEnvironments)', {
        environment,
      });
    }

    // Label filter
    if (label) {
      const [labelKey, labelValue] = label.split('=');
      if (labelValue) {
        qb.andWhere(`cred.labels->>'${labelKey}' = :labelValue`, { labelValue });
      } else {
        qb.andWhere(`cred.labels ? :labelKey`, { labelKey });
      }
    }

    // Expiring soon filter (next 30 days)
    if (expiringSoon) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      qb.andWhere('cred.expiresAt IS NOT NULL')
        .andWhere('cred.expiresAt > NOW()')
        .andWhere('cred.expiresAt <= :thirtyDaysFromNow', { thirtyDaysFromNow });
    }

    // Get total count
    const total = await qb.getCount();

    // Apply sorting
    const sortColumn =
      sortBy === 'lastAccessedAt'
        ? 'cred.lastAccessedAt'
        : `cred.${sortBy}`;
    qb.orderBy(sortColumn, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    // Apply pagination
    qb.skip(offset).take(limit);

    const credentials = await qb.getMany();

    return {
      items: credentials.map((c) => this.toSummaryDto(c)),
      total,
      limit,
      offset,
      hasMore: offset + credentials.length < total,
    };
  }

  /**
   * Get credential by ID
   */
  async findOne(
    tenantId: string,
    credentialId: string,
  ): Promise<CredentialDetailDto> {
    const credential = await this.credentialRepository.findOne({
      where: { id: credentialId, tenantId },
    });

    if (!credential) {
      throw new NotFoundException(`Credential not found: ${credentialId}`);
    }

    return this.toDetailDto(credential);
  }

  /**
   * Get credential by key
   */
  async findByKey(
    tenantId: string,
    key: string,
  ): Promise<CredentialDetailDto> {
    const credential = await this.credentialRepository.findOne({
      where: { key, tenantId },
    });

    if (!credential) {
      throw new NotFoundException(`Credential not found with key: ${key}`);
    }

    return this.toDetailDto(credential);
  }

  /**
   * Update credential metadata (not value)
   */
  async update(
    tenantId: string,
    credentialId: string,
    userId: string,
    dto: UpdateCredentialDto,
  ): Promise<CredentialDetailDto> {
    const credential = await this.credentialRepository.findOne({
      where: { id: credentialId, tenantId },
    });

    if (!credential) {
      throw new NotFoundException(`Credential not found: ${credentialId}`);
    }

    // Update fields
    if (dto.name !== undefined) credential.name = dto.name;
    if (dto.description !== undefined) credential.description = dto.description;
    if (dto.status !== undefined) credential.status = dto.status;
    if (dto.scope !== undefined) credential.scope = dto.scope;
    if (dto.labels !== undefined) credential.labels = dto.labels;
    if (dto.metadata !== undefined) credential.metadata = dto.metadata;
    if (dto.allowedBotIds !== undefined)
      credential.allowedBotIds = dto.allowedBotIds;
    if (dto.allowedEnvironments !== undefined)
      credential.allowedEnvironments = dto.allowedEnvironments;
    if (dto.expiresAt !== undefined) {
      credential.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }
    if (dto.rotationConfig !== undefined) {
      credential.rotationConfig = dto.rotationConfig
        ? {
            enabled: dto.rotationConfig.enabled,
            intervalDays: dto.rotationConfig.intervalDays || 90,
            notifyDaysBefore: dto.rotationConfig.notifyDaysBefore,
            rotationStrategy: dto.rotationConfig.rotationStrategy,
            rotationScript: dto.rotationConfig.rotationScript,
            maxFailures: dto.rotationConfig.maxFailures,
            lastRotatedAt: credential.rotationConfig?.lastRotatedAt,
            nextRotationAt: dto.rotationConfig.enabled
              ? this.calculateNextRotation(dto.rotationConfig.intervalDays || 90)
              : undefined,
          }
        : undefined!;
    }
    if (dto.auditConfig !== undefined) credential.auditConfig = dto.auditConfig;

    credential.updatedBy = userId;

    await this.credentialRepository.save(credential);

    this.logger.log(
      `Updated credential ${credentialId} for tenant ${tenantId}`,
    );

    return this.toDetailDto(credential);
  }

  /**
   * Update credential value (re-encrypt)
   */
  async updateValue(
    tenantId: string,
    credentialId: string,
    userId: string,
    dto: UpdateCredentialValueDto,
  ): Promise<CredentialDetailDto> {
    const credential = await this.credentialRepository.findOne({
      where: { id: credentialId, tenantId },
    });

    if (!credential) {
      throw new NotFoundException(`Credential not found: ${credentialId}`);
    }

    if (credential.vaultProvider !== VaultProvider.INTERNAL) {
      throw new BadRequestException(
        'Cannot update value for external vault credentials',
      );
    }

    // Encrypt new value
    credential.encryptedData = this.encryptionService.encryptCredentialValue(
      dto.value,
    );
    credential.encryptionKeyId = this.encryptionService.getCurrentKeyId();
    credential.version += 1;
    credential.updatedBy = userId;

    await this.credentialRepository.save(credential);

    // Log access
    await this.logAccess(credential, {
      action: 'update',
      userId,
      success: true,
      context: { purpose: dto.reason || 'Value update' },
    });

    this.logger.log(
      `Updated value for credential ${credentialId}, version ${credential.version}`,
    );

    return this.toDetailDto(credential);
  }

  /**
   * Rotate credential
   */
  async rotate(
    tenantId: string,
    credentialId: string,
    userId: string,
    dto: RotateCredentialDto,
  ): Promise<CredentialDetailDto> {
    const credential = await this.credentialRepository.findOne({
      where: { id: credentialId, tenantId },
    });

    if (!credential) {
      throw new NotFoundException(`Credential not found: ${credentialId}`);
    }

    const startTime = Date.now();
    const previousVersion = credential.version;

    try {
      if (dto.newValue) {
        // Manual rotation with new value provided
        credential.encryptedData = this.encryptionService.encryptCredentialValue(
          dto.newValue,
        );
        credential.encryptionKeyId = this.encryptionService.getCurrentKeyId();
      } else if (credential.encryptedData) {
        // Re-encrypt with current key (key rotation)
        credential.encryptedData = this.encryptionService.reencrypt(
          credential.encryptedData,
        );
        credential.encryptionKeyId = this.encryptionService.getCurrentKeyId();
      }

      credential.version += 1;
      credential.updatedBy = userId;

      if (credential.rotationConfig) {
        credential.rotationConfig = {
          ...credential.rotationConfig,
          lastRotatedAt: new Date(),
          nextRotationAt: this.calculateNextRotation(
            credential.rotationConfig.intervalDays || 90,
          ),
          consecutiveFailures: 0,
        };
      }

      await this.credentialRepository.save(credential);

      // Record rotation history
      await this.rotationHistoryRepository.save({
        credentialId: credential.id,
        tenantId,
        triggerType: 'manual',
        initiatedBy: userId,
        previousVersion,
        newVersion: credential.version,
        success: true,
        durationMs: Date.now() - startTime,
        metadata: { strategy: dto.newValue ? 'value_replacement' : 'reencryption' },
      });

      // Log access
      await this.logAccess(credential, {
        action: 'rotate',
        userId,
        success: true,
        context: { purpose: dto.reason || 'Manual rotation' },
      });

      this.logger.log(
        `Rotated credential ${credentialId}, version ${previousVersion} -> ${credential.version}`,
      );

      return this.toDetailDto(credential);
    } catch (error) {
      // Record failed rotation
      await this.rotationHistoryRepository.save({
        credentialId: credential.id,
        tenantId,
        triggerType: 'manual',
        initiatedBy: userId,
        previousVersion,
        newVersion: previousVersion,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Delete credential
   */
  async delete(
    tenantId: string,
    credentialId: string,
    userId: string,
  ): Promise<void> {
    const credential = await this.credentialRepository.findOne({
      where: { id: credentialId, tenantId },
    });

    if (!credential) {
      throw new NotFoundException(`Credential not found: ${credentialId}`);
    }

    // Log deletion before deleting
    await this.logAccess(credential, {
      action: 'delete',
      userId,
      success: true,
      context: { purpose: 'Credential deletion' },
    });

    await this.credentialRepository.remove(credential);

    this.logger.log(
      `Deleted credential ${credentialId} for tenant ${tenantId}`,
    );
  }

  /**
   * Revoke credential (soft delete / deactivate)
   */
  async revoke(
    tenantId: string,
    credentialId: string,
    userId: string,
    reason?: string,
  ): Promise<CredentialDetailDto> {
    const credential = await this.credentialRepository.findOne({
      where: { id: credentialId, tenantId },
    });

    if (!credential) {
      throw new NotFoundException(`Credential not found: ${credentialId}`);
    }

    credential.status = CredentialStatus.REVOKED;
    credential.updatedBy = userId;

    await this.credentialRepository.save(credential);

    // Log revocation
    await this.logAccess(credential, {
      action: 'revoke',
      userId,
      success: true,
      context: { purpose: reason || 'Credential revocation' },
    });

    this.logger.log(
      `Revoked credential ${credentialId} for tenant ${tenantId}`,
    );

    return this.toDetailDto(credential);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CREDENTIAL ACCESS (For bot execution)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetch and decrypt credential for bot execution
   * This is the main method called by runners during bot execution
   */
  async fetchCredential(
    tenantId: string,
    dto: FetchCredentialDto,
  ): Promise<DecryptedCredentialDto> {
    const credential = await this.credentialRepository.findOne({
      where: { key: dto.credentialKey, tenantId },
    });

    if (!credential) {
      await this.logAccessDenied(tenantId, dto, 'Credential not found');
      throw new NotFoundException(
        `Credential not found: ${dto.credentialKey}`,
      );
    }

    // Check status
    if (credential.status !== CredentialStatus.ACTIVE) {
      await this.logAccessDenied(
        tenantId,
        dto,
        `Credential is ${credential.status}`,
        credential,
      );
      throw new ForbiddenException(
        `Credential '${dto.credentialKey}' is ${credential.status}`,
      );
    }

    // Check expiration
    if (credential.expiresAt && credential.expiresAt < new Date()) {
      await this.logAccessDenied(
        tenantId,
        dto,
        'Credential has expired',
        credential,
      );
      throw new ForbiddenException(
        `Credential '${dto.credentialKey}' has expired`,
      );
    }

    // Check access scope
    const accessAllowed = await this.checkAccessScope(
      credential,
      dto.botId,
      dto.environment,
    );

    if (!accessAllowed) {
      await this.logAccessDenied(
        tenantId,
        dto,
        'Access denied by scope policy',
        credential,
      );
      throw new ForbiddenException(
        `Access to credential '${dto.credentialKey}' denied for this bot/environment`,
      );
    }

    // Decrypt credential
    let value: Record<string, any>;

    if (credential.vaultProvider === VaultProvider.INTERNAL) {
      if (!credential.encryptedData) {
        throw new BadRequestException('Credential has no value');
      }
      value = this.encryptionService.decryptCredentialValue(
        credential.encryptedData,
      );
    } else {
      // Fetch from external vault
      value = await this.fetchFromExternalVault(credential);
    }

    // Update access stats
    await this.credentialRepository.update(credential.id, {
      accessCount: () => 'accessCount + 1',
      lastAccessedAt: new Date(),
      lastAccessedBy: null, // System access
      lastAccessedFrom: dto.runnerId,
    });

    // Log successful access
    await this.logAccess(credential, {
      action: 'decrypt',
      userId: null,
      runnerId: dto.runnerId,
      runId: dto.runId,
      botId: dto.botId,
      success: true,
      context: {
        purpose: 'Bot execution',
        nodeName: dto.nodeName,
        nodeId: dto.nodeId,
        environment: dto.environment,
      },
    });

    return {
      id: credential.id,
      key: credential.key,
      type: credential.type,
      value,
      metadata: credential.metadata,
    };
  }

  /**
   * Bulk fetch credentials
   */
  async fetchCredentialsBulk(
    tenantId: string,
    dto: BulkFetchCredentialsDto,
  ): Promise<BulkCredentialsResponseDto> {
    const result: BulkCredentialsResponseDto = {
      credentials: {},
      errors: {},
    };

    for (const key of dto.credentialKeys) {
      try {
        const credential = await this.fetchCredential(tenantId, {
          ...dto,
          credentialKey: key,
        });
        result.credentials[key] = credential;
      } catch (error) {
        result.errors[key] =
          error instanceof Error ? error.message : 'Unknown error';
      }
    }

    return result;
  }

  /**
   * Check access scope for a credential
   */
  private async checkAccessScope(
    credential: Credential,
    botId: string,
    environment?: string,
  ): Promise<boolean> {
    switch (credential.scope) {
      case CredentialScope.GLOBAL:
        return true;

      case CredentialScope.BOT_SPECIFIC:
        return credential.allowedBotIds.includes(botId);

      case CredentialScope.ENVIRONMENT:
        if (!environment) return false;
        return credential.allowedEnvironments.includes(environment);

      case CredentialScope.USER_SPECIFIC:
        // User-specific credentials can't be accessed by bots
        return false;

      default:
        return false;
    }
  }

  /**
   * Fetch credential from external vault
   */
  private async fetchFromExternalVault(
    credential: Credential,
  ): Promise<Record<string, any>> {
    // TODO: Implement external vault integrations
    switch (credential.vaultProvider) {
      case VaultProvider.HASHICORP_VAULT:
        throw new BadRequestException(
          'HashiCorp Vault integration not yet implemented',
        );

      case VaultProvider.AWS_SECRETS_MANAGER:
        throw new BadRequestException(
          'AWS Secrets Manager integration not yet implemented',
        );

      case VaultProvider.AZURE_KEY_VAULT:
        throw new BadRequestException(
          'Azure Key Vault integration not yet implemented',
        );

      case VaultProvider.GCP_SECRET_MANAGER:
        throw new BadRequestException(
          'GCP Secret Manager integration not yet implemented',
        );

      default:
        throw new BadRequestException(
          `Unsupported vault provider: ${credential.vaultProvider}`,
        );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get credential statistics
   */
  async getStats(tenantId: string): Promise<CredentialStatsDto> {
    const now = new Date();
    const thirtyDaysFromNow = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Get counts by type
    const byType = await this.credentialRepository
      .createQueryBuilder('c')
      .select('c.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('c.tenantId = :tenantId', { tenantId })
      .groupBy('c.type')
      .getRawMany();

    // Get counts by status
    const byStatus = await this.credentialRepository
      .createQueryBuilder('c')
      .select('c.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('c.tenantId = :tenantId', { tenantId })
      .groupBy('c.status')
      .getRawMany();

    // Get counts by scope
    const byScope = await this.credentialRepository
      .createQueryBuilder('c')
      .select('c.scope', 'scope')
      .addSelect('COUNT(*)', 'count')
      .where('c.tenantId = :tenantId', { tenantId })
      .groupBy('c.scope')
      .getRawMany();

    // Get counts by vault provider
    const byVaultProvider = await this.credentialRepository
      .createQueryBuilder('c')
      .select('c.vaultProvider', 'provider')
      .addSelect('COUNT(*)', 'count')
      .where('c.tenantId = :tenantId', { tenantId })
      .groupBy('c.vaultProvider')
      .getRawMany();

    // Get total count
    const total = await this.credentialRepository.count({ where: { tenantId } });

    // Get expiring soon count
    const expiringSoon = await this.credentialRepository.count({
      where: {
        tenantId,
        expiresAt: Between(now, thirtyDaysFromNow),
      },
    });

    // Get expired count
    const expired = await this.credentialRepository.count({
      where: {
        tenantId,
        expiresAt: LessThan(now),
        status: CredentialStatus.ACTIVE, // Still active but expired
      },
    });

    // Get rotation due soon (next 7 days)
    const rotationDueSoon = await this.credentialRepository
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId })
      .andWhere("c.rotationConfig->>'enabled' = 'true'")
      .andWhere("(c.rotationConfig->>'nextRotationAt')::timestamp <= :sevenDays", {
        sevenDays: sevenDaysFromNow,
      })
      .getCount();

    // Get accessed today count
    const accessedToday = await this.credentialRepository.count({
      where: {
        tenantId,
        lastAccessedAt: MoreThan(todayStart),
      },
    });

    // Convert to record format
    const typeRecord: Record<CredentialType, number> = {} as any;
    byType.forEach((r) => (typeRecord[r.type] = parseInt(r.count)));

    const statusRecord: Record<CredentialStatus, number> = {} as any;
    byStatus.forEach((r) => (statusRecord[r.status] = parseInt(r.count)));

    const scopeRecord: Record<CredentialScope, number> = {} as any;
    byScope.forEach((r) => (scopeRecord[r.scope] = parseInt(r.count)));

    const vaultRecord: Record<VaultProvider, number> = {} as any;
    byVaultProvider.forEach(
      (r) => (vaultRecord[r.provider] = parseInt(r.count)),
    );

    return {
      total,
      byType: typeRecord,
      byStatus: statusRecord,
      byScope: scopeRecord,
      byVaultProvider: vaultRecord,
      expiringSoon,
      expired,
      rotationDueSoon,
      accessedToday,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESS LOGS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get access logs with filtering
   */
  async getAccessLogs(
    tenantId: string,
    query: ListAccessLogsQueryDto,
  ): Promise<PaginatedAccessLogsDto> {
    const {
      credentialId,
      userId,
      runnerId,
      runId,
      botId,
      action,
      success,
      from,
      to,
      limit = 100,
      offset = 0,
    } = query;

    const qb = this.accessLogRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.credential', 'cred')
      .where('log.tenantId = :tenantId', { tenantId });

    if (credentialId) {
      qb.andWhere('log.credentialId = :credentialId', { credentialId });
    }
    if (userId) {
      qb.andWhere('log.userId = :userId', { userId });
    }
    if (runnerId) {
      qb.andWhere('log.runnerId = :runnerId', { runnerId });
    }
    if (runId) {
      qb.andWhere('log.runId = :runId', { runId });
    }
    if (botId) {
      qb.andWhere('log.botId = :botId', { botId });
    }
    if (action) {
      qb.andWhere('log.action = :action', { action });
    }
    if (success !== undefined) {
      qb.andWhere('log.success = :success', { success });
    }
    if (from) {
      qb.andWhere('log.accessedAt >= :from', { from: new Date(from) });
    }
    if (to) {
      qb.andWhere('log.accessedAt <= :to', { to: new Date(to) });
    }

    const total = await qb.getCount();

    qb.orderBy('log.accessedAt', 'DESC');
    qb.skip(offset).take(limit);

    const logs = await qb.getMany();

    return {
      items: logs.map((log) => ({
        id: log.id,
        credentialId: log.credentialId,
        credentialName: log.credential?.name,
        credentialKey: log.credential?.key,
        userId: log.userId,
        runnerId: log.runnerId,
        runId: log.runId,
        botId: log.botId,
        action: log.action,
        success: log.success,
        denialReason: log.denialReason,
        ipAddress: log.ipAddress,
        context: log.context,
        accessedAt: log.accessedAt,
      })),
      total,
      limit,
      offset,
      hasMore: offset + logs.length < total,
    };
  }

  /**
   * Get rotation history
   */
  async getRotationHistory(
    tenantId: string,
    credentialId: string,
  ): Promise<CredentialRotationHistoryDto[]> {
    const history = await this.rotationHistoryRepository.find({
      where: { credentialId, tenantId },
      order: { rotatedAt: 'DESC' },
      take: 100,
    });

    return history.map((h) => ({
      id: h.id,
      credentialId: h.credentialId,
      triggerType: h.triggerType,
      initiatedBy: h.initiatedBy,
      previousVersion: h.previousVersion,
      newVersion: h.newVersion,
      success: h.success,
      errorMessage: h.errorMessage,
      durationMs: h.durationMs,
      metadata: h.metadata,
      rotatedAt: h.rotatedAt,
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOLDERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create folder
   */
  async createFolder(
    tenantId: string,
    userId: string,
    dto: CreateFolderDto,
  ): Promise<FolderDto> {
    let path = `/${dto.name}`;

    if (dto.parentId) {
      const parent = await this.folderRepository.findOne({
        where: { id: dto.parentId, tenantId },
      });
      if (!parent) {
        throw new NotFoundException(`Parent folder not found: ${dto.parentId}`);
      }
      path = `${parent.path}/${dto.name}`;
    }

    // Check for duplicate path
    const existing = await this.folderRepository.findOne({
      where: { path, tenantId },
    });
    if (existing) {
      throw new ConflictException(`Folder already exists at path: ${path}`);
    }

    const folder = this.folderRepository.create({
      tenantId,
      name: dto.name,
      path,
      parentId: dto.parentId || null,
      description: dto.description || null,
      icon: dto.icon || null,
      createdBy: userId,
    });

    await this.folderRepository.save(folder);

    return this.toFolderDto(folder);
  }

  /**
   * List folders
   */
  async listFolders(
    tenantId: string,
    parentId?: string,
  ): Promise<FolderDto[]> {
    const whereClause: any = { tenantId };
    if (parentId) {
      whereClause.parentId = parentId;
    } else {
      whereClause.parentId = null as any; // Root folders
    }
    const folders = await this.folderRepository.find({
      where: whereClause,
      order: { name: 'ASC' },
    });

    return Promise.all(folders.map((f) => this.toFolderDto(f)));
  }

  /**
   * Update folder
   */
  async updateFolder(
    tenantId: string,
    folderId: string,
    dto: UpdateFolderDto,
  ): Promise<FolderDto> {
    const folder = await this.folderRepository.findOne({
      where: { id: folderId, tenantId },
    });

    if (!folder) {
      throw new NotFoundException(`Folder not found: ${folderId}`);
    }

    if (dto.name !== undefined) folder.name = dto.name;
    if (dto.description !== undefined) folder.description = dto.description;
    if (dto.icon !== undefined) folder.icon = dto.icon;

    // Update path if parent or name changed
    if (dto.parentId !== undefined || dto.name !== undefined) {
      let newPath: string;

      if (dto.parentId === null) {
        newPath = `/${folder.name}`;
      } else if (dto.parentId) {
        const parent = await this.folderRepository.findOne({
          where: { id: dto.parentId, tenantId },
        });
        if (!parent) {
          throw new NotFoundException(`Parent folder not found: ${dto.parentId}`);
        }
        newPath = `${parent.path}/${folder.name}`;
        folder.parentId = dto.parentId;
      } else {
        // Only name changed, recalculate path
        const pathParts = folder.path.split('/');
        pathParts[pathParts.length - 1] = folder.name;
        newPath = pathParts.join('/');
      }

      folder.path = newPath;
    }

    await this.folderRepository.save(folder);

    return this.toFolderDto(folder);
  }

  /**
   * Delete folder
   */
  async deleteFolder(tenantId: string, folderId: string): Promise<void> {
    const folder = await this.folderRepository.findOne({
      where: { id: folderId, tenantId },
    });

    if (!folder) {
      throw new NotFoundException(`Folder not found: ${folderId}`);
    }

    // Check if folder has children
    const childCount = await this.folderRepository.count({
      where: { parentId: folderId, tenantId },
    });

    if (childCount > 0) {
      throw new BadRequestException(
        'Cannot delete folder with child folders. Delete children first.',
      );
    }

    await this.folderRepository.remove(folder);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VAULT CONNECTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create vault connection
   */
  async createVaultConnection(
    tenantId: string,
    userId: string,
    dto: CreateVaultConnectionDto,
  ): Promise<VaultConnectionDto> {
    // Encrypt connection config
    const encryptedConfig = this.encryptionService.encryptCredentialValue(
      dto.config,
    );

    const connection = this.vaultConnectionRepository.create({
      tenantId,
      name: dto.name,
      provider: dto.provider,
      encryptedConfig,
      createdBy: userId,
    });

    await this.vaultConnectionRepository.save(connection);

    return this.toVaultConnectionDto(connection);
  }

  /**
   * List vault connections
   */
  async listVaultConnections(tenantId: string): Promise<VaultConnectionDto[]> {
    const connections = await this.vaultConnectionRepository.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });

    return connections.map((c) => this.toVaultConnectionDto(c));
  }

  /**
   * Test vault connection
   */
  async testVaultConnection(
    tenantId: string,
    connectionId: string,
  ): Promise<{ success: boolean; message: string }> {
    const connection = await this.vaultConnectionRepository.findOne({
      where: { id: connectionId, tenantId },
    });

    if (!connection) {
      throw new NotFoundException(`Vault connection not found: ${connectionId}`);
    }

    // TODO: Implement actual vault connection testing
    return {
      success: false,
      message: 'Vault connection testing not yet implemented',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private calculateNextRotation(intervalDays: number): Date {
    const nextRotation = new Date();
    nextRotation.setDate(nextRotation.getDate() + intervalDays);
    return nextRotation;
  }

  private async logAccess(
    credential: Credential,
    data: {
      action: 'read' | 'decrypt' | 'update' | 'delete' | 'rotate' | 'revoke';
      userId: string | null;
      runnerId?: string;
      runId?: string;
      botId?: string;
      success: boolean;
      denialReason?: string;
      ipAddress?: string;
      userAgent?: string;
      context?: Record<string, any>;
    },
  ): Promise<void> {
    if (!credential.auditConfig?.logAccess) return;
    if (data.action === 'decrypt' && !credential.auditConfig?.logDecryption)
      return;

    await this.accessLogRepository.save({
      credentialId: credential.id,
      tenantId: credential.tenantId,
      userId: data.userId,
      runnerId: data.runnerId || null,
      runId: data.runId || null,
      botId: data.botId || null,
      action: data.action,
      success: data.success,
      denialReason: data.denialReason || null,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
      context: data.context || {},
    });
  }

  private async logAccessDenied(
    tenantId: string,
    dto: FetchCredentialDto,
    reason: string,
    credential?: Credential,
  ): Promise<void> {
    await this.accessLogRepository.save({
      credentialId: credential?.id ?? (undefined as any),
      tenantId,
      userId: undefined as any,
      runnerId: dto.runnerId,
      runId: dto.runId,
      botId: dto.botId,
      action: 'decrypt' as any,
      success: false,
      denialReason: reason,
      context: {
        credentialKey: dto.credentialKey,
        nodeName: dto.nodeName,
        nodeId: dto.nodeId,
        environment: dto.environment,
      },
    });
  }

  private toSummaryDto(credential: Credential): CredentialSummaryDto {
    return {
      id: credential.id,
      name: credential.name,
      key: credential.key,
      description: credential.description,
      type: credential.type,
      status: credential.status,
      scope: credential.scope,
      vaultProvider: credential.vaultProvider,
      labels: credential.labels,
      expiresAt: credential.expiresAt,
      accessCount: credential.accessCount,
      lastAccessedAt: credential.lastAccessedAt,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    };
  }

  private toDetailDto(credential: Credential): CredentialDetailDto {
    return {
      ...this.toSummaryDto(credential),
      metadata: credential.metadata,
      allowedBotIds: credential.allowedBotIds,
      allowedEnvironments: credential.allowedEnvironments,
      ownerUserId: credential.ownerUserId,
      rotationConfig: credential.rotationConfig,
      auditConfig: credential.auditConfig,
      version: credential.version,
      createdBy: credential.createdBy,
      updatedBy: credential.updatedBy,
    };
  }

  private async toFolderDto(folder: CredentialFolder): Promise<FolderDto> {
    return {
      id: folder.id,
      name: folder.name,
      path: folder.path,
      parentId: folder.parentId,
      description: folder.description,
      icon: folder.icon,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  }

  private toVaultConnectionDto(connection: VaultConnection): VaultConnectionDto {
    return {
      id: connection.id,
      name: connection.name,
      provider: connection.provider,
      isActive: connection.isActive,
      lastConnectedAt: connection.lastConnectedAt,
      lastError: connection.lastError,
      healthCheck: connection.healthCheck,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }
}
