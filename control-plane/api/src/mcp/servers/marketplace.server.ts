import { Injectable } from '@nestjs/common';
import {
  Tool,
  Resource,
  ToolResult,
  ResourceContent,
  MarketplaceBot,
} from '../types/mcp.types';

/**
 * Marketplace MCP Server
 * 
 * Provides tools and resources for bot marketplace discovery and subscription.
 * Critical for Studio to browse and subscribe to marketplace bots.
 */
@Injectable()
export class MarketplaceServer {
  /**
   * Get all tools provided by this server
   */
  getTools(): Tool[] {
    return [
      {
        name: 'search_marketplace_bots',
        description: 'Search for bots in the marketplace',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
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
            botId: {
              type: 'string',
              description: 'Bot ID',
            },
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
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            botId: {
              type: 'string',
              description: 'Bot ID to subscribe to',
            },
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
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            botId: {
              type: 'string',
              description: 'Bot ID to unsubscribe from',
            },
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
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
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
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            botId: {
              type: 'string',
              description: 'Bot ID',
            },
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
            partnerId: {
              type: 'string',
              description: 'Partner ID',
            },
          },
          required: ['partnerId'],
        },
        requiresApproval: false,
        tags: ['marketplace', 'partners'],
      },
    ];
  }

  /**
   * Get all resources provided by this server
   */
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

  /**
   * Execute a tool
   */
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
        error: error.message || 'Tool execution failed',
      };
    }
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<ResourceContent> {
    if (uri === 'marketplace://bots/catalog') {
      return await this.getBotCatalogResource();
    }

    if (uri === 'marketplace://categories') {
      return await this.getCategoriesResource();
    }

    // marketplace://bots/{botId}/details
    const botDetailsMatch = uri.match(/marketplace:\/\/bots\/([^/]+)\/details/);
    if (botDetailsMatch) {
      return await this.getBotDetailsResource(botDetailsMatch[1]);
    }

    // marketplace://bots/{botId}/pricing
    const pricingMatch = uri.match(/marketplace:\/\/bots\/([^/]+)\/pricing/);
    if (pricingMatch) {
      return await this.getBotPricingResource(pricingMatch[1]);
    }

    // marketplace://bots/{botId}/dsl
    const dslMatch = uri.match(/marketplace:\/\/bots\/([^/]+)\/dsl/);
    if (dslMatch) {
      return await this.getBotDSLResource(dslMatch[1]);
    }

    // marketplace://partners/{partnerId}
    const partnerMatch = uri.match(/marketplace:\/\/partners\/([^/]+)/);
    if (partnerMatch) {
      return await this.getPartnerResource(partnerMatch[1]);
    }

    // marketplace://tenant/{tenantId}/subscriptions
    const subsMatch = uri.match(
      /marketplace:\/\/tenant\/([^/]+)\/subscriptions/,
    );
    if (subsMatch) {
      return await this.getTenantSubscriptionsResource(subsMatch[1]);
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  }

  // ============================================================
  // Tool Implementations
  // ============================================================

  private async searchMarketplaceBots(
    query?: string,
    category?: string,
    pricingModel?: string,
    limit: number = 20,
  ): Promise<ToolResult> {
    // TODO: Query database with filters
    // Mock data for FNOL bot and Claims Processor
    const mockBots: MarketplaceBot[] = [
      {
        id: 'fnol-bot-v1',
        name: 'FNOL Automation Bot',
        description:
          'Automate First Notice of Loss (FNOL) intake for insurance claims',
        category: 'insurance',
        version: '1.2.0',
        pricing: {
          model: 'hybrid',
          perUsageRate: 3.0,
          perCallRate: 0.75,
          monthlyMinimum: 4000.0,
          currency: 'USD',
          billingCycle: 'monthly',
        },
        isPublic: true,
        features: [
          'OCR document extraction',
          'PHI classification',
          'Multi-carrier support',
          'Real-time validation',
        ],
        requiredLicense: 'professional',
      },
      {
        id: 'claims-processor-v1',
        name: 'Claims Processor Bot',
        description: 'End-to-end claims processing automation',
        category: 'insurance',
        version: '2.0.1',
        pricing: {
          model: 'hybrid',
          perUsageRate: 0.5,
          monthlyMinimum: 500.0,
          currency: 'USD',
          billingCycle: 'monthly',
        },
        isPublic: true,
        features: ['Adjudication', 'Payment processing', 'Fraud detection'],
        requiredLicense: 'enterprise',
      },
    ];

    // Apply filters
    let filtered = mockBots;
    if (query) {
      filtered = filtered.filter((b) =>
        b.name.toLowerCase().includes(query.toLowerCase()),
      );
    }
    if (category && category !== 'all') {
      filtered = filtered.filter((b) => b.category === category);
    }
    if (pricingModel && pricingModel !== 'all') {
      filtered = filtered.filter((b) => b.pricing.model === pricingModel);
    }

    return {
      success: true,
      result: {
        bots: filtered.slice(0, limit),
        total: filtered.length,
      },
    };
  }

  private async getBotDetails(botId: string): Promise<ToolResult> {
    // TODO: Query database
    if (botId === 'fnol-bot-v1') {
      return {
        success: true,
        result: {
          id: 'fnol-bot-v1',
          name: 'FNOL Automation Bot',
          description:
            'Automate First Notice of Loss (FNOL) intake for insurance claims',
          category: 'insurance',
          version: '1.2.0',
          pricing: {
            model: 'hybrid',
            perUsageRate: 3.0,
            perCallRate: 0.75,
            monthlyMinimum: 4000.0,
            currency: 'USD',
            billingCycle: 'monthly',
            description:
              '$3 per claim OR $0.75 per API call OR $4,000/month (whichever is greater)',
          },
          features: [
            'OCR document extraction',
            'PHI classification',
            'Multi-carrier support',
            'Real-time validation',
          ],
          requiredLicense: 'professional',
          partnerId: 'skuld-official',
          documentation: 'https://docs.skuldbot.com/bots/fnol',
          supportEmail: 'support@skuldbot.com',
        },
      };
    }

    return {
      success: false,
      error: `Bot not found: ${botId}`,
    };
  }

  private async subscribeToBot(
    tenantId: string,
    botId: string,
    pricingPlan: string,
  ): Promise<ToolResult> {
    // TODO: Create subscription in database
    return {
      success: true,
      result: {
        subscriptionId: `sub-${Date.now()}`,
        tenantId,
        botId,
        pricingPlan,
        status: 'active',
        subscribedAt: new Date().toISOString(),
        message:
          'Subscription created. Bot is now available for download and execution.',
      },
    };
  }

  private async unsubscribeFromBot(
    tenantId: string,
    botId: string,
  ): Promise<ToolResult> {
    // TODO: Update subscription status in database
    return {
      success: true,
      result: {
        tenantId,
        botId,
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        message: 'Subscription cancelled. Final invoice will be generated.',
      },
    };
  }

  private async listSubscribedBots(tenantId: string): Promise<ToolResult> {
    // TODO: Query database
    return {
      success: true,
      result: {
        subscriptions: [
          {
            botId: 'fnol-bot-v1',
            botName: 'FNOL Automation Bot',
            pricingPlan: 'hybrid',
            status: 'active',
            subscribedAt: '2026-01-01T00:00:00Z',
          },
        ],
      },
    };
  }

  private async downloadBot(
    tenantId: string,
    botId: string,
    version?: string,
  ): Promise<ToolResult> {
    // TODO: Check subscription and return DSL
    return {
      success: true,
      result: {
        botId,
        version: version || 'latest',
        dslUrl: `marketplace://bots/${botId}/dsl`,
        downloadUrl: `https://marketplace.skuldbot.com/api/v1/bots/${botId}/download?tenant=${tenantId}`,
      },
    };
  }

  private async listPartnerBots(partnerId: string): Promise<ToolResult> {
    // TODO: Query database
    return {
      success: true,
      result: {
        partnerId,
        bots: [],
      },
    };
  }

  // ============================================================
  // Resource Implementations
  // ============================================================

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
      content: JSON.stringify(details.result, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getBotPricingResource(botId: string): Promise<ResourceContent> {
    const details = await this.getBotDetails(botId);

    return {
      uri: `marketplace://bots/${botId}/pricing`,
      content: JSON.stringify(details.result?.pricing, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getBotDSLResource(botId: string): Promise<ResourceContent> {
    // TODO: Get actual DSL from storage
    const mockDSL = {
      version: '1.0',
      bot: {
        id: botId,
        name: 'FNOL Automation Bot',
        description: 'First Notice of Loss automation',
      },
      nodes: [],
    };

    return {
      uri: `marketplace://bots/${botId}/dsl`,
      content: JSON.stringify(mockDSL, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getPartnerResource(partnerId: string): Promise<ResourceContent> {
    // TODO: Get from database
    const partner = {
      id: partnerId,
      name: 'Skuld Official',
      website: 'https://skuldbot.com',
      revenueShare: 0.5,
      botsPublished: 2,
    };

    return {
      uri: `marketplace://partners/${partnerId}`,
      content: JSON.stringify(partner, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getTenantSubscriptionsResource(
    tenantId: string,
  ): Promise<ResourceContent> {
    const subs = await this.listSubscribedBots(tenantId);

    return {
      uri: `marketplace://tenant/${tenantId}/subscriptions`,
      content: JSON.stringify(subs.result, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getCategoriesResource(): Promise<ResourceContent> {
    const categories = [
      { id: 'insurance', name: 'Insurance', botCount: 5 },
      { id: 'healthcare', name: 'Healthcare', botCount: 3 },
      { id: 'finance', name: 'Finance', botCount: 4 },
      { id: 'hr', name: 'Human Resources', botCount: 2 },
    ];

    return {
      uri: 'marketplace://categories',
      content: JSON.stringify(categories, null, 2),
      mimeType: 'application/json',
    };
  }
}

