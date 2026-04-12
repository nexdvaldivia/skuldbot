import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { BillingService } from '../../billing/billing.service';
import { SubscriptionService } from '../../billing/subscription.service';
import { MarketplaceService } from '../../marketplace/marketplace.service';
import { UsageRecord } from '../../billing/entities/usage-record.entity';
import {
  RunnerHeartbeatEntity,
  RunnerRuntimeStatus,
  RunnerType,
} from '../entities/runner-heartbeat.entity';
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

type BotPricingSnapshot = {
  usageRates: Record<string, number>;
  monthlyMinimum: number;
};

@Injectable()
export class MeteringServer {
  private static readonly ACTIVE_RUNNER_WINDOW_MS = 5 * 60 * 1000;

  constructor(
    private readonly billingService: BillingService,
    private readonly subscriptionService: SubscriptionService,
    private readonly marketplaceService: MarketplaceService,
    @InjectRepository(UsageRecord)
    private readonly usageRecordRepository: Repository<UsageRecord>,
    @InjectRepository(RunnerHeartbeatEntity)
    private readonly heartbeatRepository: Repository<RunnerHeartbeatEntity>,
  ) {}

  getTools(): Tool[] {
    return [
      {
        name: 'report_bot_execution',
        description: 'Report a bot execution with metrics for billing',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: { type: 'string', description: 'Tenant ID' },
            botId: { type: 'string', description: 'Bot ID' },
            executionId: { type: 'string', description: 'Unique execution ID' },
            orchestratorId: {
              type: 'string',
              description: 'Orchestrator instance ID',
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
        description: 'Get current usage and projected cost for a bot in the current billing period',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: { type: 'string', description: 'Tenant ID' },
            botId: { type: 'string', description: 'Bot ID' },
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
            tenantId: { type: 'string', description: 'Tenant ID' },
            period: { type: 'string', description: 'Billing period (YYYY-MM)' },
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
            tenantId: { type: 'string', description: 'Tenant ID' },
            runnerId: { type: 'string', description: 'Runner ID' },
            orchestratorId: { type: 'string', description: 'Orchestrator ID' },
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
            tenantId: { type: 'string', description: 'Tenant ID' },
          },
          required: ['tenantId'],
        },
        requiresApproval: false,
        tags: ['metering', 'runners'],
      },
      {
        name: 'reset_usage_metrics',
        description: 'Reset usage metrics (called at start of new billing period)',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: { type: 'string', description: 'Tenant ID' },
            period: { type: 'string', description: 'Billing period (YYYY-MM)' },
          },
          required: ['tenantId', 'period'],
        },
        requiresApproval: true,
        tags: ['metering', 'admin'],
      },
    ];
  }

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

  async executeTool(toolCall: {
    name: string;
    arguments: Record<string, any>;
  }): Promise<ToolResult> {
    try {
      switch (toolCall.name) {
        case 'report_bot_execution':
          return await this.reportBotExecution(toolCall.arguments as BotExecution);
        case 'get_current_usage':
          return await this.getCurrentUsage(toolCall.arguments.tenantId, toolCall.arguments.botId);
        case 'get_tenant_usage_summary':
          return await this.getTenantUsageSummary(
            toolCall.arguments.tenantId,
            toolCall.arguments.period,
          );
        case 'report_runner_heartbeat':
          return await this.reportRunnerHeartbeat(
            toolCall.arguments as RunnerHeartbeat & { orchestratorId?: string },
          );
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
        error: error instanceof Error ? error.message : 'Tool execution failed',
      };
    }
  }

  async readResource(uri: string): Promise<ResourceContent> {
    const currentPeriodMatch = uri.match(/metering:\/\/tenant\/([^/]+)\/current-period/);
    if (currentPeriodMatch) {
      return this.getCurrentPeriodResource(currentPeriodMatch[1]);
    }

    const botUsageMatch = uri.match(/metering:\/\/tenant\/([^/]+)\/bots\/([^/]+)\/usage/);
    if (botUsageMatch) {
      return this.getBotUsageResource(botUsageMatch[1], botUsageMatch[2]);
    }

    const runnersMatch = uri.match(/metering:\/\/tenant\/([^/]+)\/runners\/active/);
    if (runnersMatch) {
      return this.getActiveRunnersResource(runnersMatch[1]);
    }

    const projectedMatch = uri.match(/metering:\/\/tenant\/([^/]+)\/projected-bill/);
    if (projectedMatch) {
      return this.getProjectedBillResource(projectedMatch[1]);
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  }

  private async reportBotExecution(
    execution: BotExecution & { orchestratorId?: string },
  ): Promise<ToolResult> {
    this.assertUuid(execution.tenantId, 'tenantId');
    this.assertUuid(execution.botId, 'botId');
    if (!execution.executionId?.trim()) {
      throw new Error('executionId is required');
    }

    const endTime = new Date(execution.endTime);
    if (Number.isNaN(endTime.getTime())) {
      throw new Error('Invalid endTime');
    }

    const metricEntries = Object.entries(execution.metrics ?? {}).filter(([, quantity]) =>
      Number.isFinite(quantity as number),
    );
    if (metricEntries.length === 0) {
      throw new Error('At least one numeric metric is required');
    }

    const batch = {
      batchId: `mcp:${execution.executionId}`,
      tenantId: execution.tenantId,
      events: metricEntries.map(([metric, quantity]) => ({
        id: `${execution.executionId}:${metric}`,
        metric,
        quantity: Number(quantity),
        occurredAt: endTime.toISOString(),
        botId: execution.botId,
        installationId: execution.botId,
      })),
      sentAt: new Date().toISOString(),
    };

    const ingest = await this.billingService.ingestUsageBatch(
      execution.orchestratorId ?? 'mcp-metering',
      batch,
    );

    const period = this.getPeriodFromDate(endTime);
    const currentUsage = await this.buildCurrentUsageSnapshot(
      execution.tenantId,
      execution.botId,
      period,
    );

    return {
      success: true,
      result: {
        executionId: execution.executionId,
        recorded: true,
        ingest,
        currentUsage,
      },
    };
  }

  private async getCurrentUsage(tenantId: string, botId: string): Promise<ToolResult> {
    this.assertUuid(tenantId, 'tenantId');
    this.assertUuid(botId, 'botId');
    const usage = await this.buildCurrentUsageSnapshot(tenantId, botId, this.getCurrentPeriod());

    return {
      success: true,
      result: usage,
    };
  }

  private async getTenantUsageSummary(tenantId: string, period?: string): Promise<ToolResult> {
    this.assertUuid(tenantId, 'tenantId');
    const targetPeriod = period?.trim() || this.getCurrentPeriod();
    this.assertPeriod(targetPeriod);

    const usageRecords = await this.usageRecordRepository.find({
      where: { tenantId, period: targetPeriod },
    });

    const botIds = [...new Set(usageRecords.map((record) => record.botId).filter(Boolean))];
    const botUsage = await Promise.all(
      botIds.map((botId) =>
        this.buildCurrentUsageSnapshot(tenantId, botId as string, targetPeriod),
      ),
    );

    const totalBotCost = botUsage.reduce((sum, usage) => sum + Number(usage.willBeBilled ?? 0), 0);

    const totalClaimsCompleted = usageRecords.reduce((sum, record) => {
      const normalized = this.normalizeMetric(record.metric);
      return normalized === 'claimscompleted' ? sum + Number(record.quantity) : sum;
    }, 0);

    const totalApiCalls = usageRecords.reduce((sum, record) => {
      const normalized = this.normalizeMetric(record.metric);
      return normalized === 'apicalls' ? sum + Number(record.quantity) : sum;
    }, 0);

    return {
      success: true,
      result: {
        tenantId,
        period: targetPeriod,
        botUsage,
        totalBotCost,
        summary: {
          totalBots: botUsage.length,
          totalClaimsCompleted,
          totalApiCalls,
        },
      },
    };
  }

  private async reportRunnerHeartbeat(
    heartbeat: RunnerHeartbeat & { orchestratorId?: string },
  ): Promise<ToolResult> {
    this.assertUuid(heartbeat.tenantId, 'tenantId');
    this.assertUuid(heartbeat.runnerId, 'runnerId');

    const existing = await this.heartbeatRepository.findOne({
      where: {
        tenantId: heartbeat.tenantId,
        runnerId: heartbeat.runnerId,
      },
    });

    const now = new Date();
    const entity = existing ?? this.heartbeatRepository.create();
    entity.tenantId = heartbeat.tenantId;
    entity.runnerId = heartbeat.runnerId;
    entity.orchestratorId = heartbeat.orchestratorId;
    entity.type = this.normalizeRunnerType(heartbeat.type);
    entity.status = this.normalizeRunnerStatus(heartbeat.status);
    entity.heartbeatAt = now;

    await this.heartbeatRepository.save(entity);

    return {
      success: true,
      result: {
        recorded: true,
        runnerId: heartbeat.runnerId,
        status: entity.status,
        timestamp: entity.heartbeatAt.toISOString(),
      },
    };
  }

  private async getActiveRunners(tenantId: string): Promise<ToolResult> {
    this.assertUuid(tenantId, 'tenantId');
    const minHeartbeatAt = new Date(Date.now() - MeteringServer.ACTIVE_RUNNER_WINDOW_MS);

    const activeRunners = await this.heartbeatRepository.find({
      where: {
        tenantId,
        heartbeatAt: MoreThanOrEqual(minHeartbeatAt),
      },
      order: { heartbeatAt: 'DESC' },
    });

    return {
      success: true,
      result: {
        tenantId,
        activeRunners: activeRunners.map((runner) => ({
          tenantId: runner.tenantId,
          runnerId: runner.runnerId,
          type: runner.type,
          status: runner.status,
          timestamp: runner.heartbeatAt.toISOString(),
          orchestratorId: runner.orchestratorId ?? null,
        })),
        totalActive: activeRunners.length,
        attended: activeRunners.filter((runner) => runner.type === RunnerType.ATTENDED).length,
        unattended: activeRunners.filter((runner) => runner.type === RunnerType.UNATTENDED).length,
      },
    };
  }

  private async resetUsageMetrics(tenantId: string, period: string): Promise<ToolResult> {
    this.assertUuid(tenantId, 'tenantId');
    this.assertPeriod(period);

    const deleteResult = await this.usageRecordRepository.delete({
      tenantId,
      period,
    });

    return {
      success: true,
      result: {
        tenantId,
        period,
        resetCount: deleteResult.affected ?? 0,
      },
    };
  }

  private async getCurrentPeriodResource(tenantId: string): Promise<ResourceContent> {
    const summary = await this.getTenantUsageSummary(tenantId);
    return {
      uri: `metering://tenant/${tenantId}/current-period`,
      content: JSON.stringify(summary.result, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getBotUsageResource(tenantId: string, botId: string): Promise<ResourceContent> {
    const usage = await this.getCurrentUsage(tenantId, botId);
    return {
      uri: `metering://tenant/${tenantId}/bots/${botId}/usage`,
      content: JSON.stringify(usage.result, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getActiveRunnersResource(tenantId: string): Promise<ResourceContent> {
    const runners = await this.getActiveRunners(tenantId);
    return {
      uri: `metering://tenant/${tenantId}/runners/active`,
      content: JSON.stringify(runners.result, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getProjectedBillResource(tenantId: string): Promise<ResourceContent> {
    const summary = await this.getTenantUsageSummary(tenantId);
    const activeRunners = await this.getActiveRunners(tenantId);
    const subscription = await this.subscriptionService.getSubscription(tenantId);

    const subscriptionBase = Number(subscription?.monthlyAmount ?? 0);
    const botCosts = Number(summary.result?.totalBotCost ?? 0);
    const runnerCosts = 0;
    const subtotal = botCosts + runnerCosts + subscriptionBase;
    const tax = 0;

    const projectedBill = {
      tenantId,
      period: this.getCurrentPeriod(),
      botCosts,
      runnerCosts,
      subscriptionBase,
      activeRunners: activeRunners.result?.totalActive ?? 0,
      subtotal,
      tax,
      total: subtotal + tax,
      currency: subscription?.currency ?? 'USD',
    };

    return {
      uri: `metering://tenant/${tenantId}/projected-bill`,
      content: JSON.stringify(projectedBill, null, 2),
      mimeType: 'application/json',
    };
  }

  private async buildCurrentUsageSnapshot(
    tenantId: string,
    botId: string,
    period: string,
  ): Promise<CurrentUsage & { message?: string }> {
    const records = await this.usageRecordRepository.find({
      where: { tenantId, botId, period },
    });

    const metrics: UsageMetrics = {};
    for (const record of records) {
      metrics[record.metric] = (metrics[record.metric] || 0) + Number(record.quantity);
    }

    const pricing = await this.resolveBotPricing(botId);
    const costs = this.computeCosts(metrics, pricing, records);

    const snapshot: CurrentUsage & { message?: string } = {
      tenantId,
      botId,
      period,
      usage: {
        metrics,
        costs,
      },
      projectedMonthly: costs.charged,
      minimumCommitment: pricing.monthlyMinimum,
      willBeBilled: Math.max(costs.charged, pricing.monthlyMinimum),
    };

    if (records.length === 0) {
      snapshot.message = 'No usage recorded yet for this period';
    }

    return snapshot;
  }

  private async resolveBotPricing(botId: string): Promise<BotPricingSnapshot> {
    try {
      const bot = await this.marketplaceService.getBotById(botId);
      const usageRates: Record<string, number> = {};
      for (const metric of bot.pricing?.usageMetrics ?? []) {
        usageRates[this.normalizeMetric(metric.metric)] = Number(metric.pricePerUnit ?? 0);
      }

      return {
        usageRates,
        monthlyMinimum: Number(bot.pricing?.minimumMonthly ?? bot.pricing?.monthlyBase ?? 0),
      };
    } catch {
      return {
        usageRates: {},
        monthlyMinimum: 0,
      };
    }
  }

  private computeCosts(
    metrics: UsageMetrics,
    pricing: BotPricingSnapshot,
    records: UsageRecord[],
  ): CurrentUsage['usage']['costs'] {
    let usageBased = 0;
    let callBased = 0;

    for (const [metricName, quantity] of Object.entries(metrics)) {
      const normalizedMetric = this.normalizeMetric(metricName);
      const rate = Number(pricing.usageRates[normalizedMetric] ?? 0);
      const amount = Number(quantity ?? 0) * rate;
      usageBased += amount;
      if (normalizedMetric.includes('call') || normalizedMetric.includes('api')) {
        callBased += amount;
      }
    }

    if (usageBased === 0) {
      usageBased = records.reduce((sum, record) => sum + Number(record.totalAmount ?? 0), 0);
    }

    const charged = Math.max(usageBased, callBased, pricing.monthlyMinimum);

    return {
      usageBased,
      callBased,
      monthlyMinimum: pricing.monthlyMinimum,
      charged,
    };
  }

  private normalizeMetric(metric: string): string {
    return metric.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  }

  private normalizeRunnerType(type?: string): RunnerType {
    if (type === RunnerType.ATTENDED) {
      return RunnerType.ATTENDED;
    }
    if (type === RunnerType.UNATTENDED) {
      return RunnerType.UNATTENDED;
    }
    throw new Error(`Invalid runner type: ${type}`);
  }

  private normalizeRunnerStatus(status?: string): RunnerRuntimeStatus {
    if (!status) {
      return RunnerRuntimeStatus.ACTIVE;
    }
    if (status === RunnerRuntimeStatus.ACTIVE) {
      return RunnerRuntimeStatus.ACTIVE;
    }
    if (status === RunnerRuntimeStatus.IDLE) {
      return RunnerRuntimeStatus.IDLE;
    }
    if (status === RunnerRuntimeStatus.ERROR) {
      return RunnerRuntimeStatus.ERROR;
    }
    throw new Error(`Invalid runner status: ${status}`);
  }

  private assertPeriod(period: string): void {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new Error(`Invalid period format: ${period}`);
    }
  }

  private assertUuid(value: string, fieldName: string): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value ?? '')) {
      throw new Error(`${fieldName} must be a valid UUID`);
    }
  }

  private getCurrentPeriod(): string {
    return this.getPeriodFromDate(new Date());
  }

  private getPeriodFromDate(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }
}
