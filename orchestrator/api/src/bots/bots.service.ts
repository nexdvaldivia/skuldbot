import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as crypto from 'crypto';
import { Bot, BotVersion, BotStatus, VersionStatus } from './entities/bot.entity';
import { User } from '../users/entities/user.entity';
import { CompilerService } from '../compiler/compiler.service';
import {
  CreateBotDto,
  UpdateBotDto,
  CreateBotVersionDto,
  UpdateBotVersionDto,
  PublishVersionDto,
  DeprecateVersionDto,
  ListBotsQueryDto,
  BotSummaryDto,
  BotDetailDto,
  BotVersionSummaryDto,
  BotVersionDetailDto,
  PaginatedBotsDto,
  ExportBotDto,
  ImportBotDto,
  BotExportDataDto,
  CloneBotDto,
  ShareBotDto,
  ToggleFavoriteDto,
} from './dto/create-bot.dto';
import { CompileBotDto, CompileResultDto } from './dto/compile-bot.dto';
import { BotDSL } from '@skuldbot/compiler';

/**
 * Bots Service.
 *
 * Provides comprehensive bot management with enterprise features:
 *
 * Core Features:
 * - Bot CRUD with version control
 * - DSL compilation and validation
 * - Publishing workflow
 * - Export/Import for migration
 * - Clone functionality
 * - Favorites and organization
 *
 * Enterprise Features:
 * - Access control (sharing)
 * - Usage statistics
 * - Webhook support
 * - Credential references
 * - Notification configuration
 *
 * Security:
 * - Tenant isolation
 * - Permission-based access
 * - Audit logging (via controller)
 */
