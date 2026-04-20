import { Injectable } from '@nestjs/common';

type LabelSet = Record<string, string | number | boolean>;

interface MetricConfig {
  name: string;
  help: string;
  labelNames?: string[];
  registers?: Registry[];
}

interface MetricCollector {
  render(): string;
}

class Registry {
  private readonly collectors: MetricCollector[] = [];

  registerMetric(collector: MetricCollector): void {
    this.collectors.push(collector);
  }

  metrics(): string {
    return this.collectors.map((collector) => collector.render()).join('\n');
  }
}

abstract class BaseMetric {
  protected constructor(
    protected readonly name: string,
    protected readonly help: string,
    protected readonly labelNames: string[] = [],
  ) {}

  protected normalizeLabels(labels?: LabelSet): { key: string; labels: LabelSet } {
    const normalized: LabelSet = {};
    for (const labelName of this.labelNames) {
      const value = labels?.[labelName];
      if (value !== undefined) {
        normalized[labelName] = value;
      }
    }

    const sortedEntries = Object.entries(normalized).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const key = JSON.stringify(sortedEntries);
    return { key, labels: normalized };
  }

  protected formatLabels(labels: LabelSet): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) {
      return '';
    }
    const rendered = entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
      .join(',');
    return `{${rendered}}`;
  }
}

class Counter extends BaseMetric implements MetricCollector {
  private readonly samples = new Map<string, { labels: LabelSet; value: number }>();

  constructor(config: MetricConfig) {
    super(config.name, config.help, config.labelNames ?? []);
    config.registers?.forEach((registry) => registry.registerMetric(this));
  }

  inc(labels: LabelSet = {}, value: number = 1): void {
    const normalized = this.normalizeLabels(labels);
    const existing = this.samples.get(normalized.key);
    if (existing) {
      existing.value += value;
      return;
    }
    this.samples.set(normalized.key, { labels: normalized.labels, value });
  }

  render(): string {
    const header = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} counter`;
    if (this.samples.size === 0) {
      return `${header}\n${this.name} 0`;
    }
    const body = [...this.samples.values()]
      .map((sample) => `${this.name}${this.formatLabels(sample.labels)} ${sample.value}`)
      .join('\n');
    return `${header}\n${body}`;
  }
}

class Gauge extends BaseMetric implements MetricCollector {
  private readonly samples = new Map<string, { labels: LabelSet; value: number }>();

  constructor(config: MetricConfig) {
    super(config.name, config.help, config.labelNames ?? []);
    config.registers?.forEach((registry) => registry.registerMetric(this));
  }

  inc(labels: LabelSet = {}, value: number = 1): void {
    const normalized = this.normalizeLabels(labels);
    const existing = this.samples.get(normalized.key);
    if (existing) {
      existing.value += value;
      return;
    }
    this.samples.set(normalized.key, { labels: normalized.labels, value });
  }

  dec(labels: LabelSet = {}, value: number = 1): void {
    this.inc(labels, -value);
  }

  render(): string {
    const header = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} gauge`;
    if (this.samples.size === 0) {
      return `${header}\n${this.name} 0`;
    }
    const body = [...this.samples.values()]
      .map((sample) => `${this.name}${this.formatLabels(sample.labels)} ${sample.value}`)
      .join('\n');
    return `${header}\n${body}`;
  }
}

class Histogram extends BaseMetric implements MetricCollector {
  private readonly samples = new Map<
    string,
    { labels: LabelSet; count: number; sum: number }
  >();

  constructor(config: MetricConfig) {
    super(config.name, config.help, config.labelNames ?? []);
    config.registers?.forEach((registry) => registry.registerMetric(this));
  }

  observe(labels: LabelSet = {}, value: number): void {
    const normalized = this.normalizeLabels(labels);
    const existing = this.samples.get(normalized.key);
    if (existing) {
      existing.count += 1;
      existing.sum += value;
      return;
    }
    this.samples.set(normalized.key, {
      labels: normalized.labels,
      count: 1,
      sum: value,
    });
  }

