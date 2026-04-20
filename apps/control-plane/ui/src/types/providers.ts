// Provider Types for Control Plane Integrations

export type ProviderType = 'payment' | 'email' | 'storage';
export type ProviderStatus = 'active' | 'inactive' | 'error' | 'not_configured';

// Base Provider Config
export interface BaseProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  status: ProviderStatus;
  isPrimary: boolean;
  lastTestedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// PAYMENT PROVIDERS
// ============================================

export type PaymentProviderName = 'stripe';

export interface StripeConfig {
  provider: 'stripe';
  environment: 'test' | 'production';
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
  connectEnabled: boolean;
}

export interface PaymentProviderConfig extends BaseProviderConfig {
  type: 'payment';
  providerName: PaymentProviderName;
  config: StripeConfig;
}

// ============================================
// EMAIL PROVIDERS
// ============================================

export type EmailProviderName = 'sendgrid' | 'microsoft_graph';

export interface SendGridConfig {
  provider: 'sendgrid';
  apiKey: string;
  fromEmail: string;
  fromName: string;
  sandboxMode: boolean;
}

export interface MicrosoftGraphConfig {
  provider: 'microsoft_graph';
  tenantId: string;
  clientId: string;
  clientSecret: string;
  fromEmail: string;
  fromName: string;
}

export type EmailConfig = SendGridConfig | MicrosoftGraphConfig;

export interface EmailProviderConfig extends BaseProviderConfig {
  type: 'email';
  providerName: EmailProviderName;
  config: EmailConfig;
}

// ============================================
// STORAGE PROVIDERS
// ============================================

export type StorageProviderName = 'local' | 's3' | 'azure_blob';

export interface LocalStorageConfig {
  provider: 'local';
  basePath: string;
  maxFileSizeMb: number;
}

export interface S3StorageConfig {
  provider: 's3';
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint?: string; // For S3-compatible services like MinIO
  forcePathStyle?: boolean;
}

export interface AzureBlobConfig {
  provider: 'azure_blob';
  connectionString: string;
  containerName: string;
  accountName: string;
  accountKey?: string;
  sasToken?: string;
}

export type StorageConfig = LocalStorageConfig | S3StorageConfig | AzureBlobConfig;

export interface StorageProviderConfig extends BaseProviderConfig {
  type: 'storage';
  providerName: StorageProviderName;
  config: StorageConfig;
}

// ============================================
// UNIFIED PROVIDER TYPE
// ============================================

export type ProviderConfig = PaymentProviderConfig | EmailProviderConfig | StorageProviderConfig;

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ProviderTestResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  testedAt: string;
}

export interface ProviderListResponse {
  providers: ProviderConfig[];
}

export interface ProviderSaveResponse {
  success: boolean;
  provider: ProviderConfig;
}