@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);

  constructor(
    @InjectRepository(Bot)
    private readonly botRepository: Repository<Bot>,
    @InjectRepository(BotVersion)
    private readonly versionRepository: Repository<BotVersion>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly compilerService: CompilerService,
  ) {}

  // ============================================================================
  // BOT CRUD
  // ============================================================================

  /**
   * Create a new bot.
   */
  async create(
    tenantId: string,
    dto: CreateBotDto,
    currentUser: User,
  ): Promise<BotDetailDto> {
    // Check tenant quota
    await this.checkBotQuota(tenantId);

    const bot = this.botRepository.create({
      tenantId,
      ...dto,
      createdBy: currentUser.id,
      status: BotStatus.DRAFT,
      // Generate webhook secret if webhook trigger is enabled
      webhookSecret: dto.allowWebhookTrigger
        ? this.generateWebhookSecret()
        : undefined,
    });

    const saved = await this.botRepository.save(bot);
    return this.toDetailDto(saved, currentUser.id);
  }

  /**
   * List bots with filtering and pagination.
   */
  async findAll(
    tenantId: string,
    query: ListBotsQueryDto,
    currentUser: User,
  ): Promise<PaginatedBotsDto> {
    const {
      status,
      category,
      search,
      tags,
      createdBy,
      folderId,
      favoritesOnly,
      page = 1,
      limit = 20,
      sortBy = 'updatedAt',
      sortOrder = 'DESC',
    } = query;

    const queryBuilder = this.botRepository
      .createQueryBuilder('bot')
      .leftJoinAndSelect('bot.creator', 'creator')
      .where('bot.tenantId = :tenantId', { tenantId });

    // Access control: show bots the user can access
    queryBuilder.andWhere(
      '(bot.createdBy = :userId OR bot.isPublic = true OR bot.sharedWithUserIds @> :userIdArray OR EXISTS (SELECT 1 FROM unnest(bot.sharedWithRoleIds) as rid WHERE rid = ANY(:roleIds)))',
      {
        userId: currentUser.id,
        userIdArray: JSON.stringify([currentUser.id]),
        roleIds: currentUser.roles?.map((r) => r.id) || [],
      },
    );

    // Filters
    if (status) {
      queryBuilder.andWhere('bot.status = :status', { status });
    } else {
      // By default, exclude archived
      queryBuilder.andWhere('bot.status != :archivedStatus', {
        archivedStatus: BotStatus.ARCHIVED,
      });
    }

    if (category) {
      queryBuilder.andWhere('bot.category = :category', { category });
    }

    if (search) {
      queryBuilder.andWhere(
        '(bot.name ILIKE :search OR bot.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (tags && tags.length > 0) {
      queryBuilder.andWhere('bot.tags @> :tags', {
        tags: JSON.stringify(tags),
      });
    }

    if (createdBy) {
      queryBuilder.andWhere('bot.createdBy = :createdBy', { createdBy });
    }

    if (folderId) {
      queryBuilder.andWhere('bot.folderId = :folderId', { folderId });
    }

    if (favoritesOnly) {
      queryBuilder.andWhere('bot.favoritedBy @> :userIdArray', {
        userIdArray: JSON.stringify([currentUser.id]),
      });
    }

    // Sorting
    const sortColumn = `bot.${sortBy}`;
    queryBuilder.orderBy(sortColumn, sortOrder);

    // Pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const [bots, total] = await queryBuilder.getManyAndCount();

    return {
      bots: bots.map((bot) => this.toSummaryDto(bot, currentUser.id)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get bot by ID.
   */
  async findOne(
    tenantId: string,
    botId: string,
    currentUser: User,
  ): Promise<BotDetailDto> {
    const bot = await this.findBotOrFail(tenantId, botId);

    // Check access
    this.checkBotAccess(bot, currentUser);

    // Increment view count
    bot.viewCount++;
    await this.botRepository.save(bot);

    return this.toDetailDto(bot, currentUser.id);
  }

  /**
   * Update bot.
   */
  async update(
    tenantId: string,
    botId: string,
    dto: UpdateBotDto,
    currentUser: User,
  ): Promise<BotDetailDto> {
    const bot = await this.findBotOrFail(tenantId, botId);

    // Check edit access
    this.checkBotEditAccess(bot, currentUser);

    // Generate webhook secret if enabling webhook trigger
    if (dto.allowWebhookTrigger && !bot.webhookSecret) {
      bot.webhookSecret = this.generateWebhookSecret();
    }

    // Merge updates
    Object.assign(bot, dto);
    bot.updatedBy = currentUser.id;

    const saved = await this.botRepository.save(bot);
    return this.toDetailDto(saved, currentUser.id);
  }

  /**
   * Delete bot.
   */
  async remove(
    tenantId: string,
    botId: string,
    currentUser: User,
  ): Promise<void> {
    const bot = await this.findBotOrFail(tenantId, botId);

    // Check edit access
    this.checkBotEditAccess(bot, currentUser);

    // TODO: Check if there are active schedules or pending runs

    await this.botRepository.remove(bot);
  }

  /**
   * Archive bot.
   */
  async archive(
    tenantId: string,
    botId: string,
    currentUser: User,
  ): Promise<BotDetailDto> {
    const bot = await this.findBotOrFail(tenantId, botId);

    // Check edit access
    this.checkBotEditAccess(bot, currentUser);

    bot.status = BotStatus.ARCHIVED;
    bot.archivedAt = new Date();
    bot.archivedBy = currentUser.id;

    const saved = await this.botRepository.save(bot);
    return this.toDetailDto(saved, currentUser.id);
  }

  /**
   * Restore archived bot.
   */
  async restore(
    tenantId: string,
    botId: string,
    currentUser: User,
  ): Promise<BotDetailDto> {
    const bot = await this.findBotOrFail(tenantId, botId);

    if (bot.status !== BotStatus.ARCHIVED) {
      throw new BadRequestException({
        code: 'BOT_NOT_ARCHIVED',
        message: 'Bot is not archived.',
      });
    }

    // Check edit access
    this.checkBotEditAccess(bot, currentUser);

    bot.status = bot.currentVersionId ? BotStatus.ACTIVE : BotStatus.DRAFT;
    bot.archivedAt = undefined!;
    bot.archivedBy = undefined!;

    const saved = await this.botRepository.save(bot);
    return this.toDetailDto(saved, currentUser.id);
  }

  // ============================================================================
  // BOT VERSIONS
  // ============================================================================

  /**
   * Create a new version.
   */
  async createVersion(
    tenantId: string,
    botId: string,
    dto: CreateBotVersionDto,
    currentUser: User,
  ): Promise<BotVersionDetailDto> {
    const bot = await this.findBotOrFail(tenantId, botId);
    this.checkBotEditAccess(bot, currentUser);

    // Validate DSL
    const validation = this.compilerService.validateDSL(dto.dsl);
    if (!validation.valid) {
      throw new BadRequestException({
        code: 'INVALID_DSL',
        message: 'Invalid DSL',
        errors: validation.errors,
      });
    }

    // Check version uniqueness
    const existingVersion = await this.versionRepository.findOne({
      where: { botId, version: dto.version },
    });

    if (existingVersion) {
      throw new BadRequestException({
        code: 'VERSION_EXISTS',
        message: `Version ${dto.version} already exists for this bot.`,
      });
    }

    // Calculate stats from DSL
    const dsl = dto.dsl as any;
    const nodeCount = dsl.nodes?.length || 0;
    const edgeCount = dsl.edges?.length || 0;
    const nodeTypes = this.calculateNodeTypes(dsl);

    const version = this.versionRepository.create({
      botId: bot.id,
      ...dto,
      status: VersionStatus.DRAFT,
      nodeCount,
      edgeCount,
      nodeTypes,
      createdBy: currentUser.id,
    });

    const saved = await this.versionRepository.save(version);

    // Update bot draft version
    bot.draftVersionId = saved.id;
    bot.totalVersions++;
    await this.botRepository.save(bot);

    return this.toVersionDetailDto(saved);
  }

  /**
   * List versions for a bot.
   */
  async findVersions(
    tenantId: string,
    botId: string,
    currentUser: User,
  ): Promise<BotVersionSummaryDto[]> {
    const bot = await this.findBotOrFail(tenantId, botId);
    this.checkBotAccess(bot, currentUser);

    const versions = await this.versionRepository.find({
      where: { botId },
      relations: ['creator'],
      order: { createdAt: 'DESC' },
    });

    return versions.map((v) => this.toVersionSummaryDto(v));
  }

  /**
   * Get a specific version.
   */
  async findVersion(
    tenantId: string,
    botId: string,
    versionId: string,
    currentUser: User,
  ): Promise<BotVersionDetailDto> {
    const bot = await this.findBotOrFail(tenantId, botId);
    this.checkBotAccess(bot, currentUser);

    const version = await this.findVersionOrFail(botId, versionId);
    return this.toVersionDetailDto(version);
  }

  /**
   * Update a version.
   */
  async updateVersion(
    tenantId: string,
    botId: string,
    versionId: string,
    dto: UpdateBotVersionDto,
    currentUser: User,
  ): Promise<BotVersionDetailDto> {
    const bot = await this.findBotOrFail(tenantId, botId);
    this.checkBotEditAccess(bot, currentUser);

    const version = await this.findVersionOrFail(botId, versionId);

    if (version.isPublished) {
      throw new BadRequestException({
        code: 'CANNOT_UPDATE_PUBLISHED',
        message: 'Cannot update a published version. Create a new version instead.',
      });
    }

    if (dto.dsl) {
      const validation = this.compilerService.validateDSL(dto.dsl);
      if (!validation.valid) {
        throw new BadRequestException({
          code: 'INVALID_DSL',
          message: 'Invalid DSL',
          errors: validation.errors,
        });
      }

      version.dsl = dto.dsl;
      // Update stats
      const dsl = dto.dsl as any;
      version.nodeCount = dsl.nodes?.length || 0;
      version.edgeCount = dsl.edges?.length || 0;
      version.nodeTypes = this.calculateNodeTypes(dsl);
      // Clear compilation
      version.compiledPlan = undefined!;
      version.planHash = undefined!;
      version.compiledAt = undefined!;
      version.status = VersionStatus.DRAFT;
    }

    if (dto.ui !== undefined) {
      version.ui = dto.ui;
    }

    if (dto.label !== undefined) {
      version.label = dto.label;
    }

    if (dto.changeNotes !== undefined) {
      version.changeNotes = dto.changeNotes;
    }

    if (dto.metadata !== undefined) {
      version.metadata = dto.metadata;
    }

    version.updatedBy = currentUser.id;

    const saved = await this.versionRepository.save(version);
    return this.toVersionDetailDto(saved);
  }

  /**
   * Delete a version.
   */
  async deleteVersion(
    tenantId: string,
    botId: string,
    versionId: string,
    currentUser: User,
  ): Promise<void> {
    const bot = await this.findBotOrFail(tenantId, botId);
    this.checkBotEditAccess(bot, currentUser);

    const version = await this.findVersionOrFail(botId, versionId);

    if (version.isPublished) {
      throw new BadRequestException({
        code: 'CANNOT_DELETE_PUBLISHED',
        message: 'Cannot delete a published version.',
      });
    }

    await this.versionRepository.remove(version);

    // Update bot version counts
    bot.totalVersions--;
    if (bot.draftVersionId === versionId) {
      bot.draftVersionId = undefined!;
    }
    await this.botRepository.save(bot);
  }

  // ============================================================================
  // COMPILATION
  // ============================================================================

  /**
   * Compile a version.
   */
  async compileVersion(
    tenantId: string,
    botId: string,
    versionId: string,
    dto: CompileBotDto = {},
    currentUser: User,
  ): Promise<CompileResultDto> {
    const bot = await this.findBotOrFail(tenantId, botId);
    this.checkBotAccess(bot, currentUser);

    const version = await this.findVersionOrFail(botId, versionId);

    // Check if already compiled and not forcing
    if (version.compiledPlan && version.planHash && !dto.force) {
      this.logger.log(`Version ${versionId} already compiled, returning cached`);
      return {
        success: true,
        planHash: version.planHash,
        stepsCount: (version.compiledPlan as any).steps?.length ?? 0,
        errors: [],
        warnings: version.compilationWarnings || [],
        compiledAt: version.compiledAt?.toISOString(),
      };
    }

    const dsl = version.dsl as BotDSL;

    const result = await this.compilerService.compile({
      dsl,
      tenantId,
      botId,
      botVersion: version.version,
    });

    if (result.success && result.plan) {
      version.compiledPlan = result.plan as any;
      version.planHash = result.planHash ?? null;
      version.compiledAt = new Date();
      version.compilationErrors = [];
      version.compilationWarnings = result.warnings || [];
      version.status = VersionStatus.COMPILED;

      await this.versionRepository.save(version);

      this.logger.log(
        `Compiled version ${versionId}: ${result.plan.steps.length} steps`,
      );
    } else {
      version.compilationErrors = result.errors || [];
      version.compilationWarnings = result.warnings || [];
      await this.versionRepository.save(version);
    }

    return {
      success: result.success,
      planHash: result.planHash,
      stepsCount: result.plan?.steps.length,
      errors: result.errors,
      warnings: result.warnings,
      compiledAt: result.success ? new Date().toISOString() : undefined,
    };
  }

  // ============================================================================
  // PUBLISHING
  // ============================================================================

  /**
   * Publish a version.
   */
  async publishVersion(
    tenantId: string,
    botId: string,
    versionId: string,
    dto: PublishVersionDto,
    currentUser: User,
  ): Promise<BotVersionDetailDto> {
    const bot = await this.findBotOrFail(tenantId, botId);
    this.checkBotEditAccess(bot, currentUser);

    const version = await this.findVersionOrFail(botId, versionId);

    if (version.isPublished) {
      throw new BadRequestException({
        code: 'ALREADY_PUBLISHED',
        message: 'Version is already published.',
      });
    }

    // Ensure compiled
    if (!version.compiledPlan) {
      const compileResult = await this.compileVersion(
        tenantId,
        botId,
        versionId,
        {},
        currentUser,
      );

      if (!compileResult.success) {
        throw new BadRequestException({
          code: 'COMPILATION_FAILED',
          message: 'Cannot publish: compilation failed.',
          errors: compileResult.errors,
        });
      }
    }

    // Update release notes if provided
    if (dto.releaseNotes) {
      version.changeNotes = dto.releaseNotes;
    }

    version.isPublished = true;
    version.publishedAt = new Date();
    version.publishedBy = currentUser.id;
    version.status = VersionStatus.PUBLISHED;

    const saved = await this.versionRepository.save(version);

    // Update bot if setting as active
    if (dto.setAsActive !== false) {
      bot.currentVersionId = saved.id;
      if (bot.status === BotStatus.DRAFT) {
        bot.status = BotStatus.ACTIVE;
      }
      await this.botRepository.save(bot);
    }

    return this.toVersionDetailDto(saved);
  }

  /**
   * Deprecate a version.
   */
  async deprecateVersion(
    tenantId: string,
    botId: string,
    versionId: string,
    dto: DeprecateVersionDto,
    currentUser: User,
  ): Promise<BotVersionDetailDto> {
    const bot = await this.findBotOrFail(tenantId, botId);
    this.checkBotEditAccess(bot, currentUser);

    const version = await this.findVersionOrFail(botId, versionId);

    if (!version.isPublished) {
      throw new BadRequestException({
        code: 'NOT_PUBLISHED',
        message: 'Cannot deprecate an unpublished version.',
      });
    }

    if (bot.currentVersionId === versionId) {
      throw new BadRequestException({
        code: 'CANNOT_DEPRECATE_ACTIVE',
        message: 'Cannot deprecate the active version. Set another version as active first.',
      });
    }

    version.status = VersionStatus.DEPRECATED;
    version.deprecatedAt = new Date();
    version.deprecatedBy = currentUser.id;
    version.deprecationReason = dto.reason;

    const saved = await this.versionRepository.save(version);
    return this.toVersionDetailDto(saved);
  }

  /**
   * Get latest published version.
   */
  async getLatestPublishedVersion(
    tenantId: string,
    botId: string,
    currentUser: User,
  ): Promise<BotVersionDetailDto | null> {
    const bot = await this.findBotOrFail(tenantId, botId);
    this.checkBotAccess(bot, currentUser);

    const version = await this.versionRepository.findOne({
      where: { botId, isPublished: true },
      order: { publishedAt: 'DESC' },
    });

    return version ? this.toVersionDetailDto(version) : null;
  }

  // ============================================================================
  // CLONE & EXPORT/IMPORT
  // ============================================================================

  /**
   * Clone a bot.
   */
  async clone(
    tenantId: string,
    botId: string,
    dto: CloneBotDto,
    currentUser: User,
  ): Promise<BotDetailDto> {
    const sourceBot = await this.findBotOrFail(tenantId, botId);
    this.checkBotAccess(sourceBot, currentUser);

    // Check quota
    await this.checkBotQuota(tenantId);

    // Create new bot
    const newBot = this.botRepository.create({
      tenantId,
      name: dto.name,
      description: dto.description || sourceBot.description,
      category: sourceBot.category,
      tags: sourceBot.tags,
      iconUrl: sourceBot.iconUrl,
      color: sourceBot.color,
      timeoutSeconds: sourceBot.timeoutSeconds,
      maxRetries: sourceBot.maxRetries,
      retryDelaySeconds: sourceBot.retryDelaySeconds,
      priority: sourceBot.priority,
      allowManualTrigger: sourceBot.allowManualTrigger,
      allowApiTrigger: sourceBot.allowApiTrigger,
      allowWebhookTrigger: sourceBot.allowWebhookTrigger,
      notifications: sourceBot.notifications,
      createdBy: currentUser.id,
      status: BotStatus.DRAFT,
    });

    const savedBot = await this.botRepository.save(newBot);

    // Clone versions
    let versionsToClone: BotVersion[];

    if (dto.includeAllVersions) {
      versionsToClone = await this.versionRepository.find({
        where: { botId: sourceBot.id },
        order: { createdAt: 'ASC' },
      });
    } else {
      // Only clone the current published version or draft
      const versionId = sourceBot.currentVersionId || sourceBot.draftVersionId;
      if (versionId) {
        const version = await this.versionRepository.findOne({
          where: { id: versionId },
        });
        versionsToClone = version ? [version] : [];
      } else {
        versionsToClone = [];
      }
    }

    for (const sourceVersion of versionsToClone) {
      const newVersion = this.versionRepository.create({
        botId: savedBot.id,
        version: sourceVersion.version,
        label: sourceVersion.label,
        changeNotes: `Cloned from ${sourceBot.name}`,
        dsl: sourceVersion.dsl,
        ui: sourceVersion.ui,
        nodeCount: sourceVersion.nodeCount,
        edgeCount: sourceVersion.edgeCount,
        nodeTypes: sourceVersion.nodeTypes,
        createdBy: currentUser.id,
        status: VersionStatus.DRAFT,
      });

      const savedVersion = await this.versionRepository.save(newVersion);

      if (!savedBot.draftVersionId) {
        savedBot.draftVersionId = savedVersion.id;
      }
      savedBot.totalVersions++;
    }

    await this.botRepository.save(savedBot);

    return this.toDetailDto(savedBot, currentUser.id);
  }

  /**
   * Export a bot.
   */
  async exportBot(
    tenantId: string,
    botId: string,
    dto: ExportBotDto,
    currentUser: User,
  ): Promise<BotExportDataDto> {
    const bot = await this.findBotOrFail(tenantId, botId);
    this.checkBotAccess(bot, currentUser);

    let versions: BotVersion[];

    if (dto.includeAllVersions) {
      versions = await this.versionRepository.find({
        where: { botId },
        order: { createdAt: 'ASC' },
      });
    } else {
      const versionId = bot.currentVersionId || bot.draftVersionId;
      if (versionId) {
        const version = await this.versionRepository.findOne({
          where: { id: versionId },
        });
        versions = version ? [version] : [];
      } else {
        versions = [];
      }
    }

    return {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      bot: {
        name: bot.name,
        description: bot.description,
        category: bot.category,
        tags: bot.tags || [],
        timeoutSeconds: bot.timeoutSeconds,
        maxRetries: bot.maxRetries,
        retryDelaySeconds: bot.retryDelaySeconds,
        priority: bot.priority,
        allowManualTrigger: bot.allowManualTrigger,
        allowApiTrigger: bot.allowApiTrigger,
        allowWebhookTrigger: bot.allowWebhookTrigger,
        notifications: bot.notifications,
        metadata: dto.includeMetadata ? bot.metadata : undefined,
        settings: dto.includeSettings ? bot.settings : undefined,
      },
      versions: versions.map((v) => ({
        version: v.version,
        label: v.label,
        changeNotes: v.changeNotes,
        dsl: v.dsl,
        ui: v.ui,
        metadata: dto.includeMetadata ? v.metadata : undefined,
        isPublished: v.isPublished,
      })),
    };
  }

  /**
   * Import a bot.
   */
  async importBot(
    tenantId: string,
    dto: ImportBotDto,
    currentUser: User,
  ): Promise<BotDetailDto> {
    // Check quota
    await this.checkBotQuota(tenantId);

    const exportData = dto.exportData as BotExportDataDto;

    if (!exportData.bot || !exportData.versions) {
      throw new BadRequestException({
        code: 'INVALID_EXPORT_DATA',
        message: 'Invalid export data format.',
      });
    }

    const botName = dto.newName || exportData.bot.name;

    // Check for existing bot with same name
    if (!dto.overwriteExisting) {
      const existing = await this.botRepository.findOne({
        where: { tenantId, name: botName },
      });

      if (existing) {
        throw new BadRequestException({
          code: 'BOT_NAME_EXISTS',
          message: `Bot with name "${botName}" already exists.`,
        });
      }
    }

    // Create bot
    const newBot = this.botRepository.create({
      tenantId,
      name: botName,
      description: exportData.bot.description,
      category: exportData.bot.category,
      tags: exportData.bot.tags,
      timeoutSeconds: exportData.bot.timeoutSeconds,
      maxRetries: exportData.bot.maxRetries,
      retryDelaySeconds: exportData.bot.retryDelaySeconds,
      priority: exportData.bot.priority,
      allowManualTrigger: exportData.bot.allowManualTrigger,
      allowApiTrigger: exportData.bot.allowApiTrigger,
      allowWebhookTrigger: exportData.bot.allowWebhookTrigger,
      notifications: exportData.bot.notifications,
      metadata: exportData.bot.metadata,
      settings: exportData.bot.settings,
      createdBy: currentUser.id,
      status: BotStatus.DRAFT,
    });

    const savedBot = await this.botRepository.save(newBot);

    // Create versions
    for (const versionData of exportData.versions) {
      const dsl = versionData.dsl as any;

      const newVersion = this.versionRepository.create({
        botId: savedBot.id,
        version: versionData.version,
        label: versionData.label,
        changeNotes: versionData.changeNotes || 'Imported',
        dsl: versionData.dsl,
        ui: versionData.ui,
        metadata: versionData.metadata,
        nodeCount: dsl.nodes?.length || 0,
        edgeCount: dsl.edges?.length || 0,
        nodeTypes: this.calculateNodeTypes(dsl),
        createdBy: currentUser.id,
        status: VersionStatus.DRAFT,
      });

      const savedVersion = await this.versionRepository.save(newVersion);

      if (!savedBot.draftVersionId) {
        savedBot.draftVersionId = savedVersion.id;
      }
      savedBot.totalVersions++;
    }

    await this.botRepository.save(savedBot);

    return this.toDetailDto(savedBot, currentUser.id);
  }

  // ============================================================================
  // SHARING & FAVORITES
  // ============================================================================

  /**
   * Update sharing settings.
   */
  async updateSharing(
    tenantId: string,
    botId: string,
    dto: ShareBotDto,
    currentUser: User,
  ): Promise<BotDetailDto> {
    const bot = await this.findBotOrFail(tenantId, botId);
    this.checkBotEditAccess(bot, currentUser);

    if (dto.userIds !== undefined) {
      bot.sharedWithUserIds = dto.userIds;
    }

    if (dto.roleIds !== undefined) {
      bot.sharedWithRoleIds = dto.roleIds;
    }

    if (dto.isPublic !== undefined) {
      bot.isPublic = dto.isPublic;
    }

    bot.updatedBy = currentUser.id;

    const saved = await this.botRepository.save(bot);
    return this.toDetailDto(saved, currentUser.id);
  }

  /**
   * Toggle favorite.
   */
  async toggleFavorite(
    tenantId: string,
    botId: string,
    dto: ToggleFavoriteDto,
    currentUser: User,
  ): Promise<BotDetailDto> {
    const bot = await this.findBotOrFail(tenantId, botId);
    this.checkBotAccess(bot, currentUser);

    const userId = currentUser.id;
    const favorites = bot.favoritedBy || [];

    if (dto.isFavorite) {
      if (!favorites.includes(userId)) {
        favorites.push(userId);
      }
    } else {
      const index = favorites.indexOf(userId);
      if (index > -1) {
        favorites.splice(index, 1);
      }
    }

    bot.favoritedBy = favorites;

    const saved = await this.botRepository.save(bot);
    return this.toDetailDto(saved, currentUser.id);
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Update run statistics (called by Runs service).
   */
  async updateRunStats(
    botId: string,
    versionId: string,
    success: boolean,
    durationSeconds: number,
  ): Promise<void> {
    const bot = await this.botRepository.findOne({ where: { id: botId } });
    if (!bot) return;

    bot.totalRuns = Number(bot.totalRuns) + 1;
    bot.lastRunAt = new Date();

    if (success) {
      bot.successfulRuns = Number(bot.successfulRuns) + 1;
      bot.lastSuccessAt = new Date();
    } else {
      bot.failedRuns = Number(bot.failedRuns) + 1;
      bot.lastFailureAt = new Date();
    }

    // Update average duration
    const totalRuns = Number(bot.totalRuns);
    bot.avgDurationSeconds =
      (bot.avgDurationSeconds * (totalRuns - 1) + durationSeconds) / totalRuns;

    await this.botRepository.save(bot);

    // Update version stats
    const version = await this.versionRepository.findOne({
      where: { id: versionId },
    });

    if (version) {
      version.totalRuns = Number(version.totalRuns) + 1;
      if (success) {
        version.successfulRuns = Number(version.successfulRuns) + 1;
      }
      const versionTotalRuns = Number(version.totalRuns);
      version.avgDurationSeconds =
        (version.avgDurationSeconds * (versionTotalRuns - 1) + durationSeconds) /
        versionTotalRuns;

      await this.versionRepository.save(version);
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async findBotOrFail(tenantId: string, botId: string): Promise<Bot> {
    const bot = await this.botRepository.findOne({
      where: { id: botId, tenantId },
      relations: ['creator'],
    });

    if (!bot) {
      throw new NotFoundException({
        code: 'BOT_NOT_FOUND',
        message: 'Bot not found.',
      });
    }

    return bot;
  }

  private async findVersionOrFail(
    botId: string,
    versionId: string,
  ): Promise<BotVersion> {
    const version = await this.versionRepository.findOne({
      where: { id: versionId, botId },
      relations: ['creator', 'publisher'],
    });

    if (!version) {
      throw new NotFoundException({
        code: 'VERSION_NOT_FOUND',
        message: 'Version not found.',
      });
    }

    return version;
  }

  private checkBotAccess(bot: Bot, user: User): void {
    // Creator always has access
    if (bot.createdBy === user.id) return;

    // Public bots are accessible
    if (bot.isPublic) return;

    // Check shared users
    if (bot.sharedWithUserIds?.includes(user.id)) return;

    // Check shared roles
    const userRoleIds = user.roles?.map((r) => r.id) || [];
    const hasRoleAccess = bot.sharedWithRoleIds?.some((rid) =>
      userRoleIds.includes(rid),
    );
    if (hasRoleAccess) return;

    throw new ForbiddenException({
      code: 'ACCESS_DENIED',
      message: 'You do not have access to this bot.',
    });
  }

  private checkBotEditAccess(bot: Bot, user: User): void {
    // Only creator can edit (for now)
    // TODO: Add role-based edit access
    if (bot.createdBy !== user.id) {
      throw new ForbiddenException({
        code: 'EDIT_ACCESS_DENIED',
        message: 'You do not have permission to edit this bot.',
      });
    }
  }

  /**
   * Check bot quota against license limits.
   * In single-tenant mode, limits come from the license features.
   * @param tenantId - The tenant ID
   * @param maxBots - Maximum bots allowed (from license), -1 for unlimited
   */
  async checkBotQuota(tenantId: string, maxBots = -1): Promise<void> {
    if (maxBots === -1) return; // Unlimited

    const botCount = await this.botRepository.count({ where: { tenantId } });

    if (botCount >= maxBots) {
      throw new ForbiddenException({
        code: 'BOT_QUOTA_EXCEEDED',
        message: `Bot quota exceeded. Maximum: ${maxBots}`,
      });
    }
  }

  private generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private calculateNodeTypes(dsl: any): Record<string, number> {
    const types: Record<string, number> = {};
    const nodes = dsl.nodes || [];

    for (const node of nodes) {
      const type = node.type || 'unknown';
      types[type] = (types[type] || 0) + 1;
    }

    return types;
  }

  private toSummaryDto(bot: Bot, currentUserId: string): BotSummaryDto {
    const successRate =
      Number(bot.totalRuns) > 0
        ? (Number(bot.successfulRuns) / Number(bot.totalRuns)) * 100
        : 0;

    return {
      id: bot.id,
      name: bot.name,
      description: bot.description,
      status: bot.status,
      category: bot.category,
      tags: bot.tags || [],
      iconUrl: bot.iconUrl,
      color: bot.color,
      createdBy: bot.createdBy,
      creatorEmail: bot.creator?.email,
      currentVersionId: bot.currentVersionId,
      totalRuns: Number(bot.totalRuns),
      successfulRuns: Number(bot.successfulRuns),
      failedRuns: Number(bot.failedRuns),
      successRate: Math.round(successRate * 100) / 100,
      lastRunAt: bot.lastRunAt,
      isFavorite: bot.favoritedBy?.includes(currentUserId) || false,
      createdAt: bot.createdAt,
      updatedAt: bot.updatedAt,
    };
  }

  private toDetailDto(bot: Bot, currentUserId: string): BotDetailDto {
    const summary = this.toSummaryDto(bot, currentUserId);

    return {
      ...summary,
      draftVersionId: bot.draftVersionId,
      totalVersions: bot.totalVersions,
      defaultRunnerId: bot.defaultRunnerId,
      runnerGroupId: bot.runnerGroupId,
      timeoutSeconds: bot.timeoutSeconds,
      maxRetries: bot.maxRetries,
      retryDelaySeconds: bot.retryDelaySeconds,
      priority: bot.priority,
      environmentVariables: bot.environmentVariables,
      credentialIds: bot.credentialIds || [],
      allowManualTrigger: bot.allowManualTrigger,
      allowApiTrigger: bot.allowApiTrigger,
      allowWebhookTrigger: bot.allowWebhookTrigger,
      webhookUrl: bot.allowWebhookTrigger
        ? `/api/webhooks/bots/${bot.id}/trigger`
        : undefined,
      isPublic: bot.isPublic,
      sharedWithUserIds: bot.sharedWithUserIds || [],
      sharedWithRoleIds: bot.sharedWithRoleIds || [],
      notifications: bot.notifications,
      folderId: bot.folderId,
      avgDurationSeconds: bot.avgDurationSeconds,
      lastSuccessAt: bot.lastSuccessAt,
      lastFailureAt: bot.lastFailureAt,
      viewCount: bot.viewCount,
      metadata: bot.metadata,
      settings: bot.settings,
      archivedAt: bot.archivedAt,
      archivedBy: bot.archivedBy,
    };
  }

  private toVersionSummaryDto(version: BotVersion): BotVersionSummaryDto {
    return {
      id: version.id,
      version: version.version,
      label: version.label,
      status: version.status,
      isPublished: version.isPublished,
      nodeCount: version.nodeCount,
      edgeCount: version.edgeCount,
      totalRuns: Number(version.totalRuns),
      successfulRuns: Number(version.successfulRuns),
      createdBy: version.createdBy,
      creatorEmail: version.creator?.email,
      publishedAt: version.publishedAt,
      publishedBy: version.publishedBy,
      createdAt: version.createdAt,
    };
  }

  private toVersionDetailDto(version: BotVersion): BotVersionDetailDto {
    const summary = this.toVersionSummaryDto(version);

    return {
      ...summary,
      changeNotes: version.changeNotes,
      dsl: version.dsl,
      ui: version.ui,
      compiledPlan: version.compiledPlan ?? undefined,
      planHash: version.planHash ?? undefined,
      compiledAt: version.compiledAt,
      compilationErrors: version.compilationErrors,
      compilationWarnings: version.compilationWarnings,
      nodeTypes: version.nodeTypes,
      avgDurationSeconds: version.avgDurationSeconds,
      metadata: version.metadata,
      deprecatedAt: version.deprecatedAt,
      deprecatedBy: version.deprecatedBy,
      deprecationReason: version.deprecationReason,
      updatedAt: version.updatedAt,
    };
  }
}
