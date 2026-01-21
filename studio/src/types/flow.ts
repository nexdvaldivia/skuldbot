import { Node, Edge } from "reactflow";

// DSL Types
export interface BotDSL {
  version: string;
  bot: {
    id: string;
    name: string;
    description?: string;
  };
  nodes: DSLNode[];
  variables?: Record<string, VariableDefinition>;
  triggers?: string[];    // IDs of trigger nodes (can be multiple)
  start_node?: string;    // Deprecated: use triggers[] instead
}

export interface DSLNode {
  id: string;
  type: string;
  config: Record<string, any>;
  outputs: {
    success: string;
    error: string;
  };
  label?: string;
  description?: string;
  position?: { x: number; y: number };  // Visual position in editor
  // Container nodes: nested nodes that execute inside this container
  children?: DSLNode[];
  // AI Agent: connected tools (node IDs that this agent can use)
  tools?: AgentToolConnection[];
  // AI Agent: LLM model configuration (from connected AI Model node)
  // Note: uses model_config_ (with underscore) to match Jinja2 template expectations
  model_config_?: ModelConfig;
  // AI Agent: memory configuration (from connected Vector Memory node)
  memory?: MemoryConfig;
  // AI Agent/Memory: embeddings configuration (from connected Embeddings node)
  embeddings?: EmbeddingsConfig;
  // Special connections (model, tools, memory, embeddings) - persisted for UI reconstruction
  connections?: {
    model?: string;      // ID of connected AI Model node
    tools?: string[];    // IDs of connected tool nodes
    memory?: string;     // ID of connected Vector Memory node
    embeddings?: string; // ID of connected Embeddings node
  };
}

// AI Model Configuration - defines the LLM used by an agent
export interface ModelConfig {
  provider: "openai" | "anthropic" | "azure" | "ollama" | "google" | "aws" | "groq" | "mistral";
  model: string;
  temperature?: number;
  max_tokens?: number;
  api_key?: string;
  base_url?: string;
  api_version?: string;
  aws_access_key?: string;
  aws_secret_key?: string;
  region?: string;
}

// Memory Configuration - defines vector store for agent memory
export interface MemoryConfig {
  provider: "chroma" | "pgvector" | "supabase" | "pinecone" | "qdrant";
  collection: string;
  memory_type: "retrieve" | "store" | "both";
  top_k?: number;
  min_score?: number;
  connection_params?: Record<string, any>;
}

// Embeddings Configuration - defines embedding model
export interface EmbeddingsConfig {
  provider: "openai" | "azure" | "ollama" | "cohere" | "huggingface" | "google" | "aws";
  model: string;
  dimension?: number;
  api_key?: string;
  base_url?: string;
  api_version?: string;
}

// AI Agent Tool Connection - defines a tool available to the agent
export interface AgentToolConnection {
  nodeId: string;           // ID of the connected node
  name: string;             // Tool name for the LLM
  description: string;      // What this tool does (for LLM)
  inputMapping?: Record<string, string>;  // Map agent params to node config
}

export interface VariableDefinition {
  type: "string" | "number" | "boolean" | "credential" | "file" | "json";
  value?: any;
  vault?: string;
  description?: string;
}

// Node Categories - Complete RPA Platform
export type NodeCategory =
  | "web"          // Web Automation
  | "desktop"      // Desktop Automation (Windows)
  | "files"        // Files & Folders
  | "excel"        // Excel / CSV / Data
  | "email"        // Email
  | "api"          // API & Integration
  | "database"     // Database
  | "document"     // PDF / OCR / Documents
  | "ai"           // AI / Intelligent Automation
  | "vectordb"     // Vector Databases / Memory (RAG)
  | "python"       // Python Project Execution
  | "control"      // Control Flow
  | "logging"      // Logging & Monitoring
  | "security"     // Security & Secrets
  | "human"        // Human-in-the-loop
  | "compliance"   // PII/PHI Protection & HIPAA Safe Harbor
  | "dataquality"  // Data Quality Gates (Great Expectations)
  | "data"         // Data Integration (Taps & Targets)
  | "voice"        // Voice & Telephony (Twilio + Azure Speech)
  | "insurance"    // Insurance (FNOL, Policy, Claims)
  | "trigger"      // Scheduling & Triggers
  | "ms365";       // Microsoft 365 (Outlook, Calendar, OneDrive, Teams)

// Output field definition - what data a node produces
export interface OutputField {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "any";
  description?: string;
  example?: string;
}

export interface NodeTemplate {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  icon: string;
  defaultConfig: Record<string, any>;
  configSchema: ConfigField[];
  outputSchema?: OutputField[];  // Fields this node outputs to the flow
}

