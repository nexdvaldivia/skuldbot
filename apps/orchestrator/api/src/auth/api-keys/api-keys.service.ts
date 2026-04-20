import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { ApiKey, ApiKeyScope, ApiKeyEnvironment } from '../../users/entities/api-key.entity';
import { User } from '../../users/entities/user.entity';
import { AuditLog, AuditCategory, AuditAction, AuditResult } from '../../audit/entities/audit-log.entity';
import { TokenService } from '../../common/crypto/password.service';

/**
 * API Key DTOs
 */
export interface CreateApiKeyDto {
  name: string;
  description?: string;
  scopes: ApiKeyScope[];
  allowedIps?: string[];
  expiresAt?: Date;
  environment?: ApiKeyEnvironment;
  rateLimit?: number;
}

export interface UpdateApiKeyDto {
  name?: string;
  description?: string;
  scopes?: ApiKeyScope[];
  allowedIps?: string[];
  rateLimit?: number;
  isActive?: boolean;
}

export interface ApiKeyResponseDto {
  id: string;
  name: string;
  description?: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  allowedIps: string[];
  environment: ApiKeyEnvironment;
  isActive: boolean;
  rateLimit: number;
  usageCount: number;
  lastUsedAt?: Date;
  lastUsedIp?: string;
  expiresAt?: Date;
  createdAt: Date;
  createdBy: {
    id: string;
    email: string;
  };
}

export interface CreateApiKeyResponseDto extends ApiKeyResponseDto {
  key: string; // Only returned on creation!
  warning: string;
}

/**
 * API Key Service.
 *
 * Manages API keys for programmatic access to the platform:
 * - Runner authentication
 * - Third-party integrations
 * - CI/CD pipelines
 * - Webhooks
 *
 * Security features:
 * - Keys are hashed (never stored in plain text)
 * - Scoped permissions
 * - IP whitelist
 * - Expiration dates
 * - Rate limiting
 * - Usage tracking
 */
