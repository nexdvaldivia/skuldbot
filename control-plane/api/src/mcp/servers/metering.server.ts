import { Injectable } from '@nestjs/common';
import {
  Tool,
  Resource,
  ToolResult,
  ResourceContent,
  BotExecution,
  CurrentUsage,
  RunnerHeartbeat,
  UsageMetrics,
} from '../types/mcp.types';

/**
 * Metering MCP Server
 * 
 * Tracks usage metrics and calculates costs in real-time.
 * CRITICAL for billing calculation with "whichever is greater" model.
 */
@Injectable()
export class MeteringServer {
  // In-memory storage for demo (should be database in production)
  private usageData: Map<string, CurrentUsage> = new Map();
  private activeRunners: Map<string, RunnerHeartbeat> = new Map();

  /**
   * Get all tools provided by this server
   */
  getTools(): Tool[] {
    return [
      {
        name: 'report_bot_execution',
        description: 'Report a bot execution with metrics for billing',
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
            executionId: {
              type: 'string',
              description: 'Unique execution ID',
            },
            startTime: {
              type: 'string',
              format: 'date-time',
              description: 'Execution start time',
            },
            endTime: {
              type: 'string',
              format: 'date-time',
              description: 'Execution end time',
            },
            status: {
              type: 'string',
              enum: ['success', 'failed', 'timeout'],
              description: 'Execution status',
            },
            metrics: {
              type: 'object',
              description: 'Usage metrics (claimsCompleted, apiCalls, etc)',
              properties: {
                claimsCompleted: { type: 'number' },
                apiCalls: { type: 'number' },
                recordsProcessed: { type: 'number' },
              },
            },
          },
          required: [
            'tenantId',
            'botId',
            'executionId',
            'startTime',
            'endTime',
            'status',
            'metrics',
          ],
        },
        requiresApproval: false,
        tags: ['metering', 'billing', 'usage'],
      },
      {
        name: 'get_current_usage',
        description:
          'Get current usage and projected cost for a bot in the current billing period',
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
          },
          required: ['tenantId', 'botId'],
        },
        requiresApproval: false,
        tags: ['metering', 'billing', 'usage'],
      },
      {
        name: 'get_tenant_usage_summary',
        description: 'Get usage summary for all bots of a tenant',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            period: {
              type: 'string',
              description: 'Billing period (YYYY-MM)',
            },
          },
          required: ['tenantId'],
        },
        requiresApproval: false,
        tags: ['metering', 'billing', 'usage'],
      },
      {
        name: 'report_runner_heartbeat',
        description: 'Report that a runner is active (for runner billing)',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            runnerId: {
              type: 'string',
              description: 'Runner ID',
            },
            type: {
              type: 'string',
              enum: ['attended', 'unattended'],
              description: 'Runner type',
            },
            status: {
              type: 'string',
              enum: ['active', 'idle', 'error'],
              description: 'Runner status',
            },
          },
          required: ['tenantId', 'runnerId', 'type'],
        },
        requiresApproval: false,
        tags: ['metering', 'runners'],
      },
      {
        name: 'get_active_runners',
        description: 'Get list of currently active runners for a tenant',
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
        tags: ['metering', 'runners'],
      },
      {
        name: 'reset_usage_metrics',
        description:
          'Reset usage metrics (called at start of new billing period)',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            period: {
              type: 'string',
              description: 'Billing period (YYYY-MM)',
            },
          },
          required: ['tenantId', 'period'],
        },
        requiresApproval: true,
        tags: ['metering', 'admin'],
      },
    ];
  }

  /**
   * Get all resources provided by this server
   */
  getResources(): Resource[] {
    return [
      {
        uri: 'metering://tenant/{tenantId}/current-period',
        name: 'Current Period Usage',
        description: 'Usage metrics for current billing period',
        mimeType: 'application/json',
        tags: ['metering', 'usage'],
      },
      {
        uri: 'metering://tenant/{tenantId}/bots/{botId}/usage',
        name: 'Bot Usage',
        description: 'Usage metrics for a specific bot',
        mimeType: 'application/json',
        tags: ['metering', 'usage', 'bot'],
      },
      {
        uri: 'metering://tenant/{tenantId}/runners/active',
        name: 'Active Runners',
        description: 'Currently active runners',
        mimeType: 'application/json',
        tags: ['metering', 'runners'],
      },
      {
        uri: 'metering://tenant/{tenantId}/projected-bill',
        name: 'Projected Bill',
        description: 'Projected bill for current period',
        mimeType: 'application/json',
        tags: ['metering', 'billing'],
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
        case 'report_bot_execution':
          return await this.reportBotExecution(toolCall.arguments);

        case 'get_current_usage':
          return await this.getCurrentUsage(
            toolCall.arguments.tenantId,
            toolCall.arguments.botId,
          );

        case 'get_tenant_usage_summary':
          return await this.getTenantUsageSummary(
            toolCall.arguments.tenantId,
            toolCall.arguments.period,
          );

        case 'report_runner_heartbeat':
          return await this.reportRunnerHeartbeat(toolCall.arguments);

        case 'get_active_runners':
          return await this.getActiveRunners(toolCall.arguments.tenantId);

        case 'reset_usage_metrics':
          return await this.resetUsageMetrics(
            toolCall.arguments.tenantId,
            toolCall.arguments.period,
          );

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
    // metering://tenant/{tenantId}/current-period
    const currentPeriodMatch = uri.match(
      /metering:\/\/tenant\/([^/]+)\/current-period/,
    );
    if (currentPeriodMatch) {
      return await this.getCurrentPeriodResource(currentPeriodMatch[1]);
    }

    // metering://tenant/{tenantId}/bots/{botId}/usage
    const botUsageMatch = uri.match(
      /metering:\/\/tenant\/([^/]+)\/bots\/([^/]+)\/usage/,
    );
    if (botUsageMatch) {
      return await this.getBotUsageResource(
        botUsageMatch[1],
        botUsageMatch[2],
      );
    }

    // metering://tenant/{tenantId}/runners/active
    const runnersMatch = uri.match(
      /metering:\/\/tenant\/([^/]+)\/runners\/active/,
    );
    if (runnersMatch) {
      return await this.getActiveRunnersResource(runnersMatch[1]);
    }

    // metering://tenant/{tenantId}/projected-bill
    const projectedMatch = uri.match(
      /metering:\/\/tenant\/([^/]+)\/projected-bill/,
    );
    if (projectedMatch) {
      return await this.getProjectedBillResource(projectedMatch[1]);
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  }

  // ============================================================
  // Tool Implementations
  // ============================================================

  private async reportBotExecution(
    execution: BotExecution,
  ): Promise<ToolResult> {
    const { tenantId, botId, metrics } = execution;
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM

    // Get or create usage record
    const usageKey = `${tenantId}:${botId}:${period}`;
    let usage = this.usageData.get(usageKey);

    if (!usage) {
      usage = {
        tenantId,
        botId,
        period,
        usage: {
          metrics: {},
          costs: {
            usageBased: 0,
            callBased: 0,
            monthlyMinimum: 0,
            charged: 0,
          },
        },
        projectedMonthly: 0,
        minimumCommitment: 0,
        willBeBilled: 0,
      };
    }

    // Accumulate metrics
    for (const [key, value] of Object.entries(metrics)) {
      if (value !== undefined) {
        usage.usage.metrics[key] =
          (usage.usage.metrics[key] || 0) + (value as number);
      }
    }

    // Calculate costs based on bot pricing
    // TODO: Get actual pricing from database
    const pricing = await this.getBotPricing(botId);

    if (pricing.model === 'hybrid') {
      // FNOL Bot example: $3/claim, $0.75/call, $4K minimum
      const claimsCompleted = usage.usage.metrics.claimsCompleted || 0;
      const apiCalls = usage.usage.metrics.apiCalls || 0;

      usage.usage.costs.usageBased = claimsCompleted * (pricing.perUsageRate || 0);
      usage.usage.costs.callBased = apiCalls * (pricing.perCallRate || 0);
      usage.usage.costs.monthlyMinimum = pricing.monthlyMinimum || 0;

      // Calculate "whichever is greater"
      usage.usage.costs.charged = Math.max(
        usage.usage.costs.usageBased,
        usage.usage.costs.callBased,
        usage.usage.costs.monthlyMinimum,
      );
    }

    usage.projectedMonthly = usage.usage.costs.charged;
    usage.minimumCommitment = pricing.monthlyMinimum || 0;
    usage.willBeBilled = Math.max(
      usage.projectedMonthly,
      usage.minimumCommitment,
    );

    // Store updated usage
    this.usageData.set(usageKey, usage);

    // TODO: Also persist to database
    // await this.usageRepository.upsert(usage);

    return {
      success: true,
      result: {
        executionId: execution.executionId,
        recorded: true,
        currentUsage: usage,
        message: `Execution recorded. Current cost: $${usage.usage.costs.charged.toFixed(2)}`,
      },
    };
  }

  private async getCurrentUsage(
    tenantId: string,
    botId: string,
  ): Promise<ToolResult> {
    const period = new Date().toISOString().slice(0, 7);
    const usageKey = `${tenantId}:${botId}:${period}`;
    const usage = this.usageData.get(usageKey);

    if (!usage) {
      return {
        success: true,
        result: {
          tenantId,
          botId,
          period,
          usage: {
            metrics: {},
            costs: {
              usageBased: 0,
              callBased: 0,
              monthlyMinimum: 0,
              charged: 0,
            },
          },
          projectedMonthly: 0,
          minimumCommitment: 0,
          willBeBilled: 0,
          message: 'No usage recorded yet for this period',
        },
      };
    }

    return {
      success: true,
      result: usage,
    };
  }

  private async getTenantUsageSummary(
    tenantId: string,
    period?: string,
  ): Promise<ToolResult> {
    const currentPeriod = period || new Date().toISOString().slice(0, 7);

    // Find all usage records for this tenant in this period
    const tenantUsage: CurrentUsage[] = [];
    for (const [key, usage] of this.usageData.entries()) {
      if (key.startsWith(`${tenantId}:`) && usage.period === currentPeriod) {
        tenantUsage.push(usage);
      }
    }

    const totalCost = tenantUsage.reduce(
      (sum, usage) => sum + usage.willBeBilled,
      0,
    );

    return {
      success: true,
      result: {
        tenantId,
        period: currentPeriod,
        botUsage: tenantUsage,
        totalBotCost: totalCost,
        summary: {
          totalBots: tenantUsage.length,
          totalClaimsCompleted: tenantUsage.reduce(
            (sum, u) => sum + (u.usage.metrics.claimsCompleted || 0),
            0,
          ),
          totalApiCalls: tenantUsage.reduce(
            (sum, u) => sum + (u.usage.metrics.apiCalls || 0),
            0,
          ),
        },
      },
    };
  }

  private async reportRunnerHeartbeat(
    heartbeat: RunnerHeartbeat,
  ): Promise<ToolResult> {
    const key = `${heartbeat.tenantId}:${heartbeat.runnerId}`;
    this.activeRunners.set(key, {
      ...heartbeat,
      timestamp: new Date().toISOString(),
    });

    // TODO: Also persist to database
    // await this.runnerHeartbeatRepository.upsert(heartbeat);

    return {
      success: true,
      result: {
        recorded: true,
        runnerId: heartbeat.runnerId,
        status: heartbeat.status || 'active',
      },
    };
  }

  private async getActiveRunners(tenantId: string): Promise<ToolResult> {
    const now = Date.now();
    const activeRunners: RunnerHeartbeat[] = [];

    // Find runners for this tenant with recent heartbeat (< 5 minutes)
    for (const [key, runner] of this.activeRunners.entries()) {
      if (key.startsWith(`${tenantId}:`)) {
        const heartbeatAge = now - new Date(runner.timestamp).getTime();
        if (heartbeatAge < 5 * 60 * 1000) {
          // 5 minutes
          activeRunners.push(runner);
        }
      }
    }

    return {
      success: true,
      result: {
        tenantId,
        activeRunners,
        totalActive: activeRunners.length,
        attended: activeRunners.filter((r) => r.type === 'attended').length,
        unattended: activeRunners.filter((r) => r.type === 'unattended')
          .length,
      },
    };
  }

  private async resetUsageMetrics(
    tenantId: string,
    period: string,
  ): Promise<ToolResult> {
    // Reset all usage for this tenant in this period
    let resetCount = 0;
    for (const key of this.usageData.keys()) {
      if (key.startsWith(`${tenantId}:`) && key.endsWith(`:${period}`)) {
        this.usageData.delete(key);
        resetCount++;
      }
    }

    return {
      success: true,
      result: {
        tenantId,
        period,
        resetCount,
        message: `Reset ${resetCount} usage records`,
      },
    };
  }

  // ============================================================
  // Resource Implementations
  // ============================================================

  private async getCurrentPeriodResource(
    tenantId: string,
  ): Promise<ResourceContent> {
    const summary = await this.getTenantUsageSummary(tenantId);

    return {
      uri: `metering://tenant/${tenantId}/current-period`,
      content: JSON.stringify(summary.result, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getBotUsageResource(
    tenantId: string,
    botId: string,
  ): Promise<ResourceContent> {
    const usage = await this.getCurrentUsage(tenantId, botId);

    return {
      uri: `metering://tenant/${tenantId}/bots/${botId}/usage`,
      content: JSON.stringify(usage.result, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getActiveRunnersResource(
    tenantId: string,
  ): Promise<ResourceContent> {
    const runners = await this.getActiveRunners(tenantId);

    return {
      uri: `metering://tenant/${tenantId}/runners/active`,
      content: JSON.stringify(runners.result, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getProjectedBillResource(
    tenantId: string,
  ): Promise<ResourceContent> {
    const summary = await this.getTenantUsageSummary(tenantId);
    const runners = await this.getActiveRunners(tenantId);

    // Calculate runner costs
    const runnerCost =
      runners.result.attended * 50 + runners.result.unattended * 200;

    const projectedBill = {
      tenantId,
      period: new Date().toISOString().slice(0, 7),
      botCosts: summary.result.totalBotCost,
      runnerCosts: runnerCost,
      orchestratorLicense: 500,
      studioLicenses: 300,
      subtotal:
        summary.result.totalBotCost + runnerCost + 500 + 300,
      tax: (summary.result.totalBotCost + runnerCost + 500 + 300) * 0.1,
      total:
        (summary.result.totalBotCost + runnerCost + 500 + 300) * 1.1,
    };

    return {
      uri: `metering://tenant/${tenantId}/projected-bill`,
      content: JSON.stringify(projectedBill, null, 2),
      mimeType: 'application/json',
    };
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  private async getBotPricing(botId: string): Promise<any> {
    // TODO: Get from database
    // For now, return FNOL bot pricing
    if (botId === 'fnol-bot-v1') {
      return {
        model: 'hybrid',
        perUsageRate: 3.0,
        perCallRate: 0.75,
        monthlyMinimum: 4000.0,
        currency: 'USD',
        billingCycle: 'monthly',
      };
    }

    return {
      model: 'monthly',
      monthlyMinimum: 500.0,
      currency: 'USD',
      billingCycle: 'monthly',
    };
  }
}

