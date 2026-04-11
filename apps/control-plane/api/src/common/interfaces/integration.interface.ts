/**
 * Base interface for all integration providers.
 * All external services (payment, storage, email, etc.) implement this pattern.
 */
export interface IntegrationProvider {
  readonly name: string;
  readonly type: IntegrationType;
  isConfigured(): boolean;
  healthCheck(): Promise<boolean>;
}

export enum IntegrationType {
  PAYMENT = 'payment',
  STORAGE = 'storage',
  EMAIL = 'email',
  GRAPH = 'graph',
}

/**
 * Payment Provider Interface
 * Implementations: Stripe, PayPal, etc.
 *
 * Supports:
 * - Customer management
 * - Subscriptions (fixed pricing)
 * - Metered billing (usage-based pricing)
 * - Connected accounts (revenue share with partners)
 */
export interface PaymentProvider extends IntegrationProvider {
  // Customer Management
  createCustomer(data: CreateCustomerData): Promise<Customer>;
  updateCustomer(customerId: string, data: UpdateCustomerData): Promise<Customer>;
  deleteCustomer(customerId: string): Promise<void>;
  getCustomer(customerId: string): Promise<Customer>;

  // Subscriptions
  createSubscription(data: CreateSubscriptionData): Promise<Subscription>;
  updateSubscription(subscriptionId: string, data: UpdateSubscriptionData): Promise<Subscription>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  getSubscription(subscriptionId: string): Promise<Subscription>;

  // Payment Intents
  createPaymentIntent(data: CreatePaymentIntentData): Promise<PaymentIntent>;

  // Metered Billing (Usage-Based)
  recordUsage(data: RecordUsageData): Promise<UsageRecord>;
  getUsageSummary(subscriptionId: string, meterId?: string): Promise<UsageSummary>;

  // Invoicing
  getInvoice(invoiceId: string): Promise<Invoice>;
  listInvoices(customerId: string, options?: ListInvoicesOptions): Promise<Invoice[]>;
  getUpcomingInvoice(customerId: string): Promise<Invoice | null>;

  // Connected Accounts (Revenue Share / Stripe Connect)
  createConnectedAccount?(data: CreateConnectedAccountData): Promise<ConnectedAccount>;
  getConnectedAccount?(accountId: string): Promise<ConnectedAccount>;
  createAccountLink?(accountId: string, type: AccountLinkType): Promise<AccountLink>;
  createTransfer?(data: CreateTransferData): Promise<Transfer>;
  listTransfers?(connectedAccountId: string, options?: ListTransfersOptions): Promise<Transfer[]>;

  // Webhooks
  handleWebhook(payload: Buffer, signature: string): Promise<WebhookEvent>;
}

export interface CreateCustomerData {
  email: string;
  name: string;
  metadata?: Record<string, string>;
}

