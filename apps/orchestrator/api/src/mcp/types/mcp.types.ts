/**
 * MCP Types for Orchestrator
 * 
 * Orchestrator MCP focuses on:
 * - Compliance (HIPAA, PII/PHI classification, audit)
 * - Workflow Templates (tenant-specific bot templates)
 * - Tenant Policies (isolation, data residency)
 */

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  requiresApproval: boolean;
  tags: string[];
}

export interface Resource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  tags: string[];
}

export interface ToolResult {
  success: boolean;
  result?: any;
  error?: string;
}

export interface ResourceContent {
  uri: string;
  content: string;
  mimeType: string;
}

export interface Prompt {
  name: string;
  description: string;
  arguments: Record<string, any>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

// ============================================================
// Compliance Types
// ============================================================

export enum DataClassification {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  PHI = 'phi', // Protected Health Information (HIPAA)
  PII = 'pii', // Personally Identifiable Information
  PCI = 'pci', // Payment Card Industry data
}

export enum LLMRoute {
  CLOUD = 'cloud', // External LLM (OpenAI, Anthropic)
  PRIVATE = 'private', // Self-hosted LLM (within tenant VPC)
  LOCAL = 'local', // Edge LLM (on Runner)
}

export interface DataField {
  name: string;
  value: string;
  classification: DataClassification;
  confidence: number;
  detectedType?: string; // SSN, DOB, MRN, etc
}

export interface ClassificationResult {
  fields: DataField[];
  overallClassification: DataClassification;
  requiresPrivateLLM: boolean;
  recommendedRoute: LLMRoute;
  redactionRequired: boolean;
}

export interface AuditLogEntry {
  timestamp: string;
  tenantId: string;
  userId?: string;
  runnerId?: string;
  action: string;
  resource: string;
  dataClassification?: DataClassification;
  success: boolean;
  metadata?: Record<string, any>;
}

// ============================================================
// Workflow Types
// ============================================================

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  industry: string[];
  tenantId?: string; // If null, it's a global template
  dsl: Record<string, any>;
  variables: TemplateVariable[];
  tags: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVariable {
  name: string;
  type: string;
  description: string;
  required: boolean;
  defaultValue?: any;
  validation?: Record<string, any>;
}

export interface TenantPolicy {
  tenantId: string;
  dataResidency: string; // Region/country where data must stay
  allowedLLMRoutes: LLMRoute[];
  maxDataRetentionDays: number;
  requireMFA: boolean;
  allowExternalIntegrations: boolean;
  customRules: Record<string, any>;
}

// ============================================================
// BYOM (Bring Your Own Model) Types
// ============================================================

/**
 * LLM Provider Types for BYOM
 */
export type LLMProviderType = 
  | 'azure-ai-foundry'
  | 'aws-bedrock'
  | 'vertex-ai'
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'vllm'
  | 'tgi'
  | 'llamacpp'
  | 'lmstudio'
  | 'localai'
  | 'custom';

/**
 * LLM Provider Configuration
 */
export interface LLMProviderConfig {
  id: string;
  name: string;
  tenantId: string;
  provider: LLMProviderType;
  endpoint: string;
  model: string;
  apiKey?: string;
  credentials?: {
    azureKeyCredential?: string;
    awsAccessKey?: string;
    awsSecretKey?: string;
    googleServiceAccount?: string;
  };
  headers?: Record<string, string>;
  baaRequired: boolean;
  baaSigned: boolean;
  hipaaCompliant: boolean;
  dataResidency: string;
  allowedDataClassifications: DataClassification[];
  priority: number;
  fallbackTo?: string;
  capabilities: {
    chat: boolean;
    streaming: boolean;
    functionCalling: boolean;
    embedding: boolean;
    vision: boolean;
    jsonMode: boolean;
  };
  limits: {
    maxTokens: number;
    maxConcurrent: number;
    rateLimit: {
      requestsPerMinute: number;
      tokensPerMinute: number;
    };
  };
  pricing: {
    inputTokens: number;
    outputTokens: number;
    currency: string;
  };
  healthCheck?: {
    status: 'healthy' | 'degraded' | 'down';
    lastCheck: string;
    latencyMs: number;
    errorRate: number;
    uptime: number;
  };
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// MCP Protocol Types
// ============================================================

export interface MCPCapabilities {
  tools: Tool[];
  resources: Resource[];
  prompts?: Prompt[];
}

export interface ServerMetadata {
  name: string;
  version: string;
  description: string;
  vendor?: string;
}

export enum MCPError {
  INVALID_PARAMS = 'invalid_params',
  METHOD_NOT_FOUND = 'method_not_found',
  INTERNAL_ERROR = 'internal_error',
  PERMISSION_DENIED = 'permission_denied',
  DATA_CLASSIFICATION_FAILED = 'data_classification_failed',
  COMPLIANCE_VIOLATION = 'compliance_violation',
}
