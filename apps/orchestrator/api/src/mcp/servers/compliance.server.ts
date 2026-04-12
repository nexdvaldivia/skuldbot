import { Injectable } from '@nestjs/common';
import {
  Tool,
  Resource,
  ToolResult,
  ResourceContent,
  DataClassification,
  LLMRoute,
  DataField,
  ClassificationResult,
  AuditLogEntry,
} from '../types/mcp.types';

/**
 * Compliance MCP Server
 *
 * CRITICAL for HIPAA compliance. Runs in tenant's VPC.
 *
 * Capabilities:
 * - PHI/PII detection and classification
 * - LLM routing (cloud vs private vs local)
 * - Data redaction
 * - Audit logging
 * - Compliance policy enforcement
 */
@Injectable()
export class ComplianceServer {
  // In-memory audit log (should be persistent database in production)
  private auditLog: AuditLogEntry[] = [];

  /**
   * Get all tools provided by this server
   */
  getTools(): Tool[] {
    return [
      {
        name: 'classify_data',
        description: 'Classify data fields to detect PHI, PII, PCI, or sensitive information',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            data: {
              type: 'object',
              description: 'Data object with fields to classify',
              additionalProperties: true,
            },
            context: {
              type: 'string',
              description: 'Context about data source (workflow, node, etc)',
            },
          },
          required: ['tenantId', 'data'],
        },
        requiresApproval: false,
        tags: ['compliance', 'classification', 'phi', 'pii'],
      },
      {
        name: 'route_llm_request',
        description: 'Determine which LLM route to use based on data classification',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            dataClassification: {
              type: 'string',
              enum: ['public', 'internal', 'confidential', 'phi', 'pii', 'pci'],
              description: 'Highest classification level in the data',
            },
            preferredRoute: {
              type: 'string',
              enum: ['cloud', 'private', 'local'],
              description: 'Preferred LLM route (if allowed)',
            },
          },
          required: ['tenantId', 'dataClassification'],
        },
        requiresApproval: false,
        tags: ['compliance', 'llm', 'routing'],
      },
      {
        name: 'redact_sensitive_data',
        description: 'Redact sensitive data fields for logging or external transmission',
        inputSchema: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              description: 'Data object to redact',
              additionalProperties: true,
            },
            classificationResult: {
              type: 'object',
              description: 'Previous classification result',
            },
            redactionLevel: {
              type: 'string',
              enum: ['partial', 'full'],
              default: 'partial',
              description: 'Redaction level (partial shows last 4, full is ***)',
            },
          },
          required: ['data'],
        },
        requiresApproval: false,
        tags: ['compliance', 'redaction', 'phi', 'pii'],
      },
      {
        name: 'log_audit_event',
        description: 'Log a compliance-related audit event',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            action: {
              type: 'string',
              description: 'Action being performed',
            },
            resource: {
              type: 'string',
              description: 'Resource being accessed',
            },
            dataClassification: {
              type: 'string',
              enum: ['public', 'internal', 'confidential', 'phi', 'pii', 'pci'],
              description: 'Data classification level',
            },
            userId: {
              type: 'string',
              description: 'User performing the action',
            },
            runnerId: {
              type: 'string',
              description: 'Runner ID (if action performed by bot)',
            },
            metadata: {
              type: 'object',
              description: 'Additional metadata',
              additionalProperties: true,
            },
          },
          required: ['tenantId', 'action', 'resource'],
        },
        requiresApproval: false,
        tags: ['compliance', 'audit', 'logging'],
      },
      {
        name: 'check_compliance_policy',
        description: 'Check if an action is allowed under tenant compliance policies',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            action: {
              type: 'string',
              description: 'Action to check',
            },
            context: {
              type: 'object',
              description: 'Context about the action',
              additionalProperties: true,
            },
          },
          required: ['tenantId', 'action'],
        },
        requiresApproval: false,
        tags: ['compliance', 'policy'],
      },
      {
        name: 'get_compliance_report',
        description: 'Generate compliance report for a time period',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            startDate: {
              type: 'string',
              format: 'date-time',
              description: 'Report start date',
            },
            endDate: {
              type: 'string',
              format: 'date-time',
              description: 'Report end date',
            },
            reportType: {
              type: 'string',
              enum: ['audit', 'classification', 'policy_violations'],
              description: 'Type of report',
            },
          },
          required: ['tenantId', 'startDate', 'endDate'],
        },
        requiresApproval: true,
        tags: ['compliance', 'reporting', 'audit'],
      },
    ];
  }

  /**
   * Get all resources provided by this server
   */
  getResources(): Resource[] {
    return [
      {
        uri: 'compliance://tenant/{tenantId}/policies',
        name: 'Compliance Policies',
        description: 'Tenant-specific compliance policies',
        mimeType: 'application/json',
        tags: ['compliance', 'policies'],
      },
      {
        uri: 'compliance://tenant/{tenantId}/audit-log',
        name: 'Audit Log',
        description: 'Compliance audit log',
        mimeType: 'application/json',
        tags: ['compliance', 'audit'],
      },
      {
        uri: 'compliance://tenant/{tenantId}/classification-rules',
        name: 'Classification Rules',
        description: 'Data classification rules and patterns',
        mimeType: 'application/json',
        tags: ['compliance', 'classification'],
      },
      {
        uri: 'compliance://tenant/{tenantId}/llm-routing-config',
        name: 'LLM Routing Config',
        description: 'LLM routing configuration based on compliance',
        mimeType: 'application/json',
        tags: ['compliance', 'llm'],
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
        case 'classify_data':
          return await this.classifyData(
            toolCall.arguments.tenantId,
            toolCall.arguments.data,
            toolCall.arguments.context,
          );

        case 'route_llm_request':
          return await this.routeLLMRequest(
            toolCall.arguments.tenantId,
            toolCall.arguments.dataClassification,
            toolCall.arguments.preferredRoute,
          );

        case 'redact_sensitive_data':
          return await this.redactSensitiveData(
            toolCall.arguments.data,
            toolCall.arguments.classificationResult,
            toolCall.arguments.redactionLevel,
          );

        case 'log_audit_event':
          return await this.logAuditEvent(toolCall.arguments);

        case 'check_compliance_policy':
          return await this.checkCompliancePolicy(
            toolCall.arguments.tenantId,
            toolCall.arguments.action,
            toolCall.arguments.context,
          );

        case 'get_compliance_report':
          return await this.getComplianceReport(
            toolCall.arguments.tenantId,
            toolCall.arguments.startDate,
            toolCall.arguments.endDate,
            toolCall.arguments.reportType,
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
    // compliance://tenant/{tenantId}/policies
    const policiesMatch = uri.match(/compliance:\/\/tenant\/([^/]+)\/policies/);
    if (policiesMatch) {
      return await this.getTenantPoliciesResource(policiesMatch[1]);
    }

    // compliance://tenant/{tenantId}/audit-log
    const auditMatch = uri.match(/compliance:\/\/tenant\/([^/]+)\/audit-log/);
    if (auditMatch) {
      return await this.getAuditLogResource(auditMatch[1]);
    }

    // compliance://tenant/{tenantId}/classification-rules
    const rulesMatch = uri.match(/compliance:\/\/tenant\/([^/]+)\/classification-rules/);
    if (rulesMatch) {
      return await this.getClassificationRulesResource(rulesMatch[1]);
    }

    // compliance://tenant/{tenantId}/llm-routing-config
    const routingMatch = uri.match(/compliance:\/\/tenant\/([^/]+)\/llm-routing-config/);
    if (routingMatch) {
      return await this.getLLMRoutingConfigResource(routingMatch[1]);
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  }

  // ============================================================
  // Tool Implementations
  // ============================================================

  private async classifyData(
    tenantId: string,
    data: Record<string, any>,
    context?: string,
  ): Promise<ToolResult> {
    const fields: DataField[] = [];
    let highestClassification = DataClassification.PUBLIC;

    // Classify each field
    for (const [key, value] of Object.entries(data)) {
      const field = this.classifyField(key, value);
      fields.push(field);

      // Update highest classification
      const classificationLevel = this.getClassificationLevel(field.classification);
      if (classificationLevel > this.getClassificationLevel(highestClassification)) {
        highestClassification = field.classification;
      }
    }

    const result: ClassificationResult = {
      fields,
      overallClassification: highestClassification,
      requiresPrivateLLM: [DataClassification.PHI, DataClassification.PCI].includes(
        highestClassification,
      ),
      recommendedRoute: this.recommendLLMRoute(highestClassification),
      redactionRequired: highestClassification !== DataClassification.PUBLIC,
    };

    // Log classification event
    await this.logAuditEvent({
      tenantId,
      action: 'classify_data',
      resource: context || 'unknown',
      dataClassification: highestClassification,
      metadata: {
        fieldCount: fields.length,
        highestClassification,
      },
    });

    return {
      success: true,
      result,
    };
  }

  private classifyField(name: string, value: any): DataField {
    const fieldName = name.toLowerCase();
    const fieldValue = String(value || '');

    // PHI patterns
    if (
      /ssn|social.?security|medical.?record|mrn|patient.?id|diagnosis|prescription/.test(fieldName)
    ) {
      return {
        name,
        value: fieldValue,
        classification: DataClassification.PHI,
        confidence: 0.95,
        detectedType: 'PHI',
      };
    }

    // SSN pattern: XXX-XX-XXXX
    if (/^\d{3}-?\d{2}-?\d{4}$/.test(fieldValue)) {
      return {
        name,
        value: fieldValue,
        classification: DataClassification.PHI,
        confidence: 0.99,
        detectedType: 'SSN',
      };
    }

    // PII patterns
    if (/email|phone|address|birth.?date|dob|first.?name|last.?name/.test(fieldName)) {
      return {
        name,
        value: fieldValue,
        classification: DataClassification.PII,
        confidence: 0.9,
        detectedType: 'PII',
      };
    }

    // PCI patterns
    if (/credit.?card|card.?number|cvv|expiry/.test(fieldName)) {
      return {
        name,
        value: fieldValue,
        classification: DataClassification.PCI,
        confidence: 0.95,
        detectedType: 'PCI',
      };
    }

    // Credit card pattern: XXXX-XXXX-XXXX-XXXX
    if (/^\d{4}-?\d{4}-?\d{4}-?\d{4}$/.test(fieldValue)) {
      return {
        name,
        value: fieldValue,
        classification: DataClassification.PCI,
        confidence: 0.99,
        detectedType: 'Credit Card',
      };
    }

    // Default: Internal
    return {
      name,
      value: fieldValue,
      classification: DataClassification.INTERNAL,
      confidence: 0.8,
      detectedType: 'Internal',
    };
  }

  private getClassificationLevel(classification: DataClassification): number {
    const levels = {
      [DataClassification.PUBLIC]: 0,
      [DataClassification.INTERNAL]: 1,
      [DataClassification.CONFIDENTIAL]: 2,
      [DataClassification.PII]: 3,
      [DataClassification.PCI]: 4,
      [DataClassification.PHI]: 5,
    };
    return levels[classification] || 0;
  }

  private recommendLLMRoute(classification: DataClassification): LLMRoute {
    // PHI and PCI must use private or local LLM
    if ([DataClassification.PHI, DataClassification.PCI].includes(classification)) {
      return LLMRoute.PRIVATE;
    }

    // PII should use private, but can use cloud with proper consent
    if (classification === DataClassification.PII) {
      return LLMRoute.PRIVATE;
    }

    // Others can use cloud
    return LLMRoute.CLOUD;
  }

  private async routeLLMRequest(
    tenantId: string,
    dataClassification: string,
    preferredRoute?: string,
  ): Promise<ToolResult> {
    const classification = dataClassification as DataClassification;
    const recommended = this.recommendLLMRoute(classification);

    // Get tenant policies
    const policies = await this.getTenantPolicies(tenantId);

    // Check if preferred route is allowed
    let actualRoute = recommended;
    if (preferredRoute && policies.allowedLLMRoutes.includes(preferredRoute as LLMRoute)) {
      // Only allow if it's as secure or more secure than recommended
      const preferredLevel = this.getLLMRouteSecurityLevel(preferredRoute as LLMRoute);
      const recommendedLevel = this.getLLMRouteSecurityLevel(recommended);

      if (preferredLevel >= recommendedLevel) {
        actualRoute = preferredRoute as LLMRoute;
      }
    }

    // Log routing decision
    await this.logAuditEvent({
      tenantId,
      action: 'route_llm',
      resource: 'llm_routing',
      dataClassification: classification,
      metadata: {
        recommendedRoute: recommended,
        preferredRoute,
        actualRoute,
      },
    });

    return {
      success: true,
      result: {
        route: actualRoute,
        dataClassification: classification,
        explanation: this.getRoutingExplanation(classification, actualRoute),
      },
    };
  }

  private getLLMRouteSecurityLevel(route: LLMRoute): number {
    const levels = {
      [LLMRoute.CLOUD]: 0,
      [LLMRoute.PRIVATE]: 1,
      [LLMRoute.LOCAL]: 2,
    };
    return levels[route] || 0;
  }

  private getRoutingExplanation(classification: DataClassification, route: LLMRoute): string {
    if (classification === DataClassification.PHI) {
      return `PHI detected. Using ${route} LLM to maintain HIPAA compliance.`;
    }
    if (classification === DataClassification.PCI) {
      return `PCI data detected. Using ${route} LLM to maintain PCI-DSS compliance.`;
    }
    if (classification === DataClassification.PII) {
      return `PII detected. Using ${route} LLM to protect personal information.`;
    }
    return `Data classification: ${classification}. Using ${route} LLM.`;
  }

  private async redactSensitiveData(
    data: Record<string, any>,
    classificationResult?: ClassificationResult,
    redactionLevel: string = 'partial',
  ): Promise<ToolResult> {
    const redacted: Record<string, any> = {};

    // If no classification result, classify now
    let classification = classificationResult;
    if (!classification) {
      const classifyResult = await this.classifyData('unknown', data);
      classification = classifyResult.result as ClassificationResult;
    }

    // Redact each field based on classification
    for (const field of classification.fields) {
      if (
        [DataClassification.PHI, DataClassification.PII, DataClassification.PCI].includes(
          field.classification,
        )
      ) {
        redacted[field.name] = this.redactValue(field.value, redactionLevel);
      } else {
        redacted[field.name] = field.value;
      }
    }

    return {
      success: true,
      result: {
        redacted,
        originalFieldCount: Object.keys(data).length,
        redactedFieldCount: classification.fields.filter((f) =>
          [DataClassification.PHI, DataClassification.PII, DataClassification.PCI].includes(
            f.classification,
          ),
        ).length,
      },
    };
  }

  private redactValue(value: string, level: string): string {
    if (level === 'full') {
      return '***REDACTED***';
    }

    // Partial: show last 4 characters
    if (value.length <= 4) {
      return '***';
    }
    return '***' + value.slice(-4);
  }

  private async logAuditEvent(event: Partial<AuditLogEntry>): Promise<ToolResult> {
    const auditEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      tenantId: event.tenantId || 'unknown',
      userId: event.userId,
      runnerId: event.runnerId,
      action: event.action || 'unknown',
      resource: event.resource || 'unknown',
      dataClassification: event.dataClassification,
      success: event.success !== false,
      metadata: event.metadata,
    };

    this.auditLog.push(auditEntry);

    // TODO: Persist to database
    // await this.auditLogRepository.create(auditEntry);

    return {
      success: true,
      result: {
        logged: true,
        timestamp: auditEntry.timestamp,
      },
    };
  }

  private async checkCompliancePolicy(
    tenantId: string,
    action: string,
    context: Record<string, any>,
  ): Promise<ToolResult> {
    const policies = await this.getTenantPolicies(tenantId);

    // Check various policy rules
    let allowed = true;
    const violations: string[] = [];

    // Example: Check external integrations
    if (action === 'external_api_call' && !policies.allowExternalIntegrations) {
      allowed = false;
      violations.push('External integrations are not allowed for this tenant');
    }

    return {
      success: true,
      result: {
        allowed,
        violations,
        policies: policies,
      },
    };
  }

  private async getComplianceReport(
    tenantId: string,
    startDate: string,
    endDate: string,
    reportType?: string,
  ): Promise<ToolResult> {
    // Filter audit log
    const logs = this.auditLog.filter((entry) => {
      return (
        entry.tenantId === tenantId && entry.timestamp >= startDate && entry.timestamp <= endDate
      );
    });

    // Generate report
    const report = {
      tenantId,
      period: { start: startDate, end: endDate },
      reportType: reportType || 'audit',
      generatedAt: new Date().toISOString(),
      summary: {
        totalEvents: logs.length,
        byClassification: this.groupByClassification(logs),
        byAction: this.groupByAction(logs),
      },
      logs: logs.slice(0, 1000), // Limit to 1000 entries
    };

    return {
      success: true,
      result: report,
    };
  }

  private groupByClassification(logs: AuditLogEntry[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    for (const log of logs) {
      const classification = log.dataClassification || 'unknown';
      grouped[classification] = (grouped[classification] || 0) + 1;
    }
    return grouped;
  }

  private groupByAction(logs: AuditLogEntry[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    for (const log of logs) {
      grouped[log.action] = (grouped[log.action] || 0) + 1;
    }
    return grouped;
  }

  // ============================================================
  // Resource Implementations
  // ============================================================

  private async getTenantPoliciesResource(tenantId: string): Promise<ResourceContent> {
    const policies = await this.getTenantPolicies(tenantId);

    return {
      uri: `compliance://tenant/${tenantId}/policies`,
      content: JSON.stringify(policies, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getAuditLogResource(tenantId: string): Promise<ResourceContent> {
    const logs = this.auditLog.filter((entry) => entry.tenantId === tenantId);

    return {
      uri: `compliance://tenant/${tenantId}/audit-log`,
      content: JSON.stringify({ logs: logs.slice(-100) }, null, 2), // Last 100 entries
      mimeType: 'application/json',
    };
  }

  private async getClassificationRulesResource(tenantId: string): Promise<ResourceContent> {
    // TODO: Get tenant-specific rules from database
    const rules = {
      phi: ['ssn', 'mrn', 'medical_record', 'patient_id', 'diagnosis'],
      pii: ['email', 'phone', 'address', 'birth_date', 'dob'],
      pci: ['credit_card', 'card_number', 'cvv', 'expiry'],
    };

    return {
      uri: `compliance://tenant/${tenantId}/classification-rules`,
      content: JSON.stringify(rules, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getLLMRoutingConfigResource(tenantId: string): Promise<ResourceContent> {
    const policies = await this.getTenantPolicies(tenantId);

    const config = {
      allowedRoutes: policies.allowedLLMRoutes,
      routingRules: {
        phi: LLMRoute.PRIVATE,
        pci: LLMRoute.PRIVATE,
        pii: LLMRoute.PRIVATE,
        confidential: LLMRoute.CLOUD,
        internal: LLMRoute.CLOUD,
        public: LLMRoute.CLOUD,
      },
    };

    return {
      uri: `compliance://tenant/${tenantId}/llm-routing-config`,
      content: JSON.stringify(config, null, 2),
      mimeType: 'application/json',
    };
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  private async getTenantPolicies(tenantId: string): Promise<any> {
    // TODO: Get from database
    return {
      tenantId,
      dataResidency: 'US',
      allowedLLMRoutes: [LLMRoute.PRIVATE, LLMRoute.LOCAL],
      maxDataRetentionDays: 2555, // 7 years for HIPAA
      requireMFA: true,
      allowExternalIntegrations: false,
      customRules: {},
    };
  }
}
