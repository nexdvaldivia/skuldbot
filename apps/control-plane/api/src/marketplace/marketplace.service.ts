import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MarketplaceBot,
  MarketplaceBotStatus,
  BotVersion,
  BotCategory,
  ExecutionMode,
  PricingModel,
} from './entities/marketplace-bot.entity';
import { Partner, PartnerStatus, RevenueShareTier } from './entities/partner.entity';
import {
  MarketplaceSubscription,
  MarketplaceSubscriptionPlan,
  MarketplaceSubscriptionStatus,
} from './entities/marketplace-subscription.entity';

// ============================================================================
// DTOs
// ============================================================================

export interface CreateBotDto {
  name: string;
  slug: string;
  description: string;
  longDescription?: string;
  category: BotCategory;
  tags?: string[];
  executionMode: ExecutionMode;
  publisherId: string;
  pricing: MarketplaceBot['pricing'];
  requirements?: MarketplaceBot['requirements'];
  runnerRequirements?: MarketplaceBot['runnerRequirements'];
}

export interface UpdateBotDto {
  name?: string;
  description?: string;
  longDescription?: string;
  category?: BotCategory;
  tags?: string[];
  pricing?: MarketplaceBot['pricing'];
  requirements?: MarketplaceBot['requirements'];
  iconUrl?: string;
  screenshots?: string[];
  demoVideoUrl?: string;
  documentationUrl?: string;
}

export interface CreateVersionDto {
  version: string;
  releaseNotes?: string;
  packageUrl: string;
  packageHash: string;
  packageSignature?: string;
  packageSize: number;
  dslHash: string;
  dslSchema?: Record<string, unknown>;
}

export interface CreatePartnerDto {
  name: string;
  email: string;
  company: string;
  website?: string;
  description?: string;
  contactName?: string;
  contactPhone?: string;
}

export interface CatalogFilters {
  category?: BotCategory;
  executionMode?: ExecutionMode;
  pricingModel?: PricingModel;
  tags?: string[];
  search?: string;
  publisherId?: string;
  isSkuldBot?: boolean;
}

export interface CatalogOptions {
  page?: number;
  limit?: number;
  sort?: 'popular' | 'newest' | 'rating' | 'name';
}

export interface ListBotsFilters {
  status?: MarketplaceBotStatus;
  category?: BotCategory;
  search?: string;
}

/**
 * Marketplace Service
 *
 * Manages the bot marketplace including:
 * - Bot publication and versioning
 * - Partner management
 * - Review and approval workflow
 * - Catalog browsing
 */