@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * List all API keys for a tenant.
   */
  async findAll(tenantId: string): Promise<ApiKeyResponseDto[]> {
    const keys = await this.apiKeyRepository.find({
      where: { tenantId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });

    return keys.map(this.toApiKeyResponse);
  }

  /**
   * Get a specific API key.
   */
  async findOne(tenantId: string, keyId: string): Promise<ApiKeyResponseDto> {
    const key = await this.apiKeyRepository.findOne({
      where: { id: keyId, tenantId },
      relations: ['user'],
    });

    if (!key) {
      throw new NotFoundException({
        code: 'API_KEY_NOT_FOUND',
        message: 'API key not found.',
      });
    }

    return this.toApiKeyResponse(key);
  }

  /**
   * Create a new API key.
   * Returns the full key only once - it cannot be retrieved later.
   * @param maxApiKeys - Maximum API keys allowed from license (-1 for unlimited)
   */
  async create(
    tenantId: string,
    dto: CreateApiKeyDto,
    createdBy: User,
    maxApiKeys = -1,
  ): Promise<CreateApiKeyResponseDto> {
    // Check limits from license
    if (maxApiKeys > 0) {
      const currentKeyCount = await this.apiKeyRepository.count({
        where: { tenantId, isActive: true },
      });

      if (currentKeyCount >= maxApiKeys) {
        throw new BadRequestException({
          code: 'API_KEY_LIMIT_REACHED',
          message: `Maximum number of API keys (${maxApiKeys}) reached.`,
        });
      }
    }

    // Validate scopes
    const validScopes = Object.values(ApiKeyScope);
    for (const scope of dto.scopes) {
      if (!validScopes.includes(scope)) {
        throw new BadRequestException({
          code: 'INVALID_SCOPE',
          message: `Invalid scope: ${scope}`,
        });
      }
    }

    // Generate API key
    const environment = dto.environment || ApiKeyEnvironment.LIVE;
    const { key, hash, prefix } = this.tokenService.generateApiKey(environment === ApiKeyEnvironment.LIVE ? 'live' : 'test');

    // Create API key record
    const apiKey = this.apiKeyRepository.create({
      name: dto.name,
      description: dto.description,
      keyHash: hash,
      keyPrefix: prefix,
      scopes: dto.scopes,
      allowedIps: dto.allowedIps || [],
      environment,
      tenantId,
      userId: createdBy.id,
      rateLimit: dto.rateLimit || 1000,
      expiresAt: dto.expiresAt,
    });

    await this.apiKeyRepository.save(apiKey);

    // Audit log
    await this.auditRepository.save({
      tenantId,
      userId: createdBy.id,
      userEmail: createdBy.email,
      category: AuditCategory.SETTING,
      action: AuditAction.CREATE,
      result: AuditResult.SUCCESS,
      resourceType: 'api_key',
      resourceId: apiKey.id,
      resourceName: apiKey.name,
      newState: {
        name: apiKey.name,
        scopes: apiKey.scopes,
        environment,
        expiresAt: apiKey.expiresAt,
      },
    });

    return {
      ...this.toApiKeyResponse(apiKey),
      key, // Only returned on creation!
      warning: 'Store this API key securely. It will not be shown again.',
    };
  }

  /**
   * Update an API key.
   */
  async update(
    tenantId: string,
    keyId: string,
    dto: UpdateApiKeyDto,
    updatedBy: User,
  ): Promise<ApiKeyResponseDto> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { id: keyId, tenantId },
      relations: ['user'],
    });

    if (!apiKey) {
      throw new NotFoundException({
        code: 'API_KEY_NOT_FOUND',
        message: 'API key not found.',
      });
    }

    const previousState = {
      name: apiKey.name,
      scopes: apiKey.scopes,
      allowedIps: apiKey.allowedIps,
      rateLimit: apiKey.rateLimit,
      isActive: apiKey.isActive,
    };

    // Update fields
    if (dto.name !== undefined) apiKey.name = dto.name;
    if (dto.description !== undefined) apiKey.description = dto.description;
    if (dto.scopes !== undefined) apiKey.scopes = dto.scopes;
    if (dto.allowedIps !== undefined) apiKey.allowedIps = dto.allowedIps;
    if (dto.rateLimit !== undefined) apiKey.rateLimit = dto.rateLimit;
    if (dto.isActive !== undefined) apiKey.isActive = dto.isActive;

    await this.apiKeyRepository.save(apiKey);

    // Audit log
    await this.auditRepository.save({
      tenantId,
      userId: updatedBy.id,
      userEmail: updatedBy.email,
      category: AuditCategory.SETTING,
      action: AuditAction.UPDATE,
      result: AuditResult.SUCCESS,
      resourceType: 'api_key',
      resourceId: apiKey.id,
      resourceName: apiKey.name,
      previousState,
      newState: {
        name: apiKey.name,
        scopes: apiKey.scopes,
        allowedIps: apiKey.allowedIps,
        rateLimit: apiKey.rateLimit,
        isActive: apiKey.isActive,
      },
    });

    return this.toApiKeyResponse(apiKey);
  }

  /**
   * Revoke (delete) an API key.
   */
  async revoke(
    tenantId: string,
    keyId: string,
    revokedBy: User,
  ): Promise<void> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { id: keyId, tenantId },
    });

    if (!apiKey) {
      throw new NotFoundException({
        code: 'API_KEY_NOT_FOUND',
        message: 'API key not found.',
      });
    }

    // Soft delete - mark as inactive and revoked
    apiKey.isActive = false;
    apiKey.revokedAt = new Date();
    apiKey.revokedBy = revokedBy.id;

    await this.apiKeyRepository.save(apiKey);

    // Audit log
    await this.auditRepository.save({
      tenantId,
      userId: revokedBy.id,
      userEmail: revokedBy.email,
      category: AuditCategory.SETTING,
      action: AuditAction.DELETE,
      result: AuditResult.SUCCESS,
      resourceType: 'api_key',
      resourceId: apiKey.id,
      resourceName: apiKey.name,
      previousState: { isActive: true },
      newState: { isActive: false, revokedAt: apiKey.revokedAt },
    });
  }

  /**
   * Regenerate an API key.
   * Creates a new key with the same settings, revokes the old one.
   */
  async regenerate(
    tenantId: string,
    keyId: string,
    regeneratedBy: User,
  ): Promise<CreateApiKeyResponseDto> {
    const oldKey = await this.apiKeyRepository.findOne({
      where: { id: keyId, tenantId },
    });

    if (!oldKey) {
      throw new NotFoundException({
        code: 'API_KEY_NOT_FOUND',
        message: 'API key not found.',
      });
    }

    // Create new key with same settings
    const newKey = await this.create(
      tenantId,
      {
        name: oldKey.name,
        description: oldKey.description || undefined,
        scopes: oldKey.scopes,
        allowedIps: oldKey.allowedIps,
        environment: oldKey.environment,
        rateLimit: oldKey.rateLimit,
        expiresAt: oldKey.expiresAt || undefined,
      },
      regeneratedBy,
    );

    // Revoke old key
    await this.revoke(tenantId, keyId, regeneratedBy);

    return newKey;
  }

  /**
   * Validate an API key and return the associated user/tenant.
   * Used by ApiKeyGuard.
   */
  async validateKey(
    key: string,
    clientIp: string,
    requiredScopes?: ApiKeyScope[],
  ): Promise<{ apiKey: ApiKey; user: User }> {
    // Hash the provided key
    const keyHash = this.tokenService.hashToken(key);

    // Find API key by hash
    const apiKey = await this.apiKeyRepository.findOne({
      where: { keyHash },
      relations: ['user', 'user.roles', 'user.roles.permissions'],
    });

    if (!apiKey) {
      throw new ForbiddenException({
        code: 'INVALID_API_KEY',
        message: 'Invalid API key.',
      });
    }

    // Check if active
    if (!apiKey.isActive) {
      throw new ForbiddenException({
        code: 'API_KEY_REVOKED',
        message: 'This API key has been revoked.',
      });
    }

    // Check expiration
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new ForbiddenException({
        code: 'API_KEY_EXPIRED',
        message: 'This API key has expired.',
      });
    }

    // Check IP whitelist
    if (apiKey.allowedIps && apiKey.allowedIps.length > 0) {
      if (!apiKey.allowedIps.includes(clientIp)) {
        throw new ForbiddenException({
          code: 'IP_NOT_ALLOWED',
          message: 'Request from this IP address is not allowed.',
        });
      }
    }

    // Check scopes
    if (requiredScopes && requiredScopes.length > 0) {
      const hasAllScopes = requiredScopes.every((scope) =>
        apiKey.scopes.includes(scope),
      );

      if (!hasAllScopes) {
        throw new ForbiddenException({
          code: 'INSUFFICIENT_SCOPES',
          message: 'API key does not have required scopes.',
        });
      }
    }

    // Update usage tracking
    apiKey.usageCount += 1;
    apiKey.lastUsedAt = new Date();
    apiKey.lastUsedIp = clientIp;

    // Save async (don't block the request)
    this.apiKeyRepository.save(apiKey).catch(() => {
      // Ignore errors in usage tracking
    });

    return { apiKey, user: apiKey.user };
  }

  /**
   * Get usage statistics for an API key.
   */
  async getUsageStats(
    tenantId: string,
    keyId: string,
  ): Promise<{
    totalUsage: number;
    lastUsedAt?: Date;
    lastUsedIp?: string;
    usageByDay?: { date: string; count: number }[];
  }> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { id: keyId, tenantId },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    // TODO: Implement detailed usage tracking with time series data
    return {
      totalUsage: apiKey.usageCount,
      lastUsedAt: apiKey.lastUsedAt,
      lastUsedIp: apiKey.lastUsedIp,
    };
  }

  /**
   * List all available scopes.
   */
  getAvailableScopes(): {
    scope: ApiKeyScope;
    displayName: string;
    description: string;
  }[] {
    return [
      {
        scope: ApiKeyScope.BOTS_READ,
        displayName: 'Read Bots',
        description: 'View bots and their configurations',
      },
      {
        scope: ApiKeyScope.BOTS_WRITE,
        displayName: 'Write Bots',
        description: 'Create, update, and delete bots',
      },
      {
        scope: ApiKeyScope.BOTS_EXECUTE,
        displayName: 'Execute Bots',
        description: 'Trigger bot executions',
      },
      {
        scope: ApiKeyScope.RUNS_READ,
        displayName: 'Read Runs',
        description: 'View run history and logs',
      },
      {
        scope: ApiKeyScope.RUNS_WRITE,
        displayName: 'Write Runs',
        description: 'Create and cancel runs',
      },
      {
        scope: ApiKeyScope.RUNNERS_READ,
        displayName: 'Read Runners',
        description: 'View runner status and configurations',
      },
      {
        scope: ApiKeyScope.RUNNERS_WRITE,
        displayName: 'Write Runners',
        description: 'Register and manage runners',
      },
      {
        scope: ApiKeyScope.SCHEDULES_READ,
        displayName: 'Read Schedules',
        description: 'View schedules',
      },
      {
        scope: ApiKeyScope.SCHEDULES_WRITE,
        displayName: 'Write Schedules',
        description: 'Create, update, and delete schedules',
      },
      {
        scope: ApiKeyScope.WEBHOOKS,
        displayName: 'Webhooks',
        description: 'Receive and send webhook events',
      },
    ];
  }

  /**
   * Clean up expired API keys.
   * Called by a scheduled job.
   */
  async cleanupExpiredKeys(): Promise<number> {
    const result = await this.apiKeyRepository.update(
      {
        isActive: true,
        expiresAt: LessThan(new Date()),
      },
      {
        isActive: false,
        revokedAt: new Date(),
      },
    );

    return result.affected || 0;
  }

  /**
   * Convert API key entity to response DTO.
   */
  private toApiKeyResponse(apiKey: ApiKey): ApiKeyResponseDto {
    return {
      id: apiKey.id,
      name: apiKey.name,
      description: apiKey.description,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      allowedIps: apiKey.allowedIps || [],
      environment: apiKey.environment,
      isActive: apiKey.isActive,
      rateLimit: apiKey.rateLimit,
      usageCount: apiKey.usageCount,
      lastUsedAt: apiKey.lastUsedAt,
      lastUsedIp: apiKey.lastUsedIp,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
      createdBy: apiKey.user
        ? {
            id: apiKey.user.id,
            email: apiKey.user.email,
          }
        : { id: apiKey.userId, email: '' },
    };
  }
}
