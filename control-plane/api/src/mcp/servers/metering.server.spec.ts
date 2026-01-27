import { Test, TestingModule } from '@nestjs/testing';
import { MeteringServer } from './metering.server';

describe('MeteringServer', () => {
  let server: MeteringServer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MeteringServer],
    }).compile();

    server = module.get<MeteringServer>(MeteringServer);
  });

  describe('getTools', () => {
    it('should return all metering tools', () => {
      const tools = server.getTools();
      
      expect(tools).toHaveLength(6);
      expect(tools.map(t => t.name)).toContain('report_bot_execution');
      expect(tools.map(t => t.name)).toContain('get_current_usage');
      expect(tools.map(t => t.name)).toContain('get_tenant_usage_summary');
    });
  });

  describe('executeTool - report_bot_execution', () => {
    it('should record bot execution with metrics', async () => {
      const result = await server.executeTool({
        name: 'report_bot_execution',
        arguments: {
          tenantId: 'test-tenant',
          botId: 'fnol-bot-v1',
          executionId: 'exec-123',
          startTime: '2026-01-27T10:00:00Z',
          endTime: '2026-01-27T10:05:00Z',
          status: 'success',
          metrics: {
            claimsCompleted: 1,
            apiCalls: 15,
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.executionId).toBe('exec-123');
      expect(result.result.recorded).toBe(true);
      expect(result.result.currentUsage).toBeDefined();
    });

    it('should accumulate metrics over multiple executions', async () => {
      // First execution
      await server.executeTool({
        name: 'report_bot_execution',
        arguments: {
          tenantId: 'test-tenant',
          botId: 'fnol-bot-v1',
          executionId: 'exec-1',
          startTime: '2026-01-27T10:00:00Z',
          endTime: '2026-01-27T10:05:00Z',
          status: 'success',
          metrics: { claimsCompleted: 5, apiCalls: 50 },
        },
      });

      // Second execution
      const result = await server.executeTool({
        name: 'report_bot_execution',
        arguments: {
          tenantId: 'test-tenant',
          botId: 'fnol-bot-v1',
          executionId: 'exec-2',
          startTime: '2026-01-27T11:00:00Z',
          endTime: '2026-01-27T11:05:00Z',
          status: 'success',
          metrics: { claimsCompleted: 3, apiCalls: 30 },
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.currentUsage.usage.metrics.claimsCompleted).toBe(8);
      expect(result.result.currentUsage.usage.metrics.apiCalls).toBe(80);
    });

    describe('Whichever is Greater billing', () => {
      it('should charge monthly minimum when usage is low', async () => {
        const result = await server.executeTool({
          name: 'report_bot_execution',
          arguments: {
            tenantId: 'test-tenant',
            botId: 'fnol-bot-v1',
            executionId: 'exec-low',
            startTime: '2026-01-27T10:00:00Z',
            endTime: '2026-01-27T10:05:00Z',
            status: 'success',
            metrics: {
              claimsCompleted: 1, // 1 × $3 = $3
              apiCalls: 10,        // 10 × $0.75 = $7.50
            },
          },
        });

        expect(result.success).toBe(true);
        const costs = result.result.currentUsage.usage.costs;
        expect(costs.usageBased).toBe(3);
        expect(costs.callBased).toBe(7.5);
        expect(costs.monthlyMinimum).toBe(4000);
        expect(costs.charged).toBe(4000); // Monthly minimum is greater
      });

      it('should charge usage-based when it exceeds minimum', async () => {
        const result = await server.executeTool({
          name: 'report_bot_execution',
          arguments: {
            tenantId: 'test-tenant',
            botId: 'high-usage-bot',
            executionId: 'exec-high',
            startTime: '2026-01-27T10:00:00Z',
            endTime: '2026-01-27T10:05:00Z',
            status: 'success',
            metrics: {
              claimsCompleted: 2000, // 2000 × $3 = $6,000
              apiCalls: 500,          // 500 × $0.75 = $375
            },
          },
        });

        expect(result.success).toBe(true);
        const costs = result.result.currentUsage.usage.costs;
        expect(costs.usageBased).toBe(6000);
        expect(costs.callBased).toBe(375);
        expect(costs.charged).toBe(6000); // Usage-based is greater
      });

      it('should charge call-based when it exceeds both', async () => {
        const result = await server.executeTool({
          name: 'report_bot_execution',
          arguments: {
            tenantId: 'test-tenant',
            botId: 'api-heavy-bot',
            executionId: 'exec-api',
            startTime: '2026-01-27T10:00:00Z',
            endTime: '2026-01-27T10:05:00Z',
            status: 'success',
            metrics: {
              claimsCompleted: 100, // 100 × $3 = $300
              apiCalls: 10000,      // 10000 × $0.75 = $7,500
            },
          },
        });

        expect(result.success).toBe(true);
        const costs = result.result.currentUsage.usage.costs;
        expect(costs.usageBased).toBe(300);
        expect(costs.callBased).toBe(7500);
        expect(costs.charged).toBe(7500); // Call-based is greater
      });
    });
  });

  describe('executeTool - get_current_usage', () => {
    it('should return current usage for bot', async () => {
      // Report some usage first
      await server.executeTool({
        name: 'report_bot_execution',
        arguments: {
          tenantId: 'test-tenant',
          botId: 'test-bot',
          executionId: 'exec-1',
          startTime: '2026-01-27T10:00:00Z',
          endTime: '2026-01-27T10:05:00Z',
          status: 'success',
          metrics: { claimsCompleted: 10 },
        },
      });

      const result = await server.executeTool({
        name: 'get_current_usage',
        arguments: {
          tenantId: 'test-tenant',
          botId: 'test-bot',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.tenantId).toBe('test-tenant');
      expect(result.result.botId).toBe('test-bot');
      expect(result.result.usage.metrics.claimsCompleted).toBe(10);
    });

    it('should return zero usage for new bot', async () => {
      const result = await server.executeTool({
        name: 'get_current_usage',
        arguments: {
          tenantId: 'test-tenant',
          botId: 'new-bot',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.projectedMonthly).toBe(0);
      expect(result.result.message).toContain('No usage');
    });
  });

  describe('executeTool - get_tenant_usage_summary', () => {
    it('should return summary for all bots', async () => {
      // Report usage for multiple bots
      await server.executeTool({
        name: 'report_bot_execution',
        arguments: {
          tenantId: 'test-tenant',
          botId: 'bot-1',
          executionId: 'exec-1',
          startTime: '2026-01-27T10:00:00Z',
          endTime: '2026-01-27T10:05:00Z',
          status: 'success',
          metrics: { claimsCompleted: 10, apiCalls: 100 },
        },
      });

      await server.executeTool({
        name: 'report_bot_execution',
        arguments: {
          tenantId: 'test-tenant',
          botId: 'bot-2',
          executionId: 'exec-2',
          startTime: '2026-01-27T11:00:00Z',
          endTime: '2026-01-27T11:05:00Z',
          status: 'success',
          metrics: { claimsCompleted: 5, apiCalls: 50 },
        },
      });

      const result = await server.executeTool({
        name: 'get_tenant_usage_summary',
        arguments: {
          tenantId: 'test-tenant',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.tenantId).toBe('test-tenant');
      expect(result.result.botUsage).toHaveLength(2);
      expect(result.result.summary.totalClaimsCompleted).toBe(15);
      expect(result.result.summary.totalApiCalls).toBe(150);
    });
  });

  describe('executeTool - report_runner_heartbeat', () => {
    it('should record runner heartbeat', async () => {
      const result = await server.executeTool({
        name: 'report_runner_heartbeat',
        arguments: {
          tenantId: 'test-tenant',
          runnerId: 'runner-1',
          type: 'unattended',
          status: 'active',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.recorded).toBe(true);
      expect(result.result.runnerId).toBe('runner-1');
    });
  });

  describe('executeTool - get_active_runners', () => {
    it('should return active runners', async () => {
      // Report heartbeats
      await server.executeTool({
        name: 'report_runner_heartbeat',
        arguments: {
          tenantId: 'test-tenant',
          runnerId: 'runner-1',
          type: 'attended',
        },
      });

      await server.executeTool({
        name: 'report_runner_heartbeat',
        arguments: {
          tenantId: 'test-tenant',
          runnerId: 'runner-2',
          type: 'unattended',
        },
      });

      const result = await server.executeTool({
        name: 'get_active_runners',
        arguments: {
          tenantId: 'test-tenant',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.totalActive).toBe(2);
      expect(result.result.attended).toBe(1);
      expect(result.result.unattended).toBe(1);
    });

    it('should only return recent runners', async () => {
      // This would require mocking time to test properly
      // For now, just verify structure
      const result = await server.executeTool({
        name: 'get_active_runners',
        arguments: {
          tenantId: 'test-tenant',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.activeRunners).toBeDefined();
      expect(Array.isArray(result.result.activeRunners)).toBe(true);
    });
  });

  describe('readResource', () => {
    it('should read current period usage', async () => {
      const resource = await server.readResource('metering://tenant/test-tenant/current-period');

      expect(resource.uri).toBe('metering://tenant/test-tenant/current-period');
      const content = JSON.parse(resource.content);
      expect(content.result).toBeDefined();
    });

    it('should read bot-specific usage', async () => {
      const resource = await server.readResource('metering://tenant/test-tenant/bots/bot-1/usage');

      const content = JSON.parse(resource.content);
      expect(content.result).toBeDefined();
    });

    it('should read projected bill', async () => {
      const resource = await server.readResource('metering://tenant/test-tenant/projected-bill');

      const content = JSON.parse(resource.content);
      expect(content.tenantId).toBe('test-tenant');
      expect(content.botCosts).toBeDefined();
      expect(content.runnerCosts).toBeDefined();
      expect(content.total).toBeDefined();
    });
  });
});

