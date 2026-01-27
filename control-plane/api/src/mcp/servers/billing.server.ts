import { Injectable } from '@nestjs/common';
import { Tool, Resource, ToolResult, ResourceContent } from '../types/mcp.types';

/**
 * Billing MCP Server
 * 
 * Calculates invoices and manages billing cycles.
 * Integrates with Metering Server for usage data.
 */
@Injectable()
export class BillingServer {
  /**
   * Get all tools provided by this server
   */
  getTools(): Tool[] {
    return [
      {
        name: 'calculate_invoice',
        description: 'Calculate invoice for a tenant for a specific period',
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
        requiresApproval: false,
        tags: ['billing', 'invoice'],
      },
      {
        name: 'get_invoice',
        description: 'Get an existing invoice',
        inputSchema: {
          type: 'object',
          properties: {
            invoiceId: {
              type: 'string',
              description: 'Invoice ID',
            },
          },
          required: ['invoiceId'],
        },
        requiresApproval: false,
        tags: ['billing', 'invoice'],
      },
      {
        name: 'list_invoices',
        description: 'List all invoices for a tenant',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            limit: {
              type: 'number',
              default: 12,
              description: 'Number of invoices to return',
            },
          },
          required: ['tenantId'],
        },
        requiresApproval: false,
        tags: ['billing', 'invoice'],
      },
    ];
  }

  /**
   * Get all resources provided by this server
   */
  getResources(): Resource[] {
    return [
      {
        uri: 'billing://tenant/{tenantId}/invoices',
        name: 'Tenant Invoices',
        description: 'All invoices for a tenant',
        mimeType: 'application/json',
        tags: ['billing', 'invoices'],
      },
      {
        uri: 'billing://tenant/{tenantId}/payment-methods',
        name: 'Payment Methods',
        description: 'Payment methods on file',
        mimeType: 'application/json',
        tags: ['billing', 'payment'],
      },
      {
        uri: 'billing://invoices/{invoiceId}',
        name: 'Invoice Details',
        description: 'Detailed invoice information',
        mimeType: 'application/json',
        tags: ['billing', 'invoice'],
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
        case 'calculate_invoice':
          return await this.calculateInvoice(
            toolCall.arguments.tenantId,
            toolCall.arguments.period,
          );

        case 'get_invoice':
          return await this.getInvoice(toolCall.arguments.invoiceId);

        case 'list_invoices':
          return await this.listInvoices(
            toolCall.arguments.tenantId,
            toolCall.arguments.limit,
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
    // billing://tenant/{tenantId}/invoices
    const invoicesMatch = uri.match(/billing:\/\/tenant\/([^/]+)\/invoices/);
    if (invoicesMatch) {
      return await this.getTenantInvoicesResource(invoicesMatch[1]);
    }

    // billing://tenant/{tenantId}/payment-methods
    const paymentMatch = uri.match(
      /billing:\/\/tenant\/([^/]+)\/payment-methods/,
    );
    if (paymentMatch) {
      return await this.getPaymentMethodsResource(paymentMatch[1]);
    }

    // billing://invoices/{invoiceId}
    const invoiceMatch = uri.match(/billing:\/\/invoices\/([^/]+)/);
    if (invoiceMatch) {
      return await this.getInvoiceResource(invoiceMatch[1]);
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  }

  // ============================================================
  // Tool Implementations
  // ============================================================

  private async calculateInvoice(
    tenantId: string,
    period: string,
  ): Promise<ToolResult> {
    // TODO: Get actual data from Metering Server and database
    // For now, return mock invoice calculation

    const invoice = {
      invoiceId: `inv-${period}-${tenantId}`,
      tenantId,
      period,
      generatedAt: new Date().toISOString(),
      dueDate: this.calculateDueDate(period),
      status: 'pending',

      // Line items
      items: [
        {
          category: 'orchestrator_license',
          description: 'Orchestrator License - Professional',
          quantity: 1,
          unitPrice: 500.0,
          total: 500.0,
        },
        {
          category: 'studio_licenses',
          description: 'Studio Licenses - Pro',
          quantity: 3,
          unitPrice: 100.0,
          total: 300.0,
        },
        {
          category: 'runners',
          description: 'Runners (2 attended, 5 unattended)',
          details: {
            attended: { count: 2, rate: 50, subtotal: 100 },
            unattended: { count: 5, rate: 200, subtotal: 1000 },
          },
          quantity: 7,
          unitPrice: null,
          total: 1100.0,
        },
        {
          category: 'marketplace_bots',
          description: 'Marketplace Bots',
          details: [
            {
              botId: 'fnol-bot-v1',
              botName: 'FNOL Automation Bot',
              usage: {
                claimsCompleted: 320,
                apiCalls: 4500,
              },
              costs: {
                usageBased: 960.0, // 320 × $3
                callBased: 3375.0, // 4500 × $0.75
                monthlyMinimum: 4000.0,
                charged: 4000.0, // max(960, 3375, 4000)
              },
              pricingModel: 'hybrid',
              explanation:
                'Charged $4,000 (monthly minimum) as it is greater than usage-based ($960) and call-based ($3,375)',
            },
            {
              botId: 'claims-processor-v1',
              botName: 'Claims Processor Bot',
              usage: {
                recordsProcessed: 1200,
              },
              costs: {
                usageBased: 600.0, // 1200 × $0.50
                monthlyMinimum: 500.0,
                charged: 600.0, // max(600, 500)
              },
              pricingModel: 'hybrid',
              explanation:
                'Charged $600 (usage-based) as it is greater than monthly minimum ($500)',
            },
          ],
          quantity: 2,
          unitPrice: null,
          total: 4600.0,
        },
      ],

      // Totals
      subtotal: 6500.0,
      tax: 650.0, // 10%
      total: 7150.0,
      currency: 'USD',
    };

    return {
      success: true,
      result: invoice,
    };
  }

  private async getInvoice(invoiceId: string): Promise<ToolResult> {
    // TODO: Get from database
    return {
      success: true,
      result: {
        invoiceId,
        status: 'paid',
        paidAt: '2026-01-15T10:30:00Z',
        message: 'Invoice retrieved successfully',
      },
    };
  }

  private async listInvoices(
    tenantId: string,
    limit: number = 12,
  ): Promise<ToolResult> {
    // TODO: Get from database
    const invoices = [
      {
        invoiceId: 'inv-2026-01-' + tenantId,
        period: '2026-01',
        total: 7150.0,
        status: 'pending',
        dueDate: '2026-02-15',
      },
      {
        invoiceId: 'inv-2025-12-' + tenantId,
        period: '2025-12',
        total: 6800.0,
        status: 'paid',
        paidAt: '2025-12-20T10:30:00Z',
      },
    ];

    return {
      success: true,
      result: {
        invoices: invoices.slice(0, limit),
        total: invoices.length,
      },
    };
  }

  // ============================================================
  // Resource Implementations
  // ============================================================

  private async getTenantInvoicesResource(
    tenantId: string,
  ): Promise<ResourceContent> {
    const invoices = await this.listInvoices(tenantId, 100);

    return {
      uri: `billing://tenant/${tenantId}/invoices`,
      content: JSON.stringify(invoices.result, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getPaymentMethodsResource(
    tenantId: string,
  ): Promise<ResourceContent> {
    // TODO: Get from database
    const paymentMethods = [
      {
        id: 'pm-1',
        type: 'card',
        last4: '4242',
        brand: 'visa',
        expiryMonth: 12,
        expiryYear: 2026,
        isDefault: true,
      },
    ];

    return {
      uri: `billing://tenant/${tenantId}/payment-methods`,
      content: JSON.stringify(paymentMethods, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getInvoiceResource(invoiceId: string): Promise<ResourceContent> {
    const invoice = await this.getInvoice(invoiceId);

    return {
      uri: `billing://invoices/${invoiceId}`,
      content: JSON.stringify(invoice.result, null, 2),
      mimeType: 'application/json',
    };
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  private calculateDueDate(period: string): string {
    // Due date is 15th of next month
    const [year, month] = period.split('-').map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-15`;
  }
}