export interface ConfigField {
  name: string;
  label: string;
  type: "text" | "number" | "boolean" | "select" | "textarea" | "password" | "form-builder" | "expression" | "validation-builder" | "protection-builder";
  required?: boolean;
  default?: any;
  options?: { value: string; label: string }[];
  placeholder?: string;
  description?: string;  // Help text shown below the field
  supportsExpressions?: boolean;  // Allow ${node.field} syntax in this field
  secret?: boolean;  // Mask the field value (for passwords, API keys)
  visibleWhen?: { field: string; value: string | string[] };  // Conditional visibility based on another field's value
}

// Validation Builder Types (for dataquality.run_suite)
export type ValidationRuleType =
  | "not_null"
  | "unique"
  | "regex"
  | "in_set"
  | "not_in_set"
  | "between"
  | "greater_than"
  | "less_than"
  | "length_between"
  | "email"
  | "date_format"
  | "json_schema";

export interface ValidationRule {
  id: string;
  field: string;
  type: ValidationRuleType;
  params?: Record<string, any>;  // pattern, values, min, max, etc.
}

// Protection Builder Types (for compliance.protect_pii and compliance.protect_phi)
export type ProtectionMethodType =
  | "skip"          // Pass through unchanged (no transformation)
  | "mask"          // Replace with *** (preserving length)
  | "redact"        // Replace with [REDACTED]
  | "pseudonymize"  // Replace with consistent fake values
  | "hash"          // Apply cryptographic hash
  | "generalize"    // Reduce precision (age -> range, zip -> partial)
  | "encrypt"       // Reversible encryption
  | "tokenize";     // Replace with tokens (reversible via lookup)

export interface ProtectionRule {
  id: string;
  field: string;
  method: ProtectionMethodType;
  outputName?: string;  // Rename the field in output (optional)
  params?: Record<string, any>;  // mask_char, hash_algorithm, preserve_last, etc.
}

// Form Builder Types (for trigger.form)
export interface FormFieldDefinition {
  id: string;
  type: "text" | "email" | "number" | "date" | "dropdown" | "checkbox" | "file" | "textarea";
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[]; // For dropdown
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}

// Container Node Types - nodes that can hold other nodes inside
export const CONTAINER_NODE_TYPES = [
  "control.loop",       // For Each loop
  "control.while",      // While loop
  "control.if",         // If/Else branch
  "control.try_catch",  // Try/Catch block
] as const;

export type ContainerNodeType = typeof CONTAINER_NODE_TYPES[number];

// Check if a node type is a container
export function isContainerNodeType(nodeType: string): boolean {
  return CONTAINER_NODE_TYPES.includes(nodeType as ContainerNodeType);
}

// React Flow Node Data
export interface FlowNodeData {
  label: string;
  nodeType: string;
  config: Record<string, any>;
  category: NodeCategory;
  icon?: string;
  // Container node specific - holds IDs of child nodes
  childNodes?: string[];
  // AI Agent specific - tools connected to this agent
  connectedTools?: AgentToolConnection[];
  // AI Planner fields
  description?: string;
  aiGenerated?: boolean;
  aiReasoning?: string;
}

// React Flow Edge Data
export interface FlowEdgeData {
  edgeType: "success" | "error" | "tool" | "memory" | "embeddings" | "model" | "connection";
  // Color inherited from source node's category
  sourceColor?: string;
  // For tool edges: metadata about the tool connection
  toolName?: string;         // Name shown to the LLM (e.g., "search_web")
  toolDescription?: string;  // Description for the LLM (what this tool does)
  // For memory edges: vector store connection metadata
  memoryType?: "retrieve" | "store" | "both";  // How agent uses this memory
  // For connection edges: service connection (MS365, databases, etc.)
  connectionType?: string;   // Type of connection (e.g., "ms365", "database")
}

// React Flow Types - proper extension
export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge<FlowEdgeData>;

// Form Trigger Config
export interface FormTriggerConfig {
  formTitle: string;
  formDescription?: string;
  submitButtonLabel?: string;
  fields: FormFieldDefinition[];
}

// Store Types
export interface FlowState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNode: FlowNode | null;
  botInfo: {
    id: string;
    name: string;
    description: string;
  };

  // Actions
  addNode: (node: FlowNode) => void;
  updateNode: (id: string, data: Partial<FlowNodeData>) => void;
  deleteNode: (id: string) => void;
  setNodes: (nodes: FlowNode[]) => void;
  setEdges: (edges: FlowEdge[]) => void;
  setSelectedNode: (node: FlowNode | null) => void;
  setBotInfo: (info: Partial<FlowState["botInfo"]>) => void;

  // DSL Operations
  generateDSL: () => BotDSL;
  loadFromDSL: (dsl: BotDSL) => void;

  // Bot Operations
  compileBot: () => Promise<void>;
  runBot: (formData?: Record<string, any>) => Promise<void>;
  requiresFormInput: () => boolean;
  getFormTriggerConfig: () => FormTriggerConfig | null;
}

