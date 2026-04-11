import { Injectable } from '@nestjs/common';
import { MarketplaceService } from '../../marketplace/marketplace.service';
import {
  MarketplaceBot,
  MarketplaceBotStatus,
  PricingModel,
  BotCategory,
} from '../../marketplace/entities/marketplace-bot.entity';
import {
  MarketplaceSubscriptionPlan,
} from '../../marketplace/entities/marketplace-subscription.entity';
import {
  Tool,
  Resource,
  ToolResult,
  ResourceContent,
} from '../types/mcp.types';

/**
 * Marketplace MCP Server
 *
 * Provides tools and resources for bot marketplace discovery and subscription.
 */
@Injectable()
export class MarketplaceServer {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  getTools(): Tool[] {
    return [
      {
        name: 'search_marketplace_bots',
        description: 'Search for bots in the marketplace',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            category: {
              type: 'string',
              enum: ['insurance', 'healthcare', 'finance', 'hr', 'all'],
              description: 'Bot category',
            },
            pricingModel: {
              type: 'string',
              enum: ['usage', 'per_call', 'monthly', 'hybrid', 'all'],
              description: 'Pricing model filter',
            },
            limit: {
              type: 'number',
              default: 20,
              description: 'Max results to return',
            },
          },
          required: [],
        },
        requiresApproval: false,
        tags: ['marketplace', 'search'],
      },
      {
        name: 'get_bot_details',
        description:
          'Get detailed information about a specific bot including pricing',
        inputSchema: {
          type: 'object',
          properties: {
            botId: { type: 'string', description: 'Bot ID' },
          },
          required: ['botId'],
        },
        requiresApproval: false,
        tags: ['marketplace', 'bot'],
      },
      {
        name: 'subscribe_to_bot',
        description: 'Subscribe a tenant to a marketplace bot',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: { type: 'string', description: 'Tenant ID' },
            botId: { type: 'string', description: 'Bot ID to subscribe to' },
            pricingPlan: {
              type: 'string',
              enum: ['usage', 'per_call', 'monthly', 'hybrid'],
              description: 'Selected pricing plan',
            },
          },
          required: ['tenantId', 'botId', 'pricingPlan'],
        },
        requiresApproval: true,
        tags: ['marketplace', 'subscription'],
      },
      {
        name: 'unsubscribe_from_bot',
        description: 'Unsubscribe a tenant from a marketplace bot',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: { type: 'string', description: 'Tenant ID' },
            botId: { type: 'string', description: 'Bot ID to unsubscribe from' },
          },
          required: ['tenantId', 'botId'],
        },
        requiresApproval: true,
        tags: ['marketplace', 'subscription'],
      },
      {
        name: 'list_subscribed_bots',
        description: 'List all bots a tenant is currently subscribed to',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: { type: 'string', description: 'Tenant ID' },
          },
          required: ['tenantId'],
        },
        requiresApproval: false,
        tags: ['marketplace', 'subscription'],
      },
      {
        name: 'download_bot',
        description: 'Download a bot DSL file',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: { type: 'string', description: 'Tenant ID' },
            botId: { type: 'string', description: 'Bot ID' },
            version: {
              type: 'string',
              description: 'Bot version (default: latest)',
            },
          },
          required: ['tenantId', 'botId'],
        },
        requiresApproval: false,
        tags: ['marketplace', 'download'],
      },
      {
        name: 'list_partner_bots',
        description: 'List bots from a specific partner',
        inputSchema: {
          type: 'object',
          properties: {
            partnerId: { type: 'string', description: 'Partner ID' },
          },
          required: ['partnerId'],
        },
        requiresApproval: false,
        tags: ['marketplace', 'partners'],
      },
    ];
  }

  getResources(): Resource[] {
    return [
      {
        uri: 'marketplace://bots/catalog',
        name: 'Bot Catalog',
        description: 'Complete catalog of all marketplace bots',
        mimeType: 'application/json',
        tags: ['marketplace', 'catalog'],
      },
      {
        uri: 'marketplace://bots/{botId}/details',
        name: 'Bot Details',
        description: 'Detailed information about a specific bot',
        mimeType: 'application/json',
        tags: ['marketplace', 'bot'],
      },
      {
        uri: 'marketplace://bots/{botId}/pricing',
        name: 'Bot Pricing',
        description: 'Pricing information for a bot',
        mimeType: 'application/json',
        tags: ['marketplace', 'pricing'],
      },
      {
        uri: 'marketplace://bots/{botId}/dsl',
        name: 'Bot DSL',
        description: 'DSL JSON file for a bot',
        mimeType: 'application/json',
        tags: ['marketplace', 'dsl'],
      },
      {
        uri: 'marketplace://partners/{partnerId}',
        name: 'Partner Info',
        description: 'Information about a marketplace partner',
        mimeType: 'application/json',
        tags: ['marketplace', 'partners'],
      },
      {
        uri: 'marketplace://tenant/{tenantId}/subscriptions',
        name: 'Tenant Subscriptions',
        description: 'All bot subscriptions for a tenant',
        mimeType: 'application/json',
        tags: ['marketplace', 'subscriptions'],
      },
      {
        uri: 'marketplace://categories',
        name: 'Bot Categories',
        description: 'All available bot categories',
        mimeType: 'application/json',
        tags: ['marketplace', 'categories'],
      },
    ];
  }

  async executeTool(toolCall: {
    name: string;
    arguments: Record<string, any>;
  }): Promise<ToolResult> {
    try {
      switch (toolCall.name) {
        case 'search_marketplace_bots':
          return await this.searchMarketplaceBots(
            toolCall.arguments.query,
            toolCall.arguments.category,
            toolCall.arguments.pricingModel,
            toolCall.arguments.limit,
          );
        case 'get_bot_details':
          return await this.getBotDetails(toolCall.arguments.botId);
        case 'subscribe_to_bot':
          return await this.subscribeToBot(
            toolCall.arguments.tenantId,
            toolCall.arguments.botId,
            toolCall.arguments.pricingPlan,
          );
        case 'unsubscribe_from_bot':
          return await this.unsubscribeFromBot(
            toolCall.arguments.tenantId,
            toolCall.arguments.botId,
          );
        case 'list_subscribed_bots':
          return await this.listSubscribedBots(toolCall.arguments.tenantId);
        case 'download_bot':
          return await this.downloadBot(
            toolCall.arguments.tenantId,
            toolCall.arguments.botId,
            toolCall.arguments.version,
          );
        case 'list_partner_bots':
          return await this.listPartnerBots(toolCall.arguments.partnerId);
        default:
          return {
            success: false,
            error: `Unknown tool: ${toolCall.name}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed',
      };
    }
  }

  async readResource(uri: string): Promise<ResourceContent> {
    if (uri === 'marketplace://bots/catalog') {
      return this.getBotCatalogResource();
    }
    if (uri === 'marketplace://categories') {
      return this.getCategoriesResource();
    }

    const botDetailsMatch = uri.match(/marketplace:\/\/bots\/([^/]+)\/details/);
    if (botDetailsMatch) {
      return this.getBotDetailsResource(botDetailsMatch[1]);
    }

    const pricingMatch = uri.match(/marketplace:\/\/bots\/([^/]+)\/pricing/);
    if (pricingMatch) {
      return this.getBotPricingResource(pricingMatch[1]);
    }

    const dslMatch = uri.match(/marketplace:\/\/bots\/([^/]+)\/dsl/);
    if (dslMatch) {
      return this.getBotDSLResource(dslMatch[1]);
    }

    const partnerMatch = uri.match(/marketplace:\/\/partners\/([^/]+)/);
    if (partnerMatch) {
      return this.getPartnerResource(partnerMatch[1]);
    }

    const subsMatch = uri.match(
      /marketplace:\/\/tenant\/([^/]+)\/subscriptions/,
    );
    if (subsMatch) {
      return this.getTenantSubscriptionsResource(subsMatch[1]);
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  }

  private async searchMarketplaceBots(
    query?: string,
    category?: string,
    pricingModel?: string,
    limit: number = 20,
  ): Promise<ToolResult> {
    const normalizedLimit = this.normalizeLimit(limit);
    const categoryFilter = this.normalizeCategory(category);
    const pricingFilter = this.normalizePricing(pricingModel);

    const catalog = await this.marketplaceService.getCatalog(
      {
        search: query?.trim() || undefined,
        category: categoryFilter,
        pricingModel: pricingFilter,
      },
      {
        page: 1,
        limit: normalizedLimit,
        sort: 'popular',
      },
    );

    return {
      success: true,
      result: {
        total: catalog.pagination.total,
        page: catalog.pagination.page,
        limit: catalog.pagination.limit,
        bots: catalog.data.map((bot) => this.toBotCatalogEntry(bot)),
      },
    };
  }

  private async getBotDetails(botId: string): Promise<ToolResult> {
    const bot = await this.marketplaceService.getBotById(botId);
    if (bot.status !== MarketplaceBotStatus.PUBLISHED) {
      return {
        success: false,
        error: `Bot ${botId} is not published`,
      };
    }

    const versions = await this.marketplaceService.getVersions(botId);
    return {
      success: true,
      result: {
        ...this.toBotCatalogEntry(bot),
        status: bot.status,
        executionMode: bot.executionMode,
        currentVersion: bot.currentVersion,
        publisherId: bot.publisherId,
        publisherName: bot.publisher?.name ?? null,
        requirements: bot.requirements ?? null,
        runnerRequirements: bot.runnerRequirements ?? null,
        documentation: bot.documentationUrl ?? null,
        supportEmail: bot.supportEmail ?? null,
        supportUrl: bot.supportUrl ?? null,
        versions: versions.map((version) => ({
          id: version.id,
          version: version.version,
          releaseNotes: version.releaseNotes ?? null,
          isLatest: version.isLatest,
          packageHash: version.packageHash,
          dslHash: version.dslHash,
          createdAt: version.createdAt?.toISOString(),
        })),
      },
    };
  }

  private async subscribeToBot(
    tenantId: string,
    botId: string,
    pricingPlan: string,
  ): Promise<ToolResult> {
    const normalizedPlan = this.normalizeSubscriptionPlan(pricingPlan);
    const subscription = await this.marketplaceService.subscribeTenantToBot({
      tenantId,
      botId,
      pricingPlan: normalizedPlan,
    });

    return {
      success: true,
      result: {
        subscriptionId: subscription.id,
        tenantId,
        botId,
        pricingPlan: subscription.pricingPlan,
        status: subscription.status,
        subscribedAt: subscription.subscribedAt?.toISOString() ?? null,
      },
    };
  }

  private async unsubscribeFromBot(
    tenantId: string,
    botId: string,
  ): Promise<ToolResult> {
    const subscription = await this.marketplaceService.unsubscribeTenantFromBot(
      tenantId,
      botId,
    );

    return {
      success: true,
      result: {
        tenantId,
        botId,
        status: subscription.status,
        cancelledAt: subscription.canceledAt?.toISOString() ?? null,
      },
    };
  }

  private async listSubscribedBots(tenantId: string): Promise<ToolResult> {
    const subscriptions = await this.marketplaceService.listTenantSubscriptions(
      tenantId,
    );

    return {
      success: true,
      result: {
        subscriptions: subscriptions.map((subscription) => ({
          subscriptionId: subscription.id,
          botId: subscription.marketplaceBotId,
          botName: subscription.marketplaceBot?.name ?? null,
          botSlug: subscription.marketplaceBot?.slug ?? null,
          pricingPlan: subscription.pricingPlan,
          status: subscription.status,
          subscribedAt: subscription.subscribedAt?.toISOString() ?? null,
          downloadCount: Number(subscription.downloadCount ?? 0),
        })),
      },
    };
  }

  private async downloadBot(
    tenantId: string,
    botId: string,
    version?: string,
  ): Promise<ToolResult> {
    const { version: resolvedVersion } =
      await this.marketplaceService.recordBotDownload({
        tenantId,
        botId,
        version,
      });

    if (!resolvedVersion) {
      return {
        success: false,
        error: `No published version found for bot ${botId}`,
      };
    }

    return {
      success: true,
      result: {
        botId,
        tenantId,
        version: resolvedVersion.version,
        packageUrl: resolvedVersion.packageUrl,
        packageHash: resolvedVersion.packageHash,
        packageSignature: resolvedVersion.packageSignature ?? null,
        dslUrl: `marketplace://bots/${botId}/dsl`,
      },
    };
  }

  private async listPartnerBots(partnerId: string): Promise<ToolResult> {
    const catalog = await this.marketplaceService.getCatalog(
      { publisherId: partnerId },
      { page: 1, limit: 100, sort: 'popular' },
    );

    return {
      success: true,
      result: {
        partnerId,
        total: catalog.pagination.total,
        bots: catalog.data.map((bot) => this.toBotCatalogEntry(bot)),
      },
    };
  }

  private async getBotCatalogResource(): Promise<ResourceContent> {
    const bots = await this.searchMarketplaceBots(undefined, 'all', 'all', 100);
    return {
      uri: 'marketplace://bots/catalog',
      content: JSON.stringify(bots.result, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getBotDetailsResource(botId: string): Promise<ResourceContent> {
    const details = await this.getBotDetails(botId);
    return {
      uri: `marketplace://bots/${botId}/details`,
      content: JSON.stringify(details.result ?? {}, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getBotPricingResource(botId: string): Promise<ResourceContent> {
    const details = await this.getBotDetails(botId);
    return {
      uri: `marketplace://bots/${botId}/pricing`,
      content: JSON.stringify(details.result?.pricing ?? null, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getBotDSLResource(botId: string): Promise<ResourceContent> {
    const bot = await this.marketplaceService.getBotById(botId);
    if (bot.status !== MarketplaceBotStatus.PUBLISHED) {
      throw new Error(`Bot ${botId} is not published`);
    }

    const version = await this.marketplaceService.resolveBotVersion(botId);
    if (!version) {
      throw new Error(`No version found for bot ${botId}`);
    }

    return {
      uri: `marketplace://bots/${botId}/dsl`,
      content: JSON.stringify(
        {
          botId: bot.id,
          botSlug: bot.slug,
          version: version.version,
          dslHash: version.dslHash,
          dslSchema: version.dslSchema ?? null,
          packageHash: version.packageHash,
        },
        null,
        2,
      ),
      mimeType: 'application/json',
    };
  }

  private async getPartnerResource(partnerId: string): Promise<ResourceContent> {
    const partner = await this.marketplaceService.getPartner(partnerId);
    const catalog = await this.marketplaceService.getCatalog(
      { publisherId: partnerId },
      { page: 1, limit: 100, sort: 'popular' },
    );

    return {
      uri: `marketplace://partners/${partnerId}`,
      content: JSON.stringify(
        {
          id: partner.id,
          name: partner.name,
          company: partner.company,
          email: partner.email,
          website: partner.website ?? null,
          status: partner.status,
          revenueShareTier: partner.revenueShareTier,
          publishedBots: catalog.pagination.total,
          totalInstalls: partner.totalInstalls,
          lifetimeRevenue: partner.lifetimeRevenue,
        },
        null,
        2,
      ),
      mimeType: 'application/json',
    };
  }

  private async getTenantSubscriptionsResource(
    tenantId: string,
  ): Promise<ResourceContent> {
    const subscriptions = await this.listSubscribedBots(tenantId);
    return {
      uri: `marketplace://tenant/${tenantId}/subscriptions`,
      content: JSON.stringify(subscriptions.result, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getCategoriesResource(): Promise<ResourceContent> {
    const categories = await this.marketplaceService.getPublishedCategoriesSummary();
    return {
      uri: 'marketplace://categories',
      content: JSON.stringify(categories, null, 2),
      mimeType: 'application/json',
    };
  }

  private toBotCatalogEntry(bot: MarketplaceBot): Record<string, unknown> {
    return {
      id: bot.id,
      slug: bot.slug,
      name: bot.name,
      description: bot.description,
      category: bot.category,
      version: bot.currentVersion,
      executionMode: bot.executionMode,
      pricing: this.toPricingModel(bot),
      features: (bot.features ?? []).map((feature) => feature.title),
      installs: bot.installs,
      rating: bot.rating,
      publisherId: bot.publisherId,
      isSkuldBot: bot.isSkuldBot,
      documentationUrl: bot.documentationUrl ?? null,
    };
  }

  private toPricingModel(bot: MarketplaceBot): Record<string, unknown> {
    const usageMetric = bot.pricing?.usageMetrics?.[0];
    return {
      model: this.toPricingModelCode(bot.pricingModel),
      perUsageRate: usageMetric?.pricePerUnit ?? null,
      perCallRate: usageMetric?.pricePerUnit ?? null,
      monthlyMinimum: bot.pricing?.minimumMonthly ?? bot.pricing?.monthlyBase ?? null,
      currency: 'USD',
      billingCycle: 'monthly',
    };
  }

  private toPricingModelCode(pricing: PricingModel): string {
    switch (pricing) {
      case PricingModel.SUBSCRIPTION:
        return 'monthly';
      case PricingModel.HYBRID:
        return 'hybrid';
      case PricingModel.USAGE:
        return 'usage';
      default:
        return 'usage';
    }
  }

  private normalizeCategory(value?: string): BotCategory | undefined {
    if (!value || value === 'all') {
      return undefined;
    }
    const normalized = value.trim().toLowerCase();
    const map: Record<string, BotCategory> = {
      insurance: BotCategory.INSURANCE,
      healthcare: BotCategory.HEALTHCARE,
      finance: BotCategory.FINANCE,
      hr: BotCategory.HR,
    };
    if (!map[normalized]) {
      throw new Error(`Unsupported category: ${value}`);
    }
    return map[normalized];
  }

  private normalizePricing(value?: string): PricingModel | undefined {
    if (!value || value === 'all') {
      return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'monthly') {
      return PricingModel.SUBSCRIPTION;
    }
    if (normalized === 'hybrid') {
      return PricingModel.HYBRID;
    }
    if (normalized === 'usage' || normalized === 'per_call') {
      return PricingModel.USAGE;
    }
    throw new Error(`Unsupported pricingModel: ${value}`);
  }

  private normalizeSubscriptionPlan(value: string): MarketplaceSubscriptionPlan {
    const normalized = value?.trim().toLowerCase();
    const map: Record<string, MarketplaceSubscriptionPlan> = {
      usage: MarketplaceSubscriptionPlan.USAGE,
      per_call: MarketplaceSubscriptionPlan.PER_CALL,
      monthly: MarketplaceSubscriptionPlan.MONTHLY,
      hybrid: MarketplaceSubscriptionPlan.HYBRID,
    };
    if (!map[normalized]) {
      throw new Error(`Unsupported pricingPlan: ${value}`);
    }
    return map[normalized];
  }

  private normalizeLimit(value?: number): number {
    if (!value || Number.isNaN(value)) {
      return 20;
    }
    return Math.min(100, Math.max(1, Math.floor(value)));
  }
}
