// AI Planner Types
// Types for the AI-powered RPA planning assistant

// Connection types for AI nodes (model, embeddings, memory, tools)
export interface AIConnection {
  from: string;               // ID or label of source node
  to: string;                 // ID or label of target node
  type: "model" | "embeddings" | "memory" | "tool";
  toolName?: string;          // For tool connections
  toolDescription?: string;   // For tool connections
}

export interface PlanStep {
  id: string;
  nodeType: string;           // e.g., "web.open_browser", "email.read"
  label: string;              // Human-readable name
  description: string;        // What this step does
  config: Record<string, unknown>; // Pre-filled configuration
  reasoning?: string;         // AI's reasoning for this step
  isManual?: boolean;         // User-added vs AI-generated
  // AI-specific connections (for embeddings→memory→agent patterns)
  aiConnections?: AIConnection[];
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  mode?: "idle" | "ask" | "plan" | "generate" | "refine"; // Track which mode generated this message
}

export type LLMProvider = 
  // Cloud Managed (HIPAA with BAA)
  | "azure-foundry"      // Azure AI Foundry
  | "aws-bedrock"        // AWS Bedrock
  | "vertex-ai"          // Google Vertex AI
  // Cloud with BAA
  | "openai"             // OpenAI (with BAA)
  | "anthropic"          // Anthropic (with BAA)
  // Self-Hosted (Full HIPAA Control)
  | "ollama"             // Ollama
  | "vllm"               // vLLM
  | "tgi"                // Text Generation Inference
  | "llamacpp"           // llama.cpp
  | "lmstudio"           // LM Studio
  | "localai"            // LocalAI
  // Custom
  | "custom";            // Any OpenAI-compatible API

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;            // From connection, not stored directly
  baseUrl?: string;           // For local LLMs (Ollama, LM Studio)
  temperature: number;
  connectionId?: string;      // Reference to saved connection
}

export type PlannerPhase = "input" | "plan" | "refining";

export interface AIPlannerState {
  // Panel state
  isPanelOpen: boolean;
  currentPhase: PlannerPhase;

  // User input
  userDescription: string;

  // Generated plan
  planSteps: PlanStep[];
  isGenerating: boolean;
  error: string | null;

  // Conversation history for refinement
  conversation: ConversationMessage[];
  refinementInput: string;

  // LLM configuration
  llmConfig: LLMConfig;

  // Actions
  openPanel: () => void;
  closePanel: () => void;
  setUserDescription: (desc: string) => void;
  setRefinementInput: (input: string) => void;
  generatePlan: () => Promise<void>;
  addPlanStep: (step: Omit<PlanStep, "id">, afterId?: string) => void;
  updatePlanStep: (id: string, updates: Partial<PlanStep>) => void;
  removePlanStep: (id: string) => void;
  reorderPlanSteps: (fromIndex: number, toIndex: number) => void;
  refineWithAI: (userMessage: string) => Promise<void>;
  applyToCanvas: () => void;
  setLLMConfig: (config: Partial<LLMConfig>) => void;
  reset: () => void;
}

// License Types
export type LicenseModule = "studio" | "skuldai" | "skuldcompliance" | "skulddataquality";

export interface LicenseInfo {
  module: LicenseModule;
  licenseKey: string;
  expiresAt: string;
  isValid: boolean;
}

export interface LicenseState {
  // Active licenses (can have multiple modules)
  activeLicenses: LicenseInfo[];

  // Enabled features (derived from active modules)
  enabledFeatures: Set<string>;

  // Loading state
  isValidating: boolean;

  // Actions
  activateLicense: (key: string) => Promise<{ success: boolean; module?: LicenseModule; error?: string }>;
  validateAllLicenses: () => Promise<void>;
  deactivateLicense: (module: LicenseModule) => void;
  hasModule: (module: LicenseModule) => boolean;
  hasFeature: (feature: string) => boolean;
  canUseNode: (nodeType: string) => boolean;
  isStudioActivated: () => boolean;
}

// API Response types
export interface LLMPlanResponse {
  success: boolean;
  plan?: PlanStep[];
  error?: string;
  clarifyingQuestions?: string[];
}

export interface LicenseValidationResponse {
  valid: boolean;
  module: LicenseModule;
  expiresAt: string;
  features: string[];
  error?: string;
}

// ============================================================
// AI Planner V2 - Executable Workflows Types
// ============================================================

export interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  nodeType?: string;
}

