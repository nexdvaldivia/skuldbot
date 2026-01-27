import { Injectable } from '@nestjs/common';
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

/**
 * MCP Metrics Service
 * 
 * Collects and exposes Prometheus metrics for MCP servers
 */
@Injectable()
export class MCPMetricsService {
  private readonly register: Registry;

  // Tool execution metrics
  private readonly toolCallsTotal: Counter;
  private readonly toolCallDuration: Histogram;
  private readonly toolCallErrors: Counter;

  // Resource read metrics
  private readonly resourceReadsTotal: Counter;
  private readonly resourceReadDuration: Histogram;
  private readonly resourceReadErrors: Counter;

  // Server-specific metrics
  private readonly activeConnections: Gauge;
  private readonly requestsInFlight: Gauge;

  // Business metrics (per server)
  private readonly licensingValidations: Counter;
  private readonly marketplaceBotDownloads: Counter;
  private readonly meteringExecutionsReported: Counter;
  private readonly billingInvoicesGenerated: Counter;
  private readonly complianceClassifications: Counter;
  private readonly compliancePrivateLLMRoutes: Counter;
  private readonly workflowTemplatesCreated: Counter;

  constructor() {
    this.register = new Registry();

    // Tool execution metrics
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
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.register],
    });

    this.toolCallErrors = new Counter({
      name: 'mcp_tool_call_errors_total',
      help: 'Total number of MCP tool call errors',
      labelNames: ['server', 'tool_name', 'error_type'],
      registers: [this.register],
    });

    // Resource read metrics
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
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.register],
    });

    this.resourceReadErrors = new Counter({
      name: 'mcp_resource_read_errors_total',
      help: 'Total number of MCP resource read errors',
      labelNames: ['server', 'resource_type', 'error_type'],
      registers: [this.register],
    });

    // Server metrics
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

    // Business metrics
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

  // ============================================================
  // Tool Call Metrics
  // ============================================================

  recordToolCall(server: string, toolName: string, status: 'success' | 'error') {
    this.toolCallsTotal.inc({ server, tool_name: toolName, status });
  }

  recordToolCallDuration(server: string, toolName: string, durationSeconds: number) {
    this.toolCallDuration.observe({ server, tool_name: toolName }, durationSeconds);
  }

  recordToolCallError(server: string, toolName: string, errorType: string) {
    this.toolCallErrors.inc({ server, tool_name: toolName, error_type: errorType });
  }

  // ============================================================
  // Resource Read Metrics
  // ============================================================

  recordResourceRead(server: string, resourceType: string, status: 'success' | 'error') {
    this.resourceReadsTotal.inc({ server, resource_type: resourceType, status });
  }

  recordResourceReadDuration(server: string, resourceType: string, durationSeconds: number) {
    this.resourceReadDuration.observe({ server, resource_type: resourceType }, durationSeconds);
  }

  recordResourceReadError(server: string, resourceType: string, errorType: string) {
    this.resourceReadErrors.inc({ server, resource_type: resourceType, error_type: errorType });
  }

  // ============================================================
  // Server Metrics
  // ============================================================

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

  // ============================================================
  // Business Metrics
  // ============================================================

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

  // ============================================================
  // Export Metrics
  // ============================================================

  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }

  getRegistry(): Registry {
    return this.register;
  }
}

