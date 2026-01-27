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
}

export type LLMProvider = "openai" | "anthropic" | "local";

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

export type PlannerMode = "simple" | "advanced";

export interface AIPlannerV2State {
  // Mode
  mode: PlannerMode;
  
  // Panel state
  isPanelOpen: boolean;
  
  // Conversation
  conversation: ConversationMessage[];
  userInput: string;
  
  // Current plan
  currentPlan: ExecutablePlan | null;
  confidence: number;
  
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
  setMode: (mode: PlannerMode) => void;
  setUserInput: (input: string) => void;
  generateExecutablePlan: (description: string) => Promise<void>;
  refineWithFeedback: (feedback: string) => Promise<void>;
  askClarification: (question: string) => Promise<void>;
  validatePlan: () => Promise<void>;
  applyToCanvas: () => void;
  setLLMConfig: (config: Partial<LLMConfig>) => void;
  reset: () => void;
}
