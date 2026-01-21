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
