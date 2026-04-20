import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  PaymentProvider,
  IntegrationType,
  CreateCustomerData,
  UpdateCustomerData,
  Customer,
  CreateSubscriptionData,
  UpdateSubscriptionData,
  Subscription,
  SubscriptionStatus,
  CreatePaymentIntentData,
  PaymentIntent,
  WebhookEvent,
  RecordUsageData,
  UsageRecord,
  UsageSummary,
  Invoice,
  InvoiceStatus,
  InvoiceLineItem,
  ListInvoicesOptions,
  CreateConnectedAccountData,
  ConnectedAccount,
  AccountLinkType,
  AccountLink,
  CreateTransferData,
  Transfer,
  ListTransfersOptions,
  UsageLineItem,
} from '../../common/interfaces/integration.interface';

/**
 * StripeProvider - Full Stripe integration for SkuldBot Control-Plane.
 *
 * Supports:
 * - Customer management
 * - Subscriptions (fixed pricing)
 * - Metered billing (usage-based pricing via Stripe Billing Meter)
 * - Invoicing
 * - Stripe Connect (for partner revenue share)
 *
 * @see https://docs.stripe.com/api
 * @see https://docs.stripe.com/billing/subscriptions/usage-based
 * @see https://docs.stripe.com/connect
 */
@Injectable()
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';
  readonly type = IntegrationType.PAYMENT;

  private readonly logger = new Logger(StripeProvider.name);
  private stripe: Stripe | null = null;
  private webhookSecret: string | null = null;
  private connectWebhookSecret: string | null = null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || null;
    this.connectWebhookSecret =
      this.configService.get<string>('STRIPE_CONNECT_WEBHOOK_SECRET') || null;

    if (apiKey) {
      this.stripe = new Stripe(apiKey);
      this.logger.log('Stripe provider initialized');
    } else {
      this.logger.warn('Stripe provider not configured - STRIPE_SECRET_KEY missing');
    }
  }

  isConfigured(): boolean {
    return this.stripe !== null;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.stripe) return false;
    try {
      await this.stripe.balance.retrieve();
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Customer Management
  // ============================================================================

  async createCustomer(data: CreateCustomerData): Promise<Customer> {
    this.ensureConfigured();
    const customer = await this.stripe!.customers.create({
      email: data.email,
      name: data.name,
      metadata: data.metadata,
    });
    return this.mapCustomer(customer);
  }

  async updateCustomer(customerId: string, data: UpdateCustomerData): Promise<Customer> {
    this.ensureConfigured();
    const customer = await this.stripe!.customers.update(customerId, {
      email: data.email,
      name: data.name,
      metadata: data.metadata,
    });
    return this.mapCustomer(customer);
  }

  async deleteCustomer(customerId: string): Promise<void> {
    this.ensureConfigured();
    await this.stripe!.customers.del(customerId);
  }

  async getCustomer(customerId: string): Promise<Customer> {
    this.ensureConfigured();
    const customer = await this.stripe!.customers.retrieve(customerId);
    if (customer.deleted) {
      throw new Error(`Customer ${customerId} has been deleted`);
    }
    return this.mapCustomer(customer as Stripe.Customer);
  }

  // ============================================================================
  // Subscriptions
  // ============================================================================

  async createSubscription(data: CreateSubscriptionData): Promise<Subscription> {
    this.ensureConfigured();

    const subscriptionData: Stripe.SubscriptionCreateParams = {
      customer: data.customerId,
      items: [{ price: data.priceId }],
      metadata: data.metadata,
    };

    if (data.trialDays) {
      subscriptionData.trial_period_days = data.trialDays;
    }

    const subscription = await this.stripe!.subscriptions.create(subscriptionData);
    return this.mapSubscription(subscription);
  }

  async updateSubscription(
    subscriptionId: string,
    data: UpdateSubscriptionData,
  ): Promise<Subscription> {
    this.ensureConfigured();
    const subscription = await this.stripe!.subscriptions.retrieve(subscriptionId);

    const updateData: Stripe.SubscriptionUpdateParams = {
      metadata: data.metadata,
    };

    if (data.priceId) {
      updateData.items = [
        {
          id: subscription.items.data[0].id,
          price: data.priceId,
        },
      ];
    }

    const updated = await this.stripe!.subscriptions.update(subscriptionId, updateData);
    return this.mapSubscription(updated);
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    this.ensureConfigured();
    await this.stripe!.subscriptions.cancel(subscriptionId);
  }

  async getSubscription(subscriptionId: string): Promise<Subscription> {
    this.ensureConfigured();
    const subscription = await this.stripe!.subscriptions.retrieve(subscriptionId);
    return this.mapSubscription(subscription);
  }

  // ============================================================================
  // Payment Intents
  // ============================================================================

  async createPaymentIntent(data: CreatePaymentIntentData): Promise<PaymentIntent> {
    this.ensureConfigured();
    const intent = await this.stripe!.paymentIntents.create({
      amount: data.amount,
      currency: data.currency,
      customer: data.customerId,
      metadata: data.metadata,
    });
    return {
      id: intent.id,
      amount: intent.amount,
      currency: intent.currency,
      status: intent.status,
      clientSecret: intent.client_secret!,
    };
  }

  // ============================================================================
  // Metered Billing (Usage-Based)
  // ============================================================================

  /**
   * Record usage for metered billing.
   * Uses Stripe Billing Meter API for usage-based pricing.
   *
   * @see https://docs.stripe.com/billing/subscriptions/usage-based/implementation-guide
   */
  async recordUsage(data: RecordUsageData): Promise<UsageRecord> {
    this.ensureConfigured();

    // Use Billing Meter if meterId is provided (new API)
    if (data.meterId) {
      const meterEvent = await this.stripe!.billing.meterEvents.create({
        event_name: data.meterId,
        payload: {
          stripe_customer_id: data.subscriptionId,
          value: String(data.quantity),
        },
        timestamp: data.timestamp ? Math.floor(data.timestamp.getTime() / 1000) : undefined,
      });

      return {
        id: meterEvent.identifier,
        subscriptionItemId: data.subscriptionItemId || '',
        quantity: data.quantity,
        timestamp: new Date(meterEvent.created * 1000),
        action: 'increment',
      };
    }

    // For legacy usage records, we need to use meter events
    // Stripe v20+ removed createUsageRecord, use meterEvents instead
    if (!data.subscriptionItemId) {
      throw new Error('Either meterId or subscriptionItemId is required for usage recording');
    }

    // Create a meter event as fallback
    const meterEvent = await this.stripe!.billing.meterEvents.create({
      event_name: `usage_${data.subscriptionItemId}`,
      payload: {
        stripe_customer_id: data.subscriptionId,
        value: String(data.quantity),
      },
      timestamp: data.timestamp ? Math.floor(data.timestamp.getTime() / 1000) : undefined,
    });

    return {
      id: meterEvent.identifier,
      subscriptionItemId: data.subscriptionItemId,
      quantity: data.quantity,
      timestamp: new Date(meterEvent.created * 1000),
      action: data.action || 'increment',
    };
  }

  /**
   * Get usage summary for a subscription.
   */
  async getUsageSummary(subscriptionId: string, meterId?: string): Promise<UsageSummary> {
    this.ensureConfigured();

    const subscription = await this.stripe!.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    });

    // Get upcoming invoice to see calculated usage
    const upcomingInvoice = await this.stripe!.invoices.createPreview({
      subscription: subscriptionId,
    });

    const usageLineItems: UsageLineItem[] = upcomingInvoice.lines.data.map(
      (line: Stripe.InvoiceLineItem) => ({
        description: line.description || '',
        quantity: line.quantity || 0,
        unitAmount: line.amount && line.quantity ? Math.floor(line.amount / line.quantity) : 0,
        amount: line.amount,
      }),
    );

    return {
      subscriptionId,
      meterId,
      totalUsage: usageLineItems.reduce(
        (sum: number, item: UsageLineItem) => sum + item.quantity,
        0,
      ),
      periodStart: new Date(subscription.items.data[0]?.created * 1000 || Date.now()),
      periodEnd: new Date(
        (subscription.items.data[0]?.created || Math.floor(Date.now() / 1000)) * 1000 +
          30 * 24 * 60 * 60 * 1000,
      ),
      lineItems: usageLineItems,
    };
  }

  // ============================================================================
  // Invoicing
  // ============================================================================

  async getInvoice(invoiceId: string): Promise<Invoice> {
    this.ensureConfigured();
    const invoice = await this.stripe!.invoices.retrieve(invoiceId, {
      expand: ['lines.data'],
    });
    return this.mapInvoice(invoice);
  }

  async listInvoices(customerId: string, options?: ListInvoicesOptions): Promise<Invoice[]> {
    this.ensureConfigured();

    const params: Stripe.InvoiceListParams = {
      customer: customerId,
      limit: options?.limit || 10,
    };

    if (options?.startingAfter) {
      params.starting_after = options.startingAfter;
    }

    if (options?.status) {
      params.status = options.status as Stripe.InvoiceListParams.Status;
    }

    const invoices = await this.stripe!.invoices.list(params);
    return invoices.data.map((inv) => this.mapInvoice(inv));
  }

  async getUpcomingInvoice(customerId: string): Promise<Invoice | null> {
    this.ensureConfigured();

    try {
      const invoice = await this.stripe!.invoices.createPreview({
        customer: customerId,
      });
      return this.mapInvoice(invoice);
    } catch (error) {
      if ((error as { code?: string }).code === 'invoice_upcoming_none') {
        return null;
      }
      throw error;
    }
  }

  // ============================================================================
  // Stripe Connect (Revenue Share with Partners)
  // ============================================================================

  /**
   * Create a connected account for a partner.
   * Partners use this to receive revenue share payouts.
   *
   * @see https://docs.stripe.com/connect/express-accounts
   */
  async createConnectedAccount(data: CreateConnectedAccountData): Promise<ConnectedAccount> {
    this.ensureConfigured();

    const account = await this.stripe!.accounts.create({
      type: data.type || 'express',
      country: data.country,
      email: data.email,
      business_type: data.businessType,
      metadata: data.metadata,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    return this.mapConnectedAccount(account);
  }

  /**
   * Get a connected account by ID.
   */
  async getConnectedAccount(accountId: string): Promise<ConnectedAccount> {
    this.ensureConfigured();
    const account = await this.stripe!.accounts.retrieve(accountId);
    return this.mapConnectedAccount(account);
  }

  /**
   * Create an account link for onboarding or updating a connected account.
   * Returns a URL where the partner can complete their Stripe onboarding.
   */
  async createAccountLink(accountId: string, type: AccountLinkType): Promise<AccountLink> {
    this.ensureConfigured();

    const refreshUrl = this.configService.get<string>('STRIPE_CONNECT_REFRESH_URL') || '';
    const returnUrl = this.configService.get<string>('STRIPE_CONNECT_RETURN_URL') || '';

    const accountLink = await this.stripe!.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: type,
    });

    return {
      url: accountLink.url,
      expiresAt: new Date(accountLink.expires_at * 1000),
    };
  }

  /**
   * Create a transfer to a connected account (partner payout).
   * Used for revenue share after Skuld takes its commission.
   *
   * Example: Customer pays $5000, Skuld takes 20% ($1000), partner gets $4000.
   */
  async createTransfer(data: CreateTransferData): Promise<Transfer> {
    this.ensureConfigured();

    const transfer = await this.stripe!.transfers.create({
      amount: data.amount,
      currency: data.currency,
      destination: data.destinationAccountId,
      description: data.description,
      source_transaction: data.sourceTransactionId,
      metadata: data.metadata,
    });

    return {
      id: transfer.id,
      amount: transfer.amount,
      currency: transfer.currency,
      destinationAccountId:
        typeof transfer.destination === 'string'
          ? transfer.destination
          : transfer.destination?.id || '',
      description: transfer.description || undefined,
      created: new Date(transfer.created * 1000),
      reversed: transfer.reversed,
      metadata: transfer.metadata as Record<string, string>,
    };
  }

  /**
   * List transfers to a connected account.
   */
  async listTransfers(
    connectedAccountId: string,
    options?: ListTransfersOptions,
  ): Promise<Transfer[]> {
    this.ensureConfigured();

    const transfers = await this.stripe!.transfers.list({
      destination: connectedAccountId,
      limit: options?.limit || 10,
      starting_after: options?.startingAfter,
    });

    return transfers.data.map((t) => ({
      id: t.id,
      amount: t.amount,
      currency: t.currency,
      destinationAccountId:
        typeof t.destination === 'string' ? t.destination : t.destination?.id || '',
      description: t.description || undefined,
      created: new Date(t.created * 1000),
      reversed: t.reversed,
      metadata: t.metadata as Record<string, string>,
    }));
  }

  // ============================================================================
  // Webhooks
  // ============================================================================

  /**
   * Handle incoming Stripe webhook.
   * Validates signature and returns parsed event.
   */
  async handleWebhook(payload: Buffer, signature: string): Promise<WebhookEvent> {
    this.ensureConfigured();
    if (!this.webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    const event = this.stripe!.webhooks.constructEvent(payload, signature, this.webhookSecret);

    return {
      type: event.type,
      data: event.data.object as unknown as Record<string, unknown>,
    };
  }

  /**
   * Handle incoming Stripe Connect webhook.
   * For events related to connected accounts.
   */
  async handleConnectWebhook(payload: Buffer, signature: string): Promise<WebhookEvent> {
    this.ensureConfigured();
    if (!this.connectWebhookSecret) {
      throw new Error('Connect webhook secret not configured');
    }

    const event = this.stripe!.webhooks.constructEvent(
      payload,
      signature,
      this.connectWebhookSecret,
    );

    return {
      type: event.type,
      data: event.data.object as unknown as Record<string, unknown>,
    };
  }

  // ============================================================================
  // ACH Direct Debit (US Bank Account)
  // ============================================================================

  /**
   * Setup ACH Direct Debit for a customer.
   * Creates a SetupIntent for collecting US bank account info.
   *
   * Flow:
   * 1. Create SetupIntent with 'us_bank_account' payment method type
   * 2. Frontend collects bank info via Stripe.js
   * 3. Stripe verifies the account (instant or micro-deposits)
   * 4. Bank account becomes default payment method
   *
   * @see https://docs.stripe.com/payments/ach-debit/set-up-payment
   */
  async createACHSetupIntent(
    customerId: string,
    metadata?: Record<string, string>,
  ): Promise<{
    clientSecret: string;
    setupIntentId: string;
  }> {
    this.ensureConfigured();

    const setupIntent = await this.stripe!.setupIntents.create({
      customer: customerId,
      payment_method_types: ['us_bank_account'],
      payment_method_options: {
        us_bank_account: {
          financial_connections: {
            permissions: ['payment_method', 'balances'],
          },
          verification_method: 'automatic', // or 'instant' for instant verification
        },
      },
      metadata,
    });

    return {
      clientSecret: setupIntent.client_secret!,
      setupIntentId: setupIntent.id,
    };
  }

  /**
   * Get bank account info for a customer (masked).
   * Returns last 4 digits and bank name for display.
   */
  async getCustomerBankAccount(customerId: string): Promise<{
    id: string;
    bankName: string;
    last4: string;
    accountType: string;
    status: string;
  } | null> {
    this.ensureConfigured();

    const paymentMethods = await this.stripe!.paymentMethods.list({
      customer: customerId,
      type: 'us_bank_account',
    });

    const bankAccount = paymentMethods.data[0];
    if (!bankAccount || !bankAccount.us_bank_account) {
      return null;
    }

    return {
      id: bankAccount.id,
      bankName: bankAccount.us_bank_account.bank_name || 'Unknown Bank',
      last4: bankAccount.us_bank_account.last4 || '****',
      accountType: bankAccount.us_bank_account.account_type || 'checking',
      status: bankAccount.us_bank_account.financial_connections_account
        ? 'verified'
        : 'pending',
    };
  }

  /**
   * Set a bank account as the default payment method for a customer.
   */
  async setDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string,
  ): Promise<void> {
    this.ensureConfigured();

    await this.stripe!.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
  }

  /**
   * Create a subscription with ACH as the payment method.
   * ACH payments are pulled automatically on invoice due date.
   *
   * Note: ACH payments take 4-5 business days to clear.
   * Stripe will retry failed payments automatically.
   */
  async createSubscriptionWithACH(params: {
    customerId: string;
    priceId: string;
    paymentMethodId: string;
    trialDays?: number;
    metadata?: Record<string, string>;
  }): Promise<Subscription> {
    this.ensureConfigured();

    // Set the bank account as default first
    await this.setDefaultPaymentMethod(params.customerId, params.paymentMethodId);

    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: params.customerId,
      items: [{ price: params.priceId }],
      default_payment_method: params.paymentMethodId,
      payment_settings: {
        payment_method_types: ['us_bank_account'],
        save_default_payment_method: 'on_subscription',
      },
      metadata: params.metadata,
    };

    if (params.trialDays) {
      subscriptionParams.trial_period_days = params.trialDays;
    }

    const subscription = await this.stripe!.subscriptions.create(subscriptionParams);
    return this.mapSubscription(subscription);
  }

  /**
   * Configure automatic retry settings for failed ACH payments.
   * Called once during Stripe account setup.
   *
   * Industry standard:
   * - 3-4 retry attempts
   * - Exponential backoff (1 day, 3 days, 5 days)
   *
   * Note: This is typically configured in Stripe Dashboard, not via API.
   * This method is for documentation/reference.
   */
  getRecommendedRetrySettings(): {
    maxRetries: number;
    retryScheduleDays: number[];
    gracePeriodDays: number;
  } {
    return {
      maxRetries: 4,
      retryScheduleDays: [1, 3, 5, 7], // Days after initial failure
      gracePeriodDays: 14, // Total grace period before suspension
    };
  }

  // ============================================================================
  // Billing Portal
  // ============================================================================

  /**
   * Create a billing portal session for customer self-service.
   * Customers can manage subscriptions, payment methods, view invoices.
   */
  async createBillingPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<{ url: string }> {
    this.ensureConfigured();

    const session = await this.stripe!.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  /**
   * Create a checkout session for new subscriptions.
   */
  async createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    trialDays?: number;
    metadata?: Record<string, string>;
  }): Promise<{ sessionId: string; url: string }> {
    this.ensureConfigured();

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: params.customerId,
      mode: 'subscription',
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
    };

    if (params.trialDays) {
      sessionParams.subscription_data = {
        trial_period_days: params.trialDays,
      };
    }

    const session = await this.stripe!.checkout.sessions.create(sessionParams);

    return {
      sessionId: session.id,
      url: session.url!,
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private ensureConfigured(): void {
    if (!this.stripe) {
      throw new Error('Stripe provider is not configured');
    }
  }

  private mapCustomer(customer: Stripe.Customer): Customer {
    return {
      id: customer.id,
      email: customer.email || '',
      name: customer.name || '',
      metadata: customer.metadata as Record<string, string>,
    };
  }

  private mapSubscription(subscription: Stripe.Subscription): Subscription {
    // Access period dates from the first subscription item
    const firstItem = subscription.items.data[0];
    const periodStart = firstItem?.created || Math.floor(Date.now() / 1000);
    const periodEnd = periodStart + 30 * 24 * 60 * 60; // Approximate 30 days

    return {
      id: subscription.id,
      customerId:
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id,
      status: this.mapSubscriptionStatus(subscription.status),
      priceId: firstItem?.price?.id || '',
      currentPeriodStart: new Date(periodStart * 1000),
      currentPeriodEnd: new Date(periodEnd * 1000),
      cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : undefined,
    };
  }

  private mapSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE,
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELED,
      unpaid: SubscriptionStatus.UNPAID,
      trialing: SubscriptionStatus.TRIALING,
      incomplete: SubscriptionStatus.INCOMPLETE,
      incomplete_expired: SubscriptionStatus.CANCELED,
      paused: SubscriptionStatus.CANCELED,
    };
    return statusMap[status] || SubscriptionStatus.ACTIVE;
  }

  private mapInvoice(invoice: Stripe.Invoice): Invoice {
    const lineItems: InvoiceLineItem[] =
      invoice.lines?.data.map((line: Stripe.InvoiceLineItem) => ({
        id: line.id,
        description: line.description || '',
        quantity: line.quantity || 0,
        unitAmount: line.amount && line.quantity ? Math.floor(line.amount / line.quantity) : 0,
        amount: line.amount,
        priceId: this.extractPriceId(line),
        metadata: line.metadata as Record<string, string>,
      })) || [];

    // Get subscription ID from metadata or line items
    const subscriptionId =
      (invoice.metadata?.subscription_id as string) ||
      this.extractSubscriptionId(invoice) ||
      undefined;

    return {
      id: invoice.id || '',
      customerId:
        typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || '',
      subscriptionId,
      status: this.mapInvoiceStatus(invoice.status),
      currency: invoice.currency,
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      amountRemaining: invoice.amount_remaining,
      subtotal: invoice.subtotal,
      tax: invoice.total_taxes?.[0]?.amount || undefined,
      total: invoice.total,
      periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : undefined,
      periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : undefined,
      dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : undefined,
      paidAt:
        invoice.status_transitions?.paid_at
          ? new Date(invoice.status_transitions.paid_at * 1000)
          : undefined,
      hostedInvoiceUrl: invoice.hosted_invoice_url || undefined,
      invoicePdf: invoice.invoice_pdf || undefined,
      lineItems,
      metadata: invoice.metadata as Record<string, string>,
    };
  }

  private mapInvoiceStatus(status: Stripe.Invoice.Status | null): InvoiceStatus {
    const statusMap: Record<string, InvoiceStatus> = {
      draft: InvoiceStatus.DRAFT,
      open: InvoiceStatus.OPEN,
      paid: InvoiceStatus.PAID,
      void: InvoiceStatus.VOID,
      uncollectible: InvoiceStatus.UNCOLLECTIBLE,
    };
    return statusMap[status || ''] || InvoiceStatus.DRAFT;
  }

  private mapConnectedAccount(account: Stripe.Account): ConnectedAccount {
    return {
      id: account.id,
      email: account.email || '',
      country: account.country || '',
      type: account.type || 'express',
      chargesEnabled: account.charges_enabled || false,
      payoutsEnabled: account.payouts_enabled || false,
      detailsSubmitted: account.details_submitted || false,
      metadata: account.metadata as Record<string, string>,
    };
  }

  /**
   * Extract price ID from invoice line item.
   * Handles different Stripe API versions.
   */
  private extractPriceId(line: Stripe.InvoiceLineItem): string | undefined {
    // Try to get price from pricing object (newer API)
    const pricing = line.pricing as { price_details?: { price?: string } } | undefined;
    if (pricing?.price_details?.price) {
      return pricing.price_details.price;
    }

    // Try parent object
    const parent = line.parent as {
      subscription_item_details?: { subscription?: string };
    } | null;
    if (parent?.subscription_item_details?.subscription) {
      return undefined; // This is subscription ID, not price ID
    }

    return undefined;
  }

  /**
   * Extract subscription ID from invoice.
   * Handles different Stripe API versions.
   */
  private extractSubscriptionId(invoice: Stripe.Invoice): string | undefined {
    // Try to get from first line item's parent
    const firstLine = invoice.lines?.data[0];
    if (firstLine) {
      const parent = firstLine.parent as {
        subscription_item_details?: { subscription?: string };
      } | null;
      if (parent?.subscription_item_details?.subscription) {
        return parent.subscription_item_details.subscription;
      }
    }

    return undefined;
  }
}
