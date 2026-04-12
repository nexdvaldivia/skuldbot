import { Injectable } from '@nestjs/common';
import {
  Tool,
  Resource,
  ToolResult,
  ResourceContent,
  WorkflowTemplate,
  TemplateVariable,
} from '../types/mcp.types';

/**
 * Workflow MCP Server
 *
 * Manages tenant-specific workflow templates and bot configurations.
 * Runs in tenant's Orchestrator (their VPC).
 *
 * Capabilities:
 * - Store/retrieve workflow templates
 * - Customize templates with tenant-specific variables
 * - Share templates within tenant org
 * - Clone and modify marketplace bots for tenant use
 */
@Injectable()
export class WorkflowServer {
  // In-memory storage (should be database in production)
  private templates: Map<string, WorkflowTemplate> = new Map();

  constructor() {
    // Seed with some example templates
    this.seedTemplates();
  }

  /**
   * Get all tools provided by this server
   */
  getTools(): Tool[] {
    return [
      {
        name: 'create_workflow_template',
        description: 'Create a new workflow template for this tenant',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            name: {
              type: 'string',
              description: 'Template name',
            },
            description: {
              type: 'string',
              description: 'Template description',
            },
            category: {
              type: 'string',
              description: 'Template category',
            },
            industry: {
              type: 'array',
              items: { type: 'string' },
              description: 'Industries this template is for',
            },
            dsl: {
              type: 'object',
              description: 'Workflow DSL definition',
            },
            variables: {
              type: 'array',
              description: 'Template variables',
              items: { type: 'object' },
            },
            isPublic: {
              type: 'boolean',
              default: false,
              description: 'Whether template is public within tenant org',
            },
          },
          required: ['tenantId', 'name', 'dsl'],
        },
        requiresApproval: false,
        tags: ['workflow', 'template', 'create'],
      },
      {
        name: 'get_workflow_template',
        description: 'Get a specific workflow template',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: {
              type: 'string',
              description: 'Template ID',
            },
          },
          required: ['templateId'],
        },
        requiresApproval: false,
        tags: ['workflow', 'template', 'read'],
      },
      {
        name: 'list_workflow_templates',
        description: 'List workflow templates for a tenant',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            category: {
              type: 'string',
              description: 'Filter by category',
            },
            industry: {
              type: 'string',
              description: 'Filter by industry',
            },
          },
          required: ['tenantId'],
        },
        requiresApproval: false,
        tags: ['workflow', 'template', 'list'],
      },
      {
        name: 'update_workflow_template',
        description: 'Update an existing workflow template',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: {
              type: 'string',
              description: 'Template ID',
            },
            updates: {
              type: 'object',
              description: 'Fields to update',
            },
          },
          required: ['templateId', 'updates'],
        },
        requiresApproval: false,
        tags: ['workflow', 'template', 'update'],
      },
      {
        name: 'delete_workflow_template',
        description: 'Delete a workflow template',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: {
              type: 'string',
              description: 'Template ID',
            },
          },
          required: ['templateId'],
        },
        requiresApproval: true,
        tags: ['workflow', 'template', 'delete'],
      },
      {
        name: 'instantiate_template',
        description: 'Create a workflow instance from a template',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: {
              type: 'string',
              description: 'Template ID',
            },
            variableValues: {
              type: 'object',
              description: 'Values for template variables',
            },
            name: {
              type: 'string',
              description: 'Name for the new workflow instance',
            },
          },
          required: ['templateId', 'variableValues'],
        },
        requiresApproval: false,
        tags: ['workflow', 'template', 'instantiate'],
      },
      {
        name: 'clone_marketplace_bot',
        description: 'Clone a marketplace bot as a tenant-specific template',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            botId: {
              type: 'string',
              description: 'Marketplace bot ID to clone',
            },
            customizations: {
              type: 'object',
              description: 'Customizations to apply',
            },
          },
          required: ['tenantId', 'botId'],
        },
        requiresApproval: false,
        tags: ['workflow', 'marketplace', 'clone'],
      },
    ];
  }

  /**
   * Get all resources provided by this server
   */
  getResources(): Resource[] {
    return [
      {
        uri: 'workflow://tenant/{tenantId}/templates',
        name: 'Workflow Templates',
        description: 'All workflow templates for tenant',
        mimeType: 'application/json',
        tags: ['workflow', 'templates'],
      },
      {
        uri: 'workflow://tenant/{tenantId}/templates/{category}',
        name: 'Templates by Category',
        description: 'Workflow templates filtered by category',
        mimeType: 'application/json',
        tags: ['workflow', 'templates', 'category'],
      },
      {
        uri: 'workflow://templates/{templateId}',
        name: 'Template Details',
        description: 'Detailed template information',
        mimeType: 'application/json',
        tags: ['workflow', 'template'],
      },
      {
        uri: 'workflow://templates/{templateId}/dsl',
        name: 'Template DSL',
        description: 'Template DSL definition',
        mimeType: 'application/json',
        tags: ['workflow', 'template', 'dsl'],
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
        case 'create_workflow_template':
          return await this.createWorkflowTemplate(toolCall.arguments);

        case 'get_workflow_template':
          return await this.getWorkflowTemplate(toolCall.arguments.templateId);

        case 'list_workflow_templates':
          return await this.listWorkflowTemplates(
            toolCall.arguments.tenantId,
            toolCall.arguments.category,
            toolCall.arguments.industry,
          );

        case 'update_workflow_template':
          return await this.updateWorkflowTemplate(
            toolCall.arguments.templateId,
            toolCall.arguments.updates,
          );

        case 'delete_workflow_template':
          return await this.deleteWorkflowTemplate(toolCall.arguments.templateId);

        case 'instantiate_template':
          return await this.instantiateTemplate(
            toolCall.arguments.templateId,
            toolCall.arguments.variableValues,
            toolCall.arguments.name,
          );

        case 'clone_marketplace_bot':
          return await this.cloneMarketplaceBot(
            toolCall.arguments.tenantId,
            toolCall.arguments.botId,
            toolCall.arguments.customizations,
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
    // workflow://tenant/{tenantId}/templates
    const templatesMatch = uri.match(/workflow:\/\/tenant\/([^/]+)\/templates$/);
    if (templatesMatch) {
      return await this.getTenantTemplatesResource(templatesMatch[1]);
    }

    // workflow://tenant/{tenantId}/templates/{category}
    const categoryMatch = uri.match(/workflow:\/\/tenant\/([^/]+)\/templates\/([^/]+)/);
    if (categoryMatch) {
      return await this.getTemplatesByCategoryResource(categoryMatch[1], categoryMatch[2]);
    }

    // workflow://templates/{templateId}
    const templateMatch = uri.match(/workflow:\/\/templates\/([^/]+)$/);
    if (templateMatch) {
      return await this.getTemplateResource(templateMatch[1]);
    }

    // workflow://templates/{templateId}/dsl
    const dslMatch = uri.match(/workflow:\/\/templates\/([^/]+)\/dsl/);
    if (dslMatch) {
      return await this.getTemplateDSLResource(dslMatch[1]);
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  }

  // ============================================================
  // Tool Implementations
  // ============================================================

  private async createWorkflowTemplate(data: Partial<WorkflowTemplate>): Promise<ToolResult> {
    const id = `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const template: WorkflowTemplate = {
      id,
      name: data.name || 'Untitled Template',
      description: data.description || '',
      category: data.category || 'general',
      industry: data.industry || [],
      tenantId: data.tenantId,
      dsl: data.dsl || {},
      variables: data.variables || [],
      tags: data.tags || [],
      isPublic: data.isPublic !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.templates.set(id, template);

    // TODO: Persist to database
    // await this.templateRepository.create(template);

    return {
      success: true,
      result: template,
    };
  }

  private async getWorkflowTemplate(templateId: string): Promise<ToolResult> {
    const template = this.templates.get(templateId);

    if (!template) {
      return {
        success: false,
        error: `Template not found: ${templateId}`,
      };
    }

    return {
      success: true,
      result: template,
    };
  }

  private async listWorkflowTemplates(
    tenantId: string,
    category?: string,
    industry?: string,
  ): Promise<ToolResult> {
    let templates = Array.from(this.templates.values()).filter(
      (t) => t.tenantId === tenantId || !t.tenantId, // Include global templates
    );

    if (category) {
      templates = templates.filter((t) => t.category === category);
    }

    if (industry) {
      templates = templates.filter((t) => t.industry.includes(industry));
    }

    return {
      success: true,
      result: {
        templates,
        total: templates.length,
      },
    };
  }

  private async updateWorkflowTemplate(
    templateId: string,
    updates: Partial<WorkflowTemplate>,
  ): Promise<ToolResult> {
    const template = this.templates.get(templateId);

    if (!template) {
      return {
        success: false,
        error: `Template not found: ${templateId}`,
      };
    }

    const updated = {
      ...template,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.templates.set(templateId, updated);

    // TODO: Persist to database
    // await this.templateRepository.update(templateId, updated);

    return {
      success: true,
      result: updated,
    };
  }

  private async deleteWorkflowTemplate(templateId: string): Promise<ToolResult> {
    const exists = this.templates.has(templateId);

    if (!exists) {
      return {
        success: false,
        error: `Template not found: ${templateId}`,
      };
    }

    this.templates.delete(templateId);

    // TODO: Delete from database
    // await this.templateRepository.delete(templateId);

    return {
      success: true,
      result: {
        deleted: true,
        templateId,
      },
    };
  }

  private async instantiateTemplate(
    templateId: string,
    variableValues: Record<string, any>,
    name?: string,
  ): Promise<ToolResult> {
    const template = this.templates.get(templateId);

    if (!template) {
      return {
        success: false,
        error: `Template not found: ${templateId}`,
      };
    }

    // Validate required variables
    const missingVars = template.variables
      .filter((v) => v.required && !variableValues[v.name])
      .map((v) => v.name);

    if (missingVars.length > 0) {
      return {
        success: false,
        error: `Missing required variables: ${missingVars.join(', ')}`,
      };
    }

    // Clone DSL and replace variables
    const dsl = this.replaceVariables(template.dsl, variableValues);

    const instance = {
      id: `inst-${Date.now()}`,
      name: name || `${template.name} Instance`,
      templateId: template.id,
      dsl,
      variableValues,
      createdAt: new Date().toISOString(),
    };

    return {
      success: true,
      result: instance,
    };
  }

  private replaceVariables(
    dsl: Record<string, any>,
    values: Record<string, any>,
  ): Record<string, any> {
    const json = JSON.stringify(dsl);
    let replaced = json;

    for (const [key, value] of Object.entries(values)) {
      // Replace {{variable}} placeholders
      replaced = replaced.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }

    return JSON.parse(replaced);
  }

  private async cloneMarketplaceBot(
    tenantId: string,
    botId: string,
    customizations?: Record<string, any>,
  ): Promise<ToolResult> {
    void tenantId;
    void botId;
    void customizations;
    throw new Error(
      'clone_marketplace_bot is disabled until marketplace source-of-truth integration is implemented.',
    );
  }

  // ============================================================
  // Resource Implementations
  // ============================================================

  private async getTenantTemplatesResource(tenantId: string): Promise<ResourceContent> {
    const result = await this.listWorkflowTemplates(tenantId);

    return {
      uri: `workflow://tenant/${tenantId}/templates`,
      content: JSON.stringify(result.result, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getTemplatesByCategoryResource(
    tenantId: string,
    category: string,
  ): Promise<ResourceContent> {
    const result = await this.listWorkflowTemplates(tenantId, category);

    return {
      uri: `workflow://tenant/${tenantId}/templates/${category}`,
      content: JSON.stringify(result.result, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getTemplateResource(templateId: string): Promise<ResourceContent> {
    const result = await this.getWorkflowTemplate(templateId);

    return {
      uri: `workflow://templates/${templateId}`,
      content: JSON.stringify(result.result, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getTemplateDSLResource(templateId: string): Promise<ResourceContent> {
    const template = this.templates.get(templateId);

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    return {
      uri: `workflow://templates/${templateId}/dsl`,
      content: JSON.stringify(template.dsl, null, 2),
      mimeType: 'application/json',
    };
  }

  // ============================================================
  // Seed Data
  // ============================================================

  private seedTemplates() {
    // FNOL Workflow Template
    this.templates.set('tpl-fnol-001', {
      id: 'tpl-fnol-001',
      name: 'FNOL Intake Workflow',
      description: 'First Notice of Loss intake and triage',
      category: 'claims',
      industry: ['insurance', 'property-casualty'],
      tenantId: undefined, // Global template
      dsl: {
        version: '1.0.0',
        nodes: [
          {
            id: 'start',
            type: 'trigger',
            config: { trigger_type: 'phone_call' },
          },
          { id: 'classify', type: 'ai_classify', config: {} },
          { id: 'extract', type: 'ai_extract', config: {} },
          { id: 'store', type: 'sql_insert', config: {} },
        ],
      },
      variables: [
        {
          name: 'database_connection',
          type: 'string',
          description: 'Database connection string',
          required: true,
        },
        {
          name: 'notification_email',
          type: 'string',
          description: 'Email for notifications',
          required: false,
          defaultValue: 'claims@company.com',
        },
      ],
      tags: ['fnol', 'claims', 'intake'],
      isPublic: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    // Medical Billing Template
    this.templates.set('tpl-medbill-001', {
      id: 'tpl-medbill-001',
      name: 'Medical Billing Workflow',
      description: 'Automated medical claim submission',
      category: 'healthcare',
      industry: ['healthcare', 'insurance'],
      tenantId: undefined,
      dsl: {
        version: '1.0.0',
        nodes: [
          { id: 'read', type: 'sql_select', config: {} },
          { id: 'validate', type: 'ai_validate', config: {} },
          { id: 'submit', type: 'http_post', config: {} },
        ],
      },
      variables: [
        {
          name: 'payer_api_endpoint',
          type: 'string',
          description: 'Payer API endpoint',
          required: true,
        },
      ],
      tags: ['medical', 'billing', 'claims'],
      isPublic: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
  }
}
