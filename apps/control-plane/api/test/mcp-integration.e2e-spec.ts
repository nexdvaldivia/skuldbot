import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Control Plane MCP Integration Tests (E2E)
 *
 * Tests the complete flow of MCP operations across multiple servers:
 * 1. Licensing: Check feature entitlements
 * 2. Marketplace: Browse and subscribe to bots
 * 3. Metering: Report usage from Orchestrator
 * 4. Billing: Generate invoices and process payments
 *
 * Simulates a realistic tenant journey from onboarding to billing.
 */
describe('Control Plane MCP Integration (E2E)', () => {
  let app: INestApplication;
  let tenantId: string;
  let customerId: string;
  let botInstallationId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Generate unique tenant ID for this test run
    tenantId = `test-tenant-${Date.now()}`;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('End-to-End Tenant Journey', () => {
    it('Step 1: Check license and available features', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'check_license',
          arguments: {
            tenantId,
            featureKey: 'marketplace_access',
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.isAllowed).toBeDefined();
    });

    it('Step 2: List available marketplace bots', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'list_marketplace_bots',
          arguments: {
            category: 'claims',
            limit: 10,
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.bots).toBeDefined();
      expect(Array.isArray(response.body.result.bots)).toBe(true);
    });

    it('Step 3: Get details of FNOL bot', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'get_marketplace_bot',
          arguments: {
            botId: 'fnol-bot-v1',
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.bot).toBeDefined();
      expect(response.body.result.bot.id).toBe('fnol-bot-v1');
      expect(response.body.result.bot.pricing).toBeDefined();
    });

    it('Step 4: Subscribe tenant to FNOL bot', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'subscribe_to_bot',
          arguments: {
            tenantId,
            botId: 'fnol-bot-v1',
            planId: 'hybrid-plan',
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.subscriptionId).toBeDefined();
      botInstallationId = response.body.result.subscriptionId;
    });

    it('Step 5: Report usage from Orchestrator', async () => {
      // Simulate Orchestrator reporting bot usage
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'report_usage',
          arguments: {
            tenantId,
            orchestratorId: 'orch-test-1',
            metric: 'fnol.claims_completed',
            value: 150,
            metadata: {
              installationId: botInstallationId,
              botId: 'fnol-bot-v1',
              period: '2026-01',
            },
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.recorded).toBe(true);
    });

    it('Step 6: Report API call usage', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'report_usage',
          arguments: {
            tenantId,
            orchestratorId: 'orch-test-1',
            metric: 'fnol.api_calls',
            value: 2000,
            metadata: {
              installationId: botInstallationId,
              botId: 'fnol-bot-v1',
              period: '2026-01',
            },
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('Step 7: Get usage summary', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'get_usage_summary',
          arguments: {
            tenantId,
            orchestratorId: 'orch-test-1',
            period: '2026-01',
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.metrics).toBeDefined();
      expect(response.body.result.metrics['fnol.claims_completed']).toBeDefined();
      expect(response.body.result.metrics['fnol.api_calls']).toBeDefined();
    });

    it('Step 8: Create Stripe customer for billing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'create_stripe_customer',
          arguments: {
            email: `${tenantId}@example.com`,
            name: 'ACME Insurance Corp',
            metadata: {
              tenantId,
            },
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.customerId).toBeDefined();
      customerId = response.body.result.customerId;
    });

    it('Step 9: Calculate monthly invoice', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'calculate_invoice',
          arguments: {
            tenantId,
            period: '2026-01',
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.invoiceId).toBeDefined();
      expect(response.body.result.items).toBeDefined();
      expect(response.body.result.total).toBeGreaterThan(0);

      // Verify marketplace bot charges are included
      const marketplaceBots = response.body.result.items.find(
        (item) => item.category === 'marketplace_bots',
      );
      expect(marketplaceBots).toBeDefined();
      expect(marketplaceBots.total).toBeGreaterThan(0);
    });

    it('Step 10: List all invoices for tenant', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'list_invoices',
          arguments: {
            tenantId,
            limit: 12,
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.invoices).toBeDefined();
      expect(Array.isArray(response.body.result.invoices)).toBe(true);
    });
  });

  describe('MCP Resource Discovery', () => {
    it('should list all available tools', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/mcp/tools').expect(200);

      expect(response.body.tools).toBeDefined();
      expect(response.body.tools.length).toBeGreaterThan(0);

      const toolNames = response.body.tools.map((t) => t.name);
      expect(toolNames).toContain('check_license');
      expect(toolNames).toContain('list_marketplace_bots');
      expect(toolNames).toContain('report_usage');
      expect(toolNames).toContain('calculate_invoice');
    });

    it('should list all available resources', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/mcp/resources').expect(200);

      expect(response.body.resources).toBeDefined();
      expect(response.body.resources.length).toBeGreaterThan(0);
    });

    it('should get MCP capabilities', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/mcp/capabilities')
        .expect(200);

      expect(response.body.version).toBeDefined();
      expect(response.body.servers).toBeDefined();
      expect(Array.isArray(response.body.servers)).toBe(true);

      const serverNames = response.body.servers.map((s) => s.name);
      expect(serverNames).toContain('licensing');
      expect(serverNames).toContain('marketplace');
      expect(serverNames).toContain('metering');
      expect(serverNames).toContain('billing');
    });
  });

  describe('Cross-Server Integration', () => {
    it('should validate license before marketplace access', async () => {
      // First check if marketplace is allowed
      const licenseCheck = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'check_license',
          arguments: {
            tenantId,
            featureKey: 'marketplace_access',
          },
        });

      if (licenseCheck.body.result.isAllowed) {
        // If allowed, should be able to list bots
        const marketplaceList = await request(app.getHttpServer())
          .post('/api/v1/mcp/tools/call')
          .send({
            name: 'list_marketplace_bots',
            arguments: {},
          })
          .expect(201);

        expect(marketplaceList.body.success).toBe(true);
      }
    });

    it('should calculate billing based on metered usage', async () => {
      // Report some usage
      await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'report_usage',
          arguments: {
            tenantId,
            orchestratorId: 'orch-test-1',
            metric: 'bot.executions',
            value: 1000,
            metadata: {
              period: '2026-01',
            },
          },
        });

      // Calculate invoice (should include usage)
      const invoice = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'calculate_invoice',
          arguments: {
            tenantId,
            period: '2026-01',
          },
        });

      expect(invoice.body.success).toBe(true);
      expect(invoice.body.result.items).toBeDefined();
    });

    it('should handle hybrid pricing model correctly', async () => {
      // Report usage for FNOL bot: 100 claims, 1000 calls
      await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'report_usage',
          arguments: {
            tenantId: 'pricing-test-tenant',
            orchestratorId: 'orch-test-1',
            metric: 'fnol.claims_completed',
            value: 100,
            metadata: {
              installationId: 'inst-pricing-test',
              botId: 'fnol-bot-v1',
              period: '2026-01',
            },
          },
        });

      await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'report_usage',
          arguments: {
            tenantId: 'pricing-test-tenant',
            orchestratorId: 'orch-test-1',
            metric: 'fnol.api_calls',
            value: 1000,
            metadata: {
              installationId: 'inst-pricing-test',
              botId: 'fnol-bot-v1',
              period: '2026-01',
            },
          },
        });

      // Calculate invoice
      const invoice = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'calculate_invoice',
          arguments: {
            tenantId: 'pricing-test-tenant',
            period: '2026-01',
          },
        });

      // Verify hybrid pricing logic
      // 100 claims × $3 = $300
      // 1000 calls × $0.75 = $750
      // Monthly minimum = $4000
      // Should charge $4000 (whichever is greater)
      expect(invoice.body.success).toBe(true);
      const marketplaceBots = invoice.body.result.items.find(
        (item) => item.category === 'marketplace_bots',
      );
      if (marketplaceBots) {
        const fnolBot = marketplaceBots.details.find((d) => d.botId === 'fnol-bot-v1');
        if (fnolBot) {
          expect(fnolBot.costs.charged).toBe(4000);
          expect(fnolBot.explanation).toContain('greater');
        }
      }
    });
  });

  describe('Health and Observability', () => {
    it('should have healthy MCP endpoint', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/mcp/health').expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.servers).toBeDefined();
    });

    it('should expose Prometheus metrics', async () => {
      const response = await request(app.getHttpServer()).get('/metrics').expect(200);

      expect(response.text).toContain('mcp_tool_calls_total');
      expect(response.text).toContain('mcp_tool_call_duration_seconds');
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown tool gracefully', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'unknown_tool',
          arguments: {},
        })
        .expect(201);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Unknown tool');
    });

    it('should validate required arguments', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'check_license',
          arguments: {
            // Missing required tenantId and featureKey
          },
        })
        .expect(201);

      expect(response.body.success).toBe(false);
    });

    it('should handle Stripe API errors', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'process_payment',
          arguments: {
            customerId: 'invalid-customer-id',
            amount: 5000,
          },
        })
        .expect(201);

      // Should fail gracefully
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('OpenAPI Documentation', () => {
    it('should serve OpenAPI spec', async () => {
      const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

      expect(response.body.openapi).toBeDefined();
      expect(response.body.paths).toBeDefined();
      expect(response.body.paths['/api/v1/mcp/tools']).toBeDefined();
    });

    it('should serve Swagger UI', async () => {
      const response = await request(app.getHttpServer()).get('/api/docs').expect(200);

      expect(response.text).toContain('swagger');
    });
  });
});