export interface ValidationResult {
  valid: boolean;
  compilable: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface Clarification {
  question: string;
  blocking: boolean;
  context?: string;
}

export interface ExecutablePlan {
  goal: string;
  description: string;
  assumptions: string[];
  unknowns: Clarification[];
  tasks: PlanStep[];
  dsl: any;  // Complete DSL ready to execute
  validation: ValidationResult;
}

export interface ExecutablePlanResponse {
  success: boolean;
  confidence: number;  // 0.0 - 1.0
  plan?: ExecutablePlan;
  error?: string;
  clarifyingQuestions?: string[];
  suggestions: string[];
}

// ============================================================
// AI Planner V2 Store State
// ============================================================

export type PlannerComplexity = "simple" | "advanced";
export type PlannerAgentMode = 
  | "idle"        // No active planning session
  | "ask"         // Asking clarifying questions
  | "plan"        // Proposing approach/steps
  | "generate"    // Generating executable workflow
  | "refine";     // Refining existing workflow

export interface AIPlannerV2State {
  // Complexity mode
  complexity: PlannerComplexity;
  
  // Agent mode (like Cursor)
  agentMode: PlannerAgentMode;
  
  // Planning context
  planningContext: {
    userGoal: string;
    clarifications: Record<string, string>;
    proposedSteps: string[];
    needsApproval: boolean;
  };
  
  // Panel state
  isPanelOpen: boolean;
  
  // Conversation
  conversation: ConversationMessage[];
  userInput: string;
  
  // Current plan
  currentPlan: ExecutablePlan | null;
  confidence: number;
  suggestions: string[];
  
  // State
  isGenerating: boolean;
  isRefining: boolean;
  error: string | null;
  
  // LLM configuration
  llmConfig: LLMConfig;
  
  // Iterations
  iterations: number;
  maxIterations: number;
  
  // Actions
  openPanel: () => void;
  closePanel: () => void;
  setMode: (complexity: PlannerComplexity) => void;
  setUserInput: (input: string) => void;
  generateExecutablePlan: (description: string) => Promise<void>;
  refineWithFeedback: (feedback: string) => Promise<void>;
  askClarification: (question: string) => Promise<void>;
  validatePlan: () => Promise<void>;
  applyToCanvas: () => void;
  setLLMConfig: (config: Partial<LLMConfig>) => void;
  reset: () => void;
}

// ============================================================
// LLM Connection Manager Types (AI Planner - Design Time)
// ============================================================

export interface AzureFoundryConfig {
  type: "azure-foundry";
  endpoint: string;
  deployment: string;
  apiKey: string;
  apiVersion?: string;
}

export interface AWSBedrockConfig {
  type: "aws-bedrock";
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  modelId: string;
}

export interface VertexAIConfig {
  type: "vertex-ai";
  projectId: string;
  location: string;
  serviceAccountJson: string;
  model: string;
}

export interface OllamaConfig {
  type: "ollama";
  baseUrl: string;
  model: string;
}

export interface VLLMConfig {
  type: "vllm";
  baseUrl: string;
  model: string;
}

export interface TGIConfig {
  type: "tgi";
  baseUrl: string;
  model: string;
}

export interface LlamaCppConfig {
  type: "llamacpp";
  baseUrl: string;
  model: string;
}

export interface LMStudioConfig {
  type: "lmstudio";
  baseUrl: string;
  model: string;
}

export interface LocalAIConfig {
  type: "localai";
  baseUrl: string;
  model: string;
}

export interface OpenAIConfig {
  type: "openai";
  apiKey: string;
  baseUrl?: string;
  model: string;
}

export interface AnthropicConfig {
  type: "anthropic";
  apiKey: string;
  model: string;
}

export interface CustomConfig {
  type: "custom";
  name: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  headers?: Record<string, string>;
}

export type ProviderConfig =
  | AzureFoundryConfig
  | AWSBedrockConfig
  | VertexAIConfig
  | OllamaConfig
  | VLLMConfig
  | TGIConfig
  | LlamaCppConfig
  | LMStudioConfig
  | LocalAIConfig
  | OpenAIConfig
  | AnthropicConfig
  | CustomConfig;

export interface LLMConnectionHealthStatus {
  status: "healthy" | "degraded" | "down";
  lastCheckedAt: string;
  latencyMs?: number;
  errorMessage?: string;
}

export interface LLMConnection {
  id: string;
  name: string;
  provider: LLMProvider;
  config: ProviderConfig;
  isDefault: boolean;
  lastUsedAt?: string;
  healthStatus?: LLMConnectionHealthStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TestConnectionResult {
  success: boolean;
  latencyMs?: number;
  message: string;
  modelInfo?: {
    name: string;
    version?: string;
    capabilities?: string[];
  };
}