  render(): string {
    const header = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} histogram`;
    if (this.samples.size === 0) {
      return `${header}\n${this.name}_count 0\n${this.name}_sum 0`;
    }
    const lines: string[] = [];
    for (const sample of this.samples.values()) {
      const labels = this.formatLabels(sample.labels);
      lines.push(`${this.name}_count${labels} ${sample.count}`);
      lines.push(`${this.name}_sum${labels} ${sample.sum}`);
    }
    return `${header}\n${lines.join('\n')}`;
  }
}

/**
 * MCP Metrics Service
 *
 * Collects and exposes Prometheus-like metrics for MCP servers.
 */
@Injectable()
export class MCPMetricsService {
  private readonly register: Registry;

  private readonly toolCallsTotal: Counter;
  private readonly toolCallDuration: Histogram;
  private readonly toolCallErrors: Counter;

  private readonly resourceReadsTotal: Counter;
  private readonly resourceReadDuration: Histogram;
  private readonly resourceReadErrors: Counter;

  private readonly activeConnections: Gauge;
  private readonly requestsInFlight: Gauge;

  private readonly licensingValidations: Counter;
  private readonly marketplaceBotDownloads: Counter;
  private readonly meteringExecutionsReported: Counter;
  private readonly billingInvoicesGenerated: Counter;
  private readonly complianceClassifications: Counter;
  private readonly compliancePrivateLLMRoutes: Counter;
  private readonly workflowTemplatesCreated: Counter;

  constructor() {
    this.register = new Registry();

    this.toolCallsTotal = new Counter({
      name: 'mcp_tool_calls_total',
      help: 'Total number of MCP tool calls',
      labelNames: ['server', 'tool_name', 'status'],
      registers: [this.register],
    });

    this.toolCallDuration = new Histogram({
      name: 'mcp_tool_call_duration_seconds',
      help: 'Duration of MCP tool calls in seconds',
      labelNames: ['server', 'tool_name'],
      registers: [this.register],
    });

    this.toolCallErrors = new Counter({
      name: 'mcp_tool_call_errors_total',
      help: 'Total number of MCP tool call errors',
      labelNames: ['server', 'tool_name', 'error_type'],
      registers: [this.register],
    });

    this.resourceReadsTotal = new Counter({
      name: 'mcp_resource_reads_total',
      help: 'Total number of MCP resource reads',
      labelNames: ['server', 'resource_type', 'status'],
      registers: [this.register],
    });

    this.resourceReadDuration = new Histogram({
      name: 'mcp_resource_read_duration_seconds',
      help: 'Duration of MCP resource reads in seconds',
      labelNames: ['server', 'resource_type'],
      registers: [this.register],
    });

    this.resourceReadErrors = new Counter({
      name: 'mcp_resource_read_errors_total',
      help: 'Total number of MCP resource read errors',
      labelNames: ['server', 'resource_type', 'error_type'],
      registers: [this.register],
    });

    this.activeConnections = new Gauge({
      name: 'mcp_active_connections',
      help: 'Number of active MCP connections',
      labelNames: ['server'],
      registers: [this.register],
    });

    this.requestsInFlight = new Gauge({
      name: 'mcp_requests_in_flight',
      help: 'Number of MCP requests currently being processed',
      labelNames: ['server'],
      registers: [this.register],
    });

    this.licensingValidations = new Counter({
      name: 'mcp_licensing_validations_total',
      help: 'Total number of license feature validations',
      labelNames: ['tenant_id', 'feature', 'allowed'],
      registers: [this.register],
    });

    this.marketplaceBotDownloads = new Counter({
      name: 'mcp_marketplace_bot_downloads_total',
      help: 'Total number of marketplace bot downloads',
      labelNames: ['tenant_id', 'bot_id'],
      registers: [this.register],
    });

    this.meteringExecutionsReported = new Counter({
      name: 'mcp_metering_executions_reported_total',
      help: 'Total number of bot executions reported',
      labelNames: ['tenant_id', 'bot_id', 'status'],
      registers: [this.register],
    });

    this.billingInvoicesGenerated = new Counter({
      name: 'mcp_billing_invoices_generated_total',
      help: 'Total number of invoices generated',
      labelNames: ['tenant_id'],
      registers: [this.register],
    });

    this.complianceClassifications = new Counter({
      name: 'mcp_compliance_classifications_total',
      help: 'Total number of data classifications',
      labelNames: ['tenant_id', 'classification'],
      registers: [this.register],
    });

    this.compliancePrivateLLMRoutes = new Counter({
      name: 'mcp_compliance_private_llm_routes_total',
      help: 'Total number of private LLM routes (HIPAA compliance)',
      labelNames: ['tenant_id', 'data_classification'],
      registers: [this.register],
    });

    this.workflowTemplatesCreated = new Counter({
      name: 'mcp_workflow_templates_created_total',
      help: 'Total number of workflow templates created',
      labelNames: ['tenant_id', 'category'],
      registers: [this.register],
    });
  }

  recordToolCall(server: string, toolName: string, status: 'success' | 'error') {
    this.toolCallsTotal.inc({ server, tool_name: toolName, status });
  }

  recordToolCallDuration(server: string, toolName: string, durationSeconds: number) {
    this.toolCallDuration.observe({ server, tool_name: toolName }, durationSeconds);
  }

  recordToolCallError(server: string, toolName: string, errorType: string) {
    this.toolCallErrors.inc({ server, tool_name: toolName, error_type: errorType });
  }

  recordResourceRead(server: string, resourceType: string, status: 'success' | 'error') {
    this.resourceReadsTotal.inc({ server, resource_type: resourceType, status });
  }

  recordResourceReadDuration(server: string, resourceType: string, durationSeconds: number) {
    this.resourceReadDuration.observe({ server, resource_type: resourceType }, durationSeconds);
  }

  recordResourceReadError(server: string, resourceType: string, errorType: string) {
    this.resourceReadErrors.inc({ server, resource_type: resourceType, error_type: errorType });
  }

  incrementActiveConnections(server: string) {
    this.activeConnections.inc({ server });
  }

  decrementActiveConnections(server: string) {
    this.activeConnections.dec({ server });
  }

  incrementRequestsInFlight(server: string) {
    this.requestsInFlight.inc({ server });
  }

  decrementRequestsInFlight(server: string) {
    this.requestsInFlight.dec({ server });
  }

  recordLicensingValidation(tenantId: string, feature: string, allowed: boolean) {
    this.licensingValidations.inc({
      tenant_id: tenantId,
      feature,
      allowed: String(allowed),
    });
  }

  recordMarketplaceBotDownload(tenantId: string, botId: string) {
    this.marketplaceBotDownloads.inc({ tenant_id: tenantId, bot_id: botId });
  }

  recordMeteringExecution(tenantId: string, botId: string, status: string) {
    this.meteringExecutionsReported.inc({
      tenant_id: tenantId,
      bot_id: botId,
      status,
    });
  }

  recordBillingInvoice(tenantId: string) {
    this.billingInvoicesGenerated.inc({ tenant_id: tenantId });
  }

  recordComplianceClassification(tenantId: string, classification: string) {
    this.complianceClassifications.inc({
      tenant_id: tenantId,
      classification,
    });
  }

  recordCompliancePrivateLLMRoute(tenantId: string, dataClassification: string) {
    this.compliancePrivateLLMRoutes.inc({
      tenant_id: tenantId,
      data_classification: dataClassification,
    });
  }

  recordWorkflowTemplateCreated(tenantId: string, category: string) {
    this.workflowTemplatesCreated.inc({
      tenant_id: tenantId,
      category,
    });
  }

  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }

  getRegistry(): Registry {
    return this.register;
  }
}
