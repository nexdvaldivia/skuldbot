import { Injectable, Inject } from '@nestjs/common';
import { Tool, Resource, ToolResult, ResourceContent } from '../types/mcp.types';
import { BillingService } from '../../billing/billing.service';
import { SubscriptionService } from '../../billing/subscription.service';
import { PAYMENT_PROVIDER } from '../../integrations/payment/payment.module';
import { PaymentProvider } from '../../common/interfaces/integration.interface';
import { PaymentHistory } from '../../billing/entities/subscription.entity';

type InvoiceStatus = 'pending' | 'paid' | 'past_due' | 'unpaid';

type InvoiceLineItem = {
  category: string;
  description: string;
  quantity: number;
  unitPrice: number | null;
  total: number;
};

type InvoiceSnapshot = {
  invoiceId: string;
  tenantId: string;
  period: string;
  generatedAt: string;
  dueDate: string;
  status: InvoiceStatus;
  items: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  paidAt?: string;
  stripeInvoiceId?: string | null;
};

/**
 * Billing MCP Server
 *
 * Calculates invoices and manages billing cycles.
 * Integrates with BillingService and Stripe for real payments.
 */
@Injectable()
export class BillingServer {
  constructor(
    private readonly billingService: BillingService,
    private readonly subscriptionService: SubscriptionService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {}
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
        name: 'process_payment',
        description: 'Process a one-time payment via Stripe',
        inputSchema: {
          type: 'object',
          properties: {
            customerId: {
              type: 'string',
              description: 'Stripe Customer ID',
            },
            amount: {
              type: 'number',
              description: 'Amount in USD',
            },
            description: {
              type: 'string',
              description: 'Payment description',
            },
          },
          required: ['customerId', 'amount'],
        },
        requiresApproval: true,
        tags: ['billing', 'payment', 'stripe'],
      },
      {
        name: 'create_stripe_customer',
        description: 'Create a new Stripe customer',
        inputSchema: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              description: 'Customer email',
            },
            name: {
              type: 'string',
              description: 'Customer name',
            },
            metadata: {
              type: 'object',
              description: 'Additional metadata',
            },
          },
          required: ['email', 'name'],
        },
        requiresApproval: false,
        tags: ['billing', 'customer', 'stripe'],
      },
      {
        name: 'create_subscription',
        description: 'Create a Stripe subscription for a customer',
        inputSchema: {
          type: 'object',
          properties: {
            customerId: {
              type: 'string',
              description: 'Stripe Customer ID',
            },
            priceId: {
              type: 'string',
              description: 'Stripe Price ID',
            },
            trialDays: {
              type: 'number',
              description: 'Trial period in days (optional)',
            },
          },
          required: ['customerId', 'priceId'],
        },
        requiresApproval: false,
        tags: ['billing', 'subscription', 'stripe'],
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

        case 'process_payment':
          return await this.processPayment(
            toolCall.arguments.customerId,
            toolCall.arguments.amount,
            toolCall.arguments.description,
          );

        case 'create_stripe_customer':
          return await this.createStripeCustomer(
            toolCall.arguments.email,
            toolCall.arguments.name,
            toolCall.arguments.metadata,
          );

        case 'create_subscription':
          return await this.createSubscription(
            toolCall.arguments.customerId,
            toolCall.arguments.priceId,
            toolCall.arguments.trialDays,
          );

        case 'get_invoice':
          return await this.getInvoice(toolCall.arguments.invoiceId);

        case 'list_invoices':
          return await this.listInvoices(toolCall.arguments.tenantId, toolCall.arguments.limit);

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
    const paymentMatch = uri.match(/billing:\/\/tenant\/([^/]+)\/payment-methods/);
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

  private async processPayment(
    customerId: string,
    amount: number,
    description?: string,
  ): Promise<ToolResult> {
    try {
      const paymentIntent = await this.paymentProvider.createPaymentIntent({
        customerId,
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        metadata: {
          description: description || 'SkuldBot payment',
          source: 'mcp_billing_server',
        },
      });

      return {
        success: true,
        result: {
          paymentIntentId: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount / 100, // Convert back to dollars
          currency: paymentIntent.currency,
          clientSecret: paymentIntent.clientSecret,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Stripe payment failed: ${error.message}`,
      };
    }
  }

  private async createStripeCustomer(
    email: string,
    name: string,
    metadata?: Record<string, string>,
  ): Promise<ToolResult> {
    try {
      const customer = await this.paymentProvider.createCustomer({
        email,
        name,
        metadata: metadata || {},
      });

      return {
        success: true,
        result: {
          customerId: customer.id,
          email: customer.email,
          name: customer.name,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create Stripe customer: ${error.message}`,
      };
    }
  }

  private async createSubscription(
    customerId: string,
    priceId: string,
    trialDays?: number,
  ): Promise<ToolResult> {
    try {
      const subscription = await this.paymentProvider.createSubscription({
        customerId,
        priceId,
        trialDays,
        metadata: {
          source: 'mcp_billing_server',
        },
      });

      return {
        success: true,
        result: {
          subscriptionId: subscription.id,
          status: subscription.status,
          customerId: subscription.customerId,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create subscription: ${error.message}`,
      };
    }
  }

  private async calculateInvoice(tenantId: string, period: string): Promise<ToolResult> {
    this.assertPeriod(period);

    const usageSummary = await this.billingService.getTenantUsageSummary(tenantId, period);
    const subscription = await this.subscriptionService.getSubscription(tenantId);
    const paymentHistory = await this.subscriptionService.getPaymentHistory(tenantId, 100);
    const periodPayments = this.getPeriodPayments(paymentHistory, period);

    const items: InvoiceLineItem[] = [];
    for (const [metric, usage] of Object.entries(usageSummary.metrics)) {
      const quantity = Number(usage.quantity ?? 0);
      const total = Number(usage.amount ?? 0);
      const unitPrice = quantity > 0 && total > 0 ? total / quantity : null;
      items.push({
        category: `usage:${metric}`,
        description: `Usage metric ${metric}`,
        quantity,
        unitPrice,
        total,
      });
    }

    if (subscription?.monthlyAmount && Number(subscription.monthlyAmount) > 0) {
      const monthlyAmount = Number(subscription.monthlyAmount);
      items.push({
        category: 'subscription_base',
        description: 'Subscription base amount',
        quantity: 1,
        unitPrice: monthlyAmount,
        total: monthlyAmount,
      });
    }

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const tax = 0;
    const total = subtotal + tax;

    const status = this.resolveInvoiceStatus(periodPayments);
    const paidAt =
      periodPayments.find((payment) => payment.status === 'succeeded')?.clearedAt ??
      periodPayments.find((payment) => payment.status === 'succeeded')?.createdAt;

    const stripeInvoiceId =
      periodPayments.find((payment) => payment.stripeInvoiceId)?.stripeInvoiceId ?? null;

    const invoice: InvoiceSnapshot = {
      invoiceId: this.buildInvoiceId(tenantId, period),
      tenantId,
      period,
      generatedAt: new Date().toISOString(),
      dueDate: this.calculateDueDate(period),
      status,
      items,
      subtotal,
      tax,
      total,
      currency: subscription?.currency ?? 'USD',
      paidAt: paidAt ? paidAt.toISOString() : undefined,
      stripeInvoiceId,
    };

    return {
      success: true,
      result: invoice,
    };
  }

  private async getInvoice(invoiceId: string): Promise<ToolResult> {
    const parsed = this.parseInvoiceId(invoiceId);

    if (parsed) {
      const calculated = await this.calculateInvoice(parsed.tenantId, parsed.period);
      return {
        success: true,
        result: {
          ...calculated.result,
          invoiceId,
        },
      };
    }

    throw new Error(`Invoice "${invoiceId}" is not in MCP-derived format inv-YYYY-MM-<tenantId>.`);
  }

  private async listInvoices(tenantId: string, limit: number = 12): Promise<ToolResult> {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 12;
    const paymentHistory = await this.subscriptionService.getPaymentHistory(tenantId, 500);
    const discoveredPeriods = Array.from(
      new Set(
        paymentHistory
          .map((payment) => payment.invoicePeriod)
          .filter((period): period is string => Boolean(period?.trim())),
      ),
    );

    const currentPeriod = this.getCurrentPeriod();
    if (!discoveredPeriods.includes(currentPeriod)) {
      discoveredPeriods.push(currentPeriod);
    }

    discoveredPeriods.sort((a, b) => b.localeCompare(a));
    const selectedPeriods = discoveredPeriods.slice(0, safeLimit);

    const invoices: InvoiceSnapshot[] = [];
    for (const period of selectedPeriods) {
      const result = await this.calculateInvoice(tenantId, period);
      invoices.push(result.result as InvoiceSnapshot);
    }

    invoices.sort((a, b) => b.period.localeCompare(a.period));

    return {
      success: true,
      result: {
        invoices: invoices.slice(0, safeLimit).map((invoice) => ({
          invoiceId: invoice.invoiceId,
          period: invoice.period,
          total: invoice.total,
          subtotal: invoice.subtotal,
          currency: invoice.currency,
          status: invoice.status,
          dueDate: invoice.dueDate,
          paidAt: invoice.paidAt,
          stripeInvoiceId: invoice.stripeInvoiceId ?? null,
        })),
        total: invoices.length,
      },
    };
  }

  // ============================================================
  // Resource Implementations
  // ============================================================

  private async getTenantInvoicesResource(tenantId: string): Promise<ResourceContent> {
    const invoices = await this.listInvoices(tenantId, 100);

    return {
      uri: `billing://tenant/${tenantId}/invoices`,
      content: JSON.stringify(invoices.result, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getPaymentMethodsResource(tenantId: string): Promise<ResourceContent> {
    const subscription = await this.subscriptionService.getSubscription(tenantId);
    const methods = subscription
      ? [
          {
            id: subscription.stripePaymentMethodId ?? `subscription-${subscription.id}`,
            type: subscription.paymentMethodType,
            currency: subscription.currency,
            bankName: subscription.bankName ?? null,
            bankAccountLast4: subscription.bankAccountLast4 ?? null,
            bankAccountType: subscription.bankAccountType ?? null,
            isDefault: true,
            status: subscription.status,
          },
        ]
      : [];

    return {
      uri: `billing://tenant/${tenantId}/payment-methods`,
      content: JSON.stringify(methods, null, 2),
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

  private assertPeriod(period: string): void {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new Error('Invalid period format. Expected YYYY-MM.');
    }
  }

  private buildInvoiceId(tenantId: string, period: string): string {
    return `inv-${period}-${tenantId}`;
  }

  private parseInvoiceId(invoiceId: string): { period: string; tenantId: string } | null {
    const match = invoiceId.match(/^inv-(\d{4}-(0[1-9]|1[0-2]))-(.+)$/);
    if (!match) {
      return null;
    }
    return {
      period: match[1],
      tenantId: match[3],
    };
  }

  private getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private getPeriodPayments(paymentHistory: PaymentHistory[], period: string): PaymentHistory[] {
    return paymentHistory.filter((payment) => payment.invoicePeriod === period);
  }

  private resolveInvoiceStatus(periodPayments: PaymentHistory[]): InvoiceStatus {
    if (periodPayments.some((payment) => payment.status === 'succeeded')) {
      return 'paid';
    }
    if (periodPayments.some((payment) => payment.status === 'failed')) {
      return 'past_due';
    }
    if (periodPayments.some((payment) => payment.status === 'processing')) {
      return 'pending';
    }
    return 'pending';
  }
}