@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    @InjectRepository(MarketplaceBot)
    private readonly botRepository: Repository<MarketplaceBot>,
    @InjectRepository(BotVersion)
    private readonly versionRepository: Repository<BotVersion>,
    @InjectRepository(Partner)
    private readonly partnerRepository: Repository<Partner>,
    @InjectRepository(MarketplaceSubscription)
    private readonly subscriptionRepository: Repository<MarketplaceSubscription>,
  ) {}

  /**
   * List all bots for Control Plane administration.
   */
  async listBots(filters: ListBotsFilters = {}): Promise<MarketplaceBot[]> {
    const query = this.botRepository
      .createQueryBuilder('bot')
      .leftJoinAndSelect('bot.publisher', 'publisher');

    if (filters.status) {
      query.andWhere('bot.status = :status', { status: filters.status });
    }

    if (filters.category) {
      query.andWhere('bot.category = :category', { category: filters.category });
    }

    if (filters.search?.trim()) {
      query.andWhere(
        '(bot.name ILIKE :search OR bot.description ILIKE :search OR bot.slug ILIKE :search)',
        { search: `%${filters.search.trim()}%` },
      );
    }

    return query.orderBy('bot.updatedAt', 'DESC').getMany();
  }

  // ============================================================================
  // CATALOG (PUBLIC)
  // ============================================================================

  /**
   * Get public catalog of published bots
   */
  async getCatalog(filters: CatalogFilters = {}, options: CatalogOptions = {}) {
    const { page = 1, limit = 20, sort = 'popular' } = options;

    let query = this.botRepository
      .createQueryBuilder('bot')
      .leftJoinAndSelect('bot.publisher', 'publisher')
      .where('bot.status = :status', { status: MarketplaceBotStatus.PUBLISHED });

    // Apply filters
    if (filters.category) {
      query = query.andWhere('bot.category = :category', { category: filters.category });
    }

    if (filters.executionMode) {
      query = query.andWhere('bot.executionMode = :executionMode', {
        executionMode: filters.executionMode,
      });
    }

    if (filters.pricingModel) {
      query = query.andWhere('bot.pricingModel = :pricingModel', {
        pricingModel: filters.pricingModel,
      });
    }

    if (filters.publisherId) {
      query = query.andWhere('bot.publisherId = :publisherId', {
        publisherId: filters.publisherId,
      });
    }

    if (filters.isSkuldBot !== undefined) {
      query = query.andWhere('bot.isSkuldBot = :isSkuldBot', {
        isSkuldBot: filters.isSkuldBot,
      });
    }

    if (filters.tags && filters.tags.length > 0) {
      query = query.andWhere('bot.tags && :tags', { tags: filters.tags });
    }

    if (filters.search) {
      query = query.andWhere('(bot.name ILIKE :search OR bot.description ILIKE :search)', {
        search: `%${filters.search}%`,
      });
    }

    // Apply sorting
    switch (sort) {
      case 'popular':
        query = query.orderBy('bot.installs', 'DESC');
        break;
      case 'newest':
        query = query.orderBy('bot.publishedAt', 'DESC');
        break;
      case 'rating':
        query = query.orderBy('bot.rating', 'DESC');
        break;
      case 'name':
        query = query.orderBy('bot.name', 'ASC');
        break;
    }

    const [bots, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: bots,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get bot details by slug
   */
  async getBotBySlug(slug: string): Promise<MarketplaceBot> {
    const bot = await this.botRepository.findOne({
      where: { slug, status: MarketplaceBotStatus.PUBLISHED },
      relations: ['publisher', 'versions'],
    });

    if (!bot) {
      throw new NotFoundException(`Bot not found: ${slug}`);
    }

    return bot;
  }

  /**
   * Get bot details by ID
   */
  async getBotById(id: string): Promise<MarketplaceBot> {
    const bot = await this.botRepository.findOne({
      where: { id },
      relations: ['publisher', 'versions'],
    });

    if (!bot) {
      throw new NotFoundException(`Bot not found: ${id}`);
    }

    return bot;
  }

  // ============================================================================
  // BOT MANAGEMENT (PARTNERS)
  // ============================================================================

  /**
   * Create a new bot (draft)
   */
  async createBot(dto: CreateBotDto): Promise<MarketplaceBot> {
    // Verify partner exists and is approved
    const partner = await this.partnerRepository.findOne({
      where: { id: dto.publisherId },
    });

    if (!partner) {
      throw new NotFoundException('Partner not found');
    }

    if (partner.status !== PartnerStatus.APPROVED) {
      throw new ForbiddenException('Partner is not approved');
    }

    // Check slug uniqueness
    const existingBot = await this.botRepository.findOne({
      where: { slug: dto.slug },
    });

    if (existingBot) {
      throw new BadRequestException(`Slug already in use: ${dto.slug}`);
    }

    const bot = this.botRepository.create({
      ...dto,
      status: MarketplaceBotStatus.DRAFT,
      currentVersion: '0.0.0',
    });

    await this.botRepository.save(bot);

    // Update partner stats
    await this.partnerRepository.increment({ id: dto.publisherId }, 'totalBots', 1);

    this.logger.log(`Bot created: ${bot.name} (${bot.id}) by partner ${partner.name}`);

    return bot;
  }

  /**
   * Update bot details
   */
  async updateBot(id: string, dto: UpdateBotDto, publisherId: string): Promise<MarketplaceBot> {
    const bot = await this.getBotById(id);

    // Verify ownership
    if (bot.publisherId !== publisherId) {
      throw new ForbiddenException('You do not own this bot');
    }

    // Can't update published bots directly (need new version)
    if (bot.status === MarketplaceBotStatus.PUBLISHED && (dto.pricing || dto.requirements)) {
      throw new BadRequestException(
        'Cannot modify pricing or requirements of published bot. Create a new version.',
      );
    }

    Object.assign(bot, dto);
    await this.botRepository.save(bot);

    return bot;
  }

  /**
   * Submit bot for review
   */
  async submitForReview(id: string, publisherId: string): Promise<MarketplaceBot> {
    const bot = await this.getBotById(id);

    if (bot.publisherId !== publisherId) {
      throw new ForbiddenException('You do not own this bot');
    }

    if (bot.status !== MarketplaceBotStatus.DRAFT) {
      throw new BadRequestException('Only draft bots can be submitted for review');
    }

    // Validate bot has required fields
    if (!bot.pricing || !bot.currentVersion || bot.currentVersion === '0.0.0') {
      throw new BadRequestException('Bot must have pricing and at least one version');
    }

    bot.status = MarketplaceBotStatus.PENDING_REVIEW;
    bot.submittedAt = new Date();
    await this.botRepository.save(bot);

    this.logger.log(`Bot submitted for review: ${bot.name} (${bot.id})`);

    return bot;
  }

  /**
   * Approve bot (Skuld admin only)
   */
  async approveBot(id: string, approvedBy: string): Promise<MarketplaceBot> {
    const bot = await this.getBotById(id);

    if (bot.status !== MarketplaceBotStatus.PENDING_REVIEW) {
      throw new BadRequestException('Bot is not pending review');
    }

    bot.status = MarketplaceBotStatus.APPROVED;
    bot.approvedBy = approvedBy;
    bot.approvedAt = new Date();
    await this.botRepository.save(bot);

    this.logger.log(`Bot approved: ${bot.name} (${bot.id}) by ${approvedBy}`);

    return bot;
  }

  /**
   * Reject bot (Skuld admin only)
   */
  async rejectBot(id: string, reason: string, rejectedBy: string): Promise<MarketplaceBot> {
    const bot = await this.getBotById(id);

    if (bot.status !== MarketplaceBotStatus.PENDING_REVIEW) {
      throw new BadRequestException('Bot is not pending review');
    }

    bot.status = MarketplaceBotStatus.REJECTED;
    bot.rejectedAt = new Date();
    bot.rejectionReason = reason;
    await this.botRepository.save(bot);

    this.logger.log(`Bot rejected: ${bot.name} (${bot.id}) - ${reason}`);

    return bot;
  }

  /**
   * Publish approved bot
   */
  async publishBot(id: string, publisherId: string): Promise<MarketplaceBot> {
    const bot = await this.getBotById(id);

    if (bot.publisherId !== publisherId) {
      throw new ForbiddenException('You do not own this bot');
    }

    if (bot.status !== MarketplaceBotStatus.APPROVED) {
      throw new BadRequestException('Bot must be approved before publishing');
    }

    bot.status = MarketplaceBotStatus.PUBLISHED;
    bot.publishedAt = new Date();
    await this.botRepository.save(bot);

    // Update partner stats
    await this.partnerRepository.increment({ id: publisherId }, 'publishedBots', 1);

    this.logger.log(`Bot published: ${bot.name} (${bot.id})`);

    return bot;
  }

  /**
   * Deprecate bot
   */
  async deprecateBot(id: string, publisherId: string): Promise<MarketplaceBot> {
    const bot = await this.getBotById(id);

    if (bot.publisherId !== publisherId) {
      throw new ForbiddenException('You do not own this bot');
    }

    bot.status = MarketplaceBotStatus.DEPRECATED;
    bot.deprecatedAt = new Date();
    await this.botRepository.save(bot);

    // Update partner stats
    await this.partnerRepository.decrement({ id: publisherId }, 'publishedBots', 1);

    this.logger.log(`Bot deprecated: ${bot.name} (${bot.id})`);

    return bot;
  }

  // ============================================================================
  // VERSION MANAGEMENT
  // ============================================================================

  /**
   * Add a new version to a bot
   */
  async addVersion(botId: string, dto: CreateVersionDto, publisherId: string): Promise<BotVersion> {
    const bot = await this.getBotById(botId);

    if (bot.publisherId !== publisherId) {
      throw new ForbiddenException('You do not own this bot');
    }

    // Check version doesn't exist
    const existingVersion = await this.versionRepository.findOne({
      where: { marketplaceBotId: botId, version: dto.version },
    });

    if (existingVersion) {
      throw new BadRequestException(`Version ${dto.version} already exists`);
    }

    // Unset isLatest on all previous versions
    await this.versionRepository.update({ marketplaceBotId: botId }, { isLatest: false });

    // Create new version
    const version = this.versionRepository.create({
      ...dto,
      marketplaceBotId: botId,
      isLatest: true,
    });

    await this.versionRepository.save(version);

    // Update bot's current version
    bot.currentVersion = dto.version;
    await this.botRepository.save(bot);

    this.logger.log(`Version ${dto.version} added to bot ${bot.name}`);

    return version;
  }

  /**
   * Get all versions for a bot
   */
  async getVersions(botId: string): Promise<BotVersion[]> {
    return this.versionRepository.find({
      where: { marketplaceBotId: botId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get specific version
   */
  async getVersion(botId: string, version: string): Promise<BotVersion> {
    const botVersion = await this.versionRepository.findOne({
      where: { marketplaceBotId: botId, version },
    });

    if (!botVersion) {
      throw new NotFoundException(`Version ${version} not found`);
    }

    return botVersion;
  }

  // ============================================================================
  // PARTNER MANAGEMENT
  // ============================================================================

  /**
   * Create partner application
   */
  async createPartner(dto: CreatePartnerDto): Promise<Partner> {
    // Check email uniqueness
    const existingPartner = await this.partnerRepository.findOne({
      where: { email: dto.email },
    });

    if (existingPartner) {
      throw new BadRequestException('Email already registered');
    }

    const partner = this.partnerRepository.create({
      ...dto,
      status: PartnerStatus.PENDING,
      revenueShareTier: RevenueShareTier.STARTER,
    });

    await this.partnerRepository.save(partner);

    this.logger.log(`Partner application created: ${partner.company} (${partner.id})`);

    return partner;
  }

  /**
   * Approve partner (Skuld admin only)
   */
  async approvePartner(id: string, approvedBy: string): Promise<Partner> {
    const partner = await this.partnerRepository.findOne({ where: { id } });

    if (!partner) {
      throw new NotFoundException('Partner not found');
    }

    if (partner.status !== PartnerStatus.PENDING) {
      throw new BadRequestException('Partner is not pending');
    }

    partner.status = PartnerStatus.APPROVED;
    partner.approvedBy = approvedBy;
    partner.approvedAt = new Date();
    await this.partnerRepository.save(partner);

    this.logger.log(`Partner approved: ${partner.company} (${partner.id})`);

    return partner;
  }

  /**
   * Get partner by ID
   */
  async getPartner(id: string): Promise<Partner> {
    const partner = await this.partnerRepository.findOne({ where: { id } });

    if (!partner) {
      throw new NotFoundException('Partner not found');
    }

    return partner;
  }

  /**
   * List all partners (admin)
   */
  async listPartners(status?: PartnerStatus): Promise<Partner[]> {
    const where = status ? { status } : {};
    return this.partnerRepository.find({ where, order: { createdAt: 'DESC' } });
  }

  /**
   * Get bots pending review (admin)
   */
  async getPendingBots(): Promise<MarketplaceBot[]> {
    return this.botRepository.find({
      where: { status: MarketplaceBotStatus.PENDING_REVIEW },
      relations: ['publisher'],
      order: { submittedAt: 'ASC' },
    });
  }

  /**
   * Update revenue share tier based on lifetime revenue
   */
  async updateRevenueShareTier(partnerId: string): Promise<Partner> {
    const partner = await this.getPartner(partnerId);

    const revenue = Number(partner.lifetimeRevenue);

    let newTier = RevenueShareTier.STARTER;
    if (revenue >= 1000000) {
      newTier = RevenueShareTier.PREMIER;
    } else if (revenue >= 100000) {
      newTier = RevenueShareTier.ESTABLISHED;
    }

    if (partner.revenueShareTier !== newTier) {
      partner.revenueShareTier = newTier;
      await this.partnerRepository.save(partner);
      this.logger.log(`Partner ${partner.company} upgraded to tier: ${newTier}`);
    }

    return partner;
  }

  /**
   * Increment bot install count
   */
  async incrementInstalls(botId: string): Promise<void> {
    await this.botRepository.increment({ id: botId }, 'installs', 1);

    // Also update partner stats
    const bot = await this.getBotById(botId);
    await this.partnerRepository.increment({ id: bot.publisherId }, 'totalInstalls', 1);
  }

  async listTenantSubscriptions(tenantId: string): Promise<MarketplaceSubscription[]> {
    return this.subscriptionRepository.find({
      where: { tenantId, status: MarketplaceSubscriptionStatus.ACTIVE },
      relations: ['marketplaceBot', 'marketplaceBot.publisher'],
      order: { createdAt: 'DESC' },
    });
  }

  async subscribeTenantToBot(params: {
    tenantId: string;
    botId: string;
    pricingPlan: MarketplaceSubscriptionPlan;
  }): Promise<MarketplaceSubscription> {
    const bot = await this.getBotById(params.botId);
    if (bot.status !== MarketplaceBotStatus.PUBLISHED) {
      throw new BadRequestException('Only published bots can be subscribed.');
    }

    const existing = await this.subscriptionRepository.findOne({
      where: { tenantId: params.tenantId, marketplaceBotId: params.botId },
    });

    if (existing?.status === MarketplaceSubscriptionStatus.ACTIVE) {
      throw new BadRequestException('Tenant is already subscribed to this bot.');
    }

    const subscription = existing ?? this.subscriptionRepository.create();
    const now = new Date();

    subscription.tenantId = params.tenantId;
    subscription.marketplaceBotId = params.botId;
    subscription.pricingPlan = params.pricingPlan;
    subscription.status = MarketplaceSubscriptionStatus.ACTIVE;
    subscription.subscribedAt = now;
    subscription.canceledAt = undefined;

    const saved = await this.subscriptionRepository.save(subscription);
    if (!existing) {
      await this.incrementInstalls(params.botId);
    }
    return saved;
  }

  async unsubscribeTenantFromBot(
    tenantId: string,
    botId: string,
  ): Promise<MarketplaceSubscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId, marketplaceBotId: botId },
    });

    if (!subscription || subscription.status !== MarketplaceSubscriptionStatus.ACTIVE) {
      throw new NotFoundException('Active subscription not found for tenant and bot.');
    }

    subscription.status = MarketplaceSubscriptionStatus.CANCELED;
    subscription.canceledAt = new Date();
    return this.subscriptionRepository.save(subscription);
  }

  async getTenantBotSubscription(
    tenantId: string,
    botId: string,
  ): Promise<MarketplaceSubscription | null> {
    return this.subscriptionRepository.findOne({
      where: { tenantId, marketplaceBotId: botId },
      relations: ['marketplaceBot'],
    });
  }

  async resolveBotVersion(botId: string, version?: string): Promise<BotVersion | null> {
    if (version?.trim()) {
      return this.versionRepository.findOne({
        where: { marketplaceBotId: botId, version: version.trim() },
      });
    }

    return this.versionRepository.findOne({
      where: { marketplaceBotId: botId, isLatest: true },
      order: { createdAt: 'DESC' },
    });
  }

  async recordBotDownload(params: { tenantId: string; botId: string; version?: string }): Promise<{
    subscription: MarketplaceSubscription;
    version: BotVersion | null;
  }> {
    const subscription = await this.subscriptionRepository.findOne({
      where: {
        tenantId: params.tenantId,
        marketplaceBotId: params.botId,
        status: MarketplaceSubscriptionStatus.ACTIVE,
      },
    });
    if (!subscription) {
      throw new ForbiddenException('Tenant must have an active subscription.');
    }

    const version = await this.resolveBotVersion(params.botId, params.version);
    if (!version) {
      throw new NotFoundException('Bot version not found.');
    }

    subscription.downloadCount = Number(subscription.downloadCount ?? 0) + 1;
    subscription.lastDownloadedAt = new Date();
    await this.subscriptionRepository.save(subscription);

    version.downloads = Number(version.downloads ?? 0) + 1;
    await this.versionRepository.save(version);

    return { subscription, version };
  }

  async getPublishedCategoriesSummary(): Promise<
    Array<{ id: string; name: string; botCount: number }>
  > {
    const rows = await this.botRepository
      .createQueryBuilder('bot')
      .select('bot.category', 'category')
      .addSelect('COUNT(bot.id)', 'count')
      .where('bot.status = :status', { status: MarketplaceBotStatus.PUBLISHED })
      .groupBy('bot.category')
      .orderBy('bot.category', 'ASC')
      .getRawMany<{ category: string; count: string }>();

    return rows.map((row) => ({
      id: row.category,
      name: row.category.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      botCount: Number(row.count),
    }));
  }
}
