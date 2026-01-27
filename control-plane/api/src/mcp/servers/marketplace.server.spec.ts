import { Test, TestingModule } from '@nestjs/testing';
import { MarketplaceServer } from './marketplace.server';

describe('MarketplaceServer', () => {
  let server: MarketplaceServer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MarketplaceServer],
    }).compile();

    server = module.get<MarketplaceServer>(MarketplaceServer);
  });

  describe('getTools', () => {
    it('should return all marketplace tools', () => {
      const tools = server.getTools();
      
      expect(tools).toHaveLength(7);
      expect(tools.map(t => t.name)).toContain('search_marketplace');
      expect(tools.map(t => t.name)).toContain('get_bot_details');
      expect(tools.map(t => t.name)).toContain('subscribe_to_bot');
      expect(tools.map(t => t.name)).toContain('download_bot');
    });

    it('should have correct input schemas', () => {
      const searchTool = server.getTools().find(t => t.name === 'search_marketplace');
      
      expect(searchTool.inputSchema.required).toContain('tenantId');
      expect(searchTool.requiresApproval).toBe(false);
      expect(searchTool.tags).toContain('marketplace');
    });
  });

  describe('getResources', () => {
    it('should return all marketplace resources', () => {
      const resources = server.getResources();
      
      expect(resources).toHaveLength(6);
      expect(resources.map(r => r.uri)).toContain('marketplace://bots');
      expect(resources.map(r => r.uri)).toContain('marketplace://tenant/{tenantId}/subscriptions');
    });
  });

  describe('executeTool - search_marketplace', () => {
    it('should search bots by category', async () => {
      const result = await server.executeTool({
        name: 'search_marketplace',
        arguments: {
          tenantId: 'test-tenant',
          category: 'claims',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.bots).toBeDefined();
      expect(Array.isArray(result.result.bots)).toBe(true);
      
      // Should only return claims bots
      const allClaims = result.result.bots.every(bot => bot.category === 'claims');
      expect(allClaims).toBe(true);
    });

    it('should search bots by industry', async () => {
      const result = await server.executeTool({
        name: 'search_marketplace',
        arguments: {
          tenantId: 'test-tenant',
          industry: 'insurance',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.bots.length).toBeGreaterThan(0);
      
      // Each bot should have insurance in its industry array
      const allInsurance = result.result.bots.every(bot => 
        bot.industry.includes('insurance')
      );
      expect(allInsurance).toBe(true);
    });

    it('should search bots by text query', async () => {
      const result = await server.executeTool({
        name: 'search_marketplace',
        arguments: {
          tenantId: 'test-tenant',
          searchQuery: 'FNOL',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.bots.length).toBeGreaterThan(0);
      
      // Should find FNOL bot
      const fnolBot = result.result.bots.find(b => b.name.includes('FNOL'));
      expect(fnolBot).toBeDefined();
    });

    it('should limit results', async () => {
      const result = await server.executeTool({
        name: 'search_marketplace',
        arguments: {
          tenantId: 'test-tenant',
          limit: 5,
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.bots.length).toBeLessThanOrEqual(5);
    });

    it('should return all bots when no filters', async () => {
      const result = await server.executeTool({
        name: 'search_marketplace',
        arguments: {
          tenantId: 'test-tenant',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.total).toBeGreaterThan(0);
    });
  });

  describe('executeTool - get_bot_details', () => {
    it('should return bot details', async () => {
      const result = await server.executeTool({
        name: 'get_bot_details',
        arguments: {
          botId: 'fnol-bot-v1',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.id).toBe('fnol-bot-v1');
      expect(result.result.name).toBeDefined();
      expect(result.result.description).toBeDefined();
      expect(result.result.pricing).toBeDefined();
      expect(result.result.versions).toBeDefined();
    });

    it('should include pricing model details', async () => {
      const result = await server.executeTool({
        name: 'get_bot_details',
        arguments: {
          botId: 'fnol-bot-v1',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.pricing.model).toBe('hybrid');
      expect(result.result.pricing.perUsageRate).toBe(3.0);
      expect(result.result.pricing.perCallRate).toBe(0.75);
      expect(result.result.pricing.monthlyMinimum).toBe(4000.0);
    });

    it('should return error for non-existent bot', async () => {
      const result = await server.executeTool({
        name: 'get_bot_details',
        arguments: {
          botId: 'non-existent-bot',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('executeTool - subscribe_to_bot', () => {
    it('should subscribe to bot', async () => {
      const result = await server.executeTool({
        name: 'subscribe_to_bot',
        arguments: {
          tenantId: 'test-tenant',
          botId: 'fnol-bot-v1',
          pricingTier: 'professional',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.subscriptionId).toBeDefined();
      expect(result.result.status).toBe('active');
      expect(result.result.botId).toBe('fnol-bot-v1');
    });

    it('should prevent duplicate subscriptions', async () => {
      // First subscription
      await server.executeTool({
        name: 'subscribe_to_bot',
        arguments: {
          tenantId: 'test-tenant',
          botId: 'claims-processor-v1',
          pricingTier: 'basic',
        },
      });

      // Try to subscribe again
      const result = await server.executeTool({
        name: 'subscribe_to_bot',
        arguments: {
          tenantId: 'test-tenant',
          botId: 'claims-processor-v1',
          pricingTier: 'basic',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already subscribed');
    });

    it('should set correct pricing tier', async () => {
      const result = await server.executeTool({
        name: 'subscribe_to_bot',
        arguments: {
          tenantId: 'test-tenant',
          botId: 'data-extractor-v1',
          pricingTier: 'enterprise',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.pricingTier).toBe('enterprise');
    });
  });

  describe('executeTool - unsubscribe_from_bot', () => {
    it('should unsubscribe from bot', async () => {
      // First subscribe
      await server.executeTool({
        name: 'subscribe_to_bot',
        arguments: {
          tenantId: 'test-tenant',
          botId: 'test-bot-1',
          pricingTier: 'basic',
        },
      });

      // Then unsubscribe
      const result = await server.executeTool({
        name: 'unsubscribe_from_bot',
        arguments: {
          tenantId: 'test-tenant',
          botId: 'test-bot-1',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.cancelled).toBe(true);
    });

    it('should fail if not subscribed', async () => {
      const result = await server.executeTool({
        name: 'unsubscribe_from_bot',
        arguments: {
          tenantId: 'test-tenant',
          botId: 'never-subscribed-bot',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not subscribed');
    });
  });

  describe('executeTool - list_subscribed_bots', () => {
    it('should list tenant subscriptions', async () => {
      // Subscribe to a few bots
      await server.executeTool({
        name: 'subscribe_to_bot',
        arguments: {
          tenantId: 'multi-tenant',
          botId: 'bot-a',
          pricingTier: 'basic',
        },
      });

      await server.executeTool({
        name: 'subscribe_to_bot',
        arguments: {
          tenantId: 'multi-tenant',
          botId: 'bot-b',
          pricingTier: 'pro',
        },
      });

      const result = await server.executeTool({
        name: 'list_subscribed_bots',
        arguments: {
          tenantId: 'multi-tenant',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.subscriptions.length).toBeGreaterThanOrEqual(2);
      expect(result.result.total).toBeGreaterThanOrEqual(2);
    });

    it('should return empty for tenant with no subscriptions', async () => {
      const result = await server.executeTool({
        name: 'list_subscribed_bots',
        arguments: {
          tenantId: 'new-tenant-no-subs',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.subscriptions).toHaveLength(0);
      expect(result.result.total).toBe(0);
    });
  });

  describe('executeTool - download_bot', () => {
    it('should download bot DSL', async () => {
      // Must be subscribed first
      await server.executeTool({
        name: 'subscribe_to_bot',
        arguments: {
          tenantId: 'download-tenant',
          botId: 'fnol-bot-v1',
        },
      });

      const result = await server.executeTool({
        name: 'download_bot',
        arguments: {
          tenantId: 'download-tenant',
          botId: 'fnol-bot-v1',
          version: 'latest',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.dsl).toBeDefined();
      expect(result.result.version).toBeDefined();
      expect(result.result.downloadUrl).toBeDefined();
    });

    it('should download specific version', async () => {
      await server.executeTool({
        name: 'subscribe_to_bot',
        arguments: {
          tenantId: 'version-tenant',
          botId: 'fnol-bot-v1',
        },
      });

      const result = await server.executeTool({
        name: 'download_bot',
        arguments: {
          tenantId: 'version-tenant',
          botId: 'fnol-bot-v1',
          version: '1.0.0',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.version).toBe('1.0.0');
    });

    it('should fail if not subscribed', async () => {
      const result = await server.executeTool({
        name: 'download_bot',
        arguments: {
          tenantId: 'not-subscribed-tenant',
          botId: 'fnol-bot-v1',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not subscribed');
    });
  });

  describe('executeTool - list_partner_bots', () => {
    it('should list bots by partner', async () => {
      const result = await server.executeTool({
        name: 'list_partner_bots',
        arguments: {
          partnerId: 'skuld',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.bots).toBeDefined();
      expect(result.result.partner).toBeDefined();
      expect(result.result.partner.name).toBe('Skuld, LLC');
    });
  });

  describe('readResource', () => {
    it('should read all bots catalog', async () => {
      const resource = await server.readResource('marketplace://bots');

      expect(resource.uri).toBe('marketplace://bots');
      const content = JSON.parse(resource.content);
      expect(content.bots).toBeDefined();
      expect(content.total).toBeGreaterThan(0);
    });

    it('should read bots by category', async () => {
      const resource = await server.readResource('marketplace://bots/claims');

      const content = JSON.parse(resource.content);
      expect(content.bots).toBeDefined();
      
      // All should be claims category
      const allClaims = content.bots.every(b => b.category === 'claims');
      expect(allClaims).toBe(true);
    });

    it('should read bot details', async () => {
      const resource = await server.readResource('marketplace://bots/fnol-bot-v1');

      const content = JSON.parse(resource.content);
      expect(content.id).toBe('fnol-bot-v1');
      expect(content.pricing).toBeDefined();
    });

    it('should read tenant subscriptions', async () => {
      await server.executeTool({
        name: 'subscribe_to_bot',
        arguments: {
          tenantId: 'resource-tenant',
          botId: 'fnol-bot-v1',
        },
      });

      const resource = await server.readResource(
        'marketplace://tenant/resource-tenant/subscriptions'
      );

      const content = JSON.parse(resource.content);
      expect(content.subscriptions).toBeDefined();
      expect(content.subscriptions.length).toBeGreaterThan(0);
    });

    it('should read partner bots', async () => {
      const resource = await server.readResource('marketplace://partners/skuld/bots');

      const content = JSON.parse(resource.content);
      expect(content.bots).toBeDefined();
      expect(content.partner.name).toBe('Skuld, LLC');
    });

    it('should throw error for invalid URI', async () => {
      await expect(
        server.readResource('invalid://uri')
      ).rejects.toThrow('Unknown resource URI');
    });
  });

  describe('Bot Catalog', () => {
    it('should have FNOL bot with correct details', async () => {
      const result = await server.executeTool({
        name: 'get_bot_details',
        arguments: { botId: 'fnol-bot-v1' },
      });

      expect(result.success).toBe(true);
      expect(result.result.name).toContain('FNOL');
      expect(result.result.category).toBe('claims');
      expect(result.result.industry).toContain('insurance');
      expect(result.result.rating).toBeGreaterThan(4);
    });

    it('should have multiple bot categories', async () => {
      const resource = await server.readResource('marketplace://bots');
      const content = JSON.parse(resource.content);

      const categories = new Set(content.bots.map(b => b.category));
      expect(categories.size).toBeGreaterThan(1);
      expect(categories.has('claims')).toBe(true);
      expect(categories.has('billing')).toBe(true);
    });

    it('should have bots from verified publishers', async () => {
      const resource = await server.readResource('marketplace://bots');
      const content = JSON.parse(resource.content);

      const verifiedBots = content.bots.filter(b => b.publisher.verified);
      expect(verifiedBots.length).toBeGreaterThan(0);
    });
  });

  describe('Revenue Sharing', () => {
    it('should calculate partner revenue share', async () => {
      await server.executeTool({
        name: 'subscribe_to_bot',
        arguments: {
          tenantId: 'revenue-tenant',
          botId: 'fnol-bot-v1',
        },
      });

      // Simulate usage that generates revenue
      // This would be integrated with Metering Server in production
      // Just verify the structure exists
      const details = await server.executeTool({
        name: 'get_bot_details',
        arguments: { botId: 'fnol-bot-v1' },
      });

      expect(details.result.publisher.revenueShare).toBeDefined();
      expect(details.result.publisher.revenueShare).toBeGreaterThan(0);
      expect(details.result.publisher.revenueShare).toBeLessThanOrEqual(100);
    });
  });

  describe('error handling', () => {
    it('should handle unknown tool', async () => {
      const result = await server.executeTool({
        name: 'unknown_tool',
        arguments: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });

    it('should handle missing required arguments', async () => {
      const result = await server.executeTool({
        name: 'search_marketplace',
        arguments: {
          // Missing tenantId
        },
      });

      expect(result.success).toBe(false);
    });
  });
});