export interface UpdateCustomerData {
  email?: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface Customer {
  id: string;
  email: string;
  name: string;
  metadata?: Record<string, string>;
}

export interface CreateSubscriptionData {
  customerId: string;
  priceId: string;
  trialDays?: number;
  metadata?: Record<string, string>;
}

export interface UpdateSubscriptionData {
  priceId?: string;
  metadata?: Record<string, string>;
}

export interface Subscription {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  priceId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAt?: Date;
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  UNPAID = 'unpaid',
  TRIALING = 'trialing',
  INCOMPLETE = 'incomplete',
}

export interface CreatePaymentIntentData {
  amount: number;
  currency: string;
  customerId?: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: string;
  clientSecret: string;
}

export interface WebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Storage Provider Interface
 * Implementations: AWS S3, Azure Blob, MinIO, etc.
 */
export interface StorageProvider extends IntegrationProvider {
  upload(data: UploadData): Promise<UploadResult>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  list(prefix?: string): Promise<StorageObject[]>;
}

export interface UploadData {
  key: string;
  body: Buffer | string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  key: string;
  url: string;
  etag?: string;
}

export interface StorageObject {
  key: string;
  size: number;
  lastModified: Date;
}

/**
 * Email Provider Interface
 * Implementations: SendGrid, AWS SES, SMTP, etc.
 */
export interface EmailProvider extends IntegrationProvider {
  send(data: SendEmailData): Promise<SendEmailResult>;
  sendTemplate(data: SendTemplateEmailData): Promise<SendEmailResult>;
}

export interface SendEmailData {
  to: string | string[];
  from?: string;
  subject: string;
  text?: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface SendTemplateEmailData {
  to: string | string[];
  from?: string;
  templateId: string;
  templateData: Record<string, unknown>;
  cc?: string[];
  bcc?: string[];
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendEmailResult {
  messageId: string;
  success: boolean;
}

/**
 * Microsoft Graph Provider Interface
 * For Microsoft 365 integrations
 */
export interface GraphProvider extends IntegrationProvider {
  getUsers(): Promise<GraphUser[]>;
  getUser(userId: string): Promise<GraphUser>;
  getGroups(): Promise<GraphGroup[]>;
  sendMail(userId: string, data: GraphMailData): Promise<void>;
}

export interface GraphUser {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
}

export interface GraphGroup {
  id: string;
  displayName: string;
  description?: string;
}

export interface GraphMailData {
  subject: string;
  body: string;
  toRecipients: string[];
}

// ============================================================================
// Metered Billing Types
// ============================================================================

/**
 * Data for recording usage events (metered billing).
 * Used for tracking billable events like claims processed, calls answered, etc.
 */
export interface RecordUsageData {
  subscriptionId: string;
  subscriptionItemId?: string;
  meterId?: string;
  quantity: number;
  timestamp?: Date;
  action?: 'increment' | 'set';
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}

export interface UsageRecord {
  id: string;
  subscriptionItemId: string;
  quantity: number;
  timestamp: Date;
  action: string;
}

export interface UsageSummary {
  subscriptionId: string;
  meterId?: string;
  totalUsage: number;
  periodStart: Date;
  periodEnd: Date;
  lineItems?: UsageLineItem[];
}

export interface UsageLineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
}

// ============================================================================
// Invoice Types
// ============================================================================

export interface Invoice {
  id: string;
  customerId: string;
  subscriptionId?: string;
  status: InvoiceStatus;
  currency: string;
  amountDue: number;
  amountPaid: number;
  amountRemaining: number;
  subtotal: number;
  tax?: number;
  total: number;
  periodStart?: Date;
  periodEnd?: Date;
  dueDate?: Date;
  paidAt?: Date;
  hostedInvoiceUrl?: string;
  invoicePdf?: string;
  lineItems: InvoiceLineItem[];
  metadata?: Record<string, string>;
}

export enum InvoiceStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  PAID = 'paid',
  VOID = 'void',
  UNCOLLECTIBLE = 'uncollectible',
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  priceId?: string;
  metadata?: Record<string, string>;
}

export interface ListInvoicesOptions {
  limit?: number;
  startingAfter?: string;
  status?: InvoiceStatus;
}

// ============================================================================
// Stripe Connect Types (Revenue Share with Partners)
// ============================================================================

/**
 * Data for creating a connected account (for partners receiving payouts).
 * Partners onboard via Stripe Connect Express or Standard.
 */
export interface CreateConnectedAccountData {
  email: string;
  country: string;
  type?: 'express' | 'standard' | 'custom';
  businessType?: 'individual' | 'company';
  metadata?: Record<string, string>;
}

export interface ConnectedAccount {
  id: string;
  email: string;
  country: string;
  type: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  metadata?: Record<string, string>;
}

export type AccountLinkType = 'account_onboarding' | 'account_update';

export interface AccountLink {
  url: string;
  expiresAt: Date;
}

/**
 * Data for creating a transfer to a connected account (partner payout).
 * Used for revenue share after calculating Skuld's commission.
 */
export interface CreateTransferData {
  amount: number;
  currency: string;
  destinationAccountId: string;
  description?: string;
  sourceTransactionId?: string;
  metadata?: Record<string, string>;
}

export interface Transfer {
  id: string;
  amount: number;
  currency: string;
  destinationAccountId: string;
  description?: string;
  created: Date;
  reversed: boolean;
  metadata?: Record<string, string>;
}

export interface ListTransfersOptions {
  limit?: number;
  startingAfter?: string;
}

// ============================================================================
// Pricing Types (for Marketplace Bots)
// ============================================================================

export type PricingModel = 'free' | 'subscription' | 'usage' | 'hybrid';

export interface BotPricing {
  model: PricingModel;

  // Subscription (fixed monthly/annual)
  monthlyBase?: number;
  annualDiscount?: number;

  // Usage-based metrics
  usageMetrics?: BotUsageMetric[];

  // Hybrid: minimum monthly commitment
  minimumMonthly?: number;

  // Trial period
  trialDays?: number;

  // Stripe references
  stripeProductId?: string;
  stripePriceId?: string;
  stripeMeterId?: string;
}

export interface BotUsageMetric {
  id: string;
  name: string;
  displayName: string;
  description: string;
  pricePerUnit: number;
  currency: string;
  stripeMeterId?: string;
}
