/**
 * MCP (Model Context Protocol) Types
 *
 * Standard types for MCP implementation in Control Plane
 */

export interface Tool {
  /** Unique identifier for the tool */
  name: string;

  /** Human-readable description */
  description: string;

  /** JSON Schema for input parameters */
  inputSchema: Record<string, any>;

  /** Whether this tool requires approval before execution */
  requiresApproval?: boolean;

  /** Tags for categorization */
  tags?: string[];
}

export interface Resource {
  /** Unique URI for the resource */
  uri: string;

  /** Human-readable name */
  name: string;

  /** Description of the resource */
  description?: string;

  /** MIME type of the content */
  mimeType: string;

  /** Tags for categorization */
  tags?: string[];
}

export interface ToolCall {
  /** Name of the tool to execute */
  name: string;

  /** Arguments matching the inputSchema */
  arguments: Record<string, any>;

  /** Optional ID for tracking */
  id?: string;
}

export interface ToolResult {
  /** Whether execution was successful */
  success: boolean;

  /** Result data (if successful) */
  result?: any;

  /** Error message (if failed) */
  error?: string;

  /** Optional ID matching the ToolCall */
  id?: string;
}

export interface ResourceContent {
  /** The URI that was requested */
  uri: string;

  /** The actual content */
  content: string;

  /** MIME type of the content */
  mimeType: string;
}

export interface MCPCapabilities {
  /** List of available tools */
  tools: Tool[];

  /** List of available resources */
  resources: Resource[];

  /** Server metadata */
  metadata: ServerMetadata;
}

export interface ServerMetadata {
  /** Server name */
  name: string;

  /** Server version */
  version: string;

  /** Short description */
  description: string;

  /** Vendor/author */
  vendor?: string;
}

// ============================================================
// Control Plane specific types
// ============================================================

export interface BotPricingModel {
  model: 'usage' | 'per_call' | 'monthly' | 'hybrid';
  perUsageRate?: number;
  perCallRate?: number;
  monthlyMinimum?: number;
  currency: string;
  billingCycle: 'monthly' | 'annual';
}

export interface MarketplaceBot {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  pricing: BotPricingModel;
  partnerId?: string;
  isPublic: boolean;
  features: string[];
  requiredLicense: 'free' | 'pro' | 'enterprise';
}

export interface LicenseInfo {
  tenantId: string;
  orchestratorLicense: {
    tier: 'free' | 'professional' | 'enterprise';
    expiresAt: string;
    maxRunners: number;
    maxStudios: number;
  };
  studioLicenses: {
    userId: string;
    tier: 'free' | 'pro' | 'enterprise';
    expiresAt: string;
  }[];
  featureLimits: {
    maxNodes: number;
    maxWorkflows: number;
    maxExecutionsPerMonth: number;
    allowMarketplace: boolean;
    allowCustomNodes: boolean;
  };
}

export interface UsageMetrics {
  claimsCompleted?: number;
  apiCalls?: number;
  recordsProcessed?: number;
  [key: string]: number | undefined;
}

export interface BotExecution {
  tenantId: string;
  botId: string;
  executionId: string;
  startTime: string;
  endTime: string;
  status: 'success' | 'failed' | 'timeout';
  metrics: UsageMetrics;
}

export interface CurrentUsage {
  tenantId: string;
  botId: string;
  period: string;
  usage: {
    metrics: UsageMetrics;
    costs: {
      usageBased: number;
      callBased: number;
      monthlyMinimum: number;
      charged: number;
    };
  };
  projectedMonthly: number;
  minimumCommitment: number;
  willBeBilled: number;
}

export interface RunnerHeartbeat {
  tenantId: string;
  runnerId: string;
  type: 'attended' | 'unattended';
  timestamp: string;
  status: 'active' | 'idle' | 'error';
}
