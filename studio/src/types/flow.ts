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
  | "python"       // Python Project Execution
  | "control"      // Control Flow
  | "logging"      // Logging & Monitoring
  | "security"     // Security & Secrets
  | "human"        // Human-in-the-loop
  | "compliance"   // PII/PHI Protection & HIPAA Safe Harbor
  | "dataquality"  // Data Quality Gates (Great Expectations)
  | "data"         // Data Integration (Taps & Targets)
  | "trigger";     // Scheduling & Triggers

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
  type: "text" | "number" | "boolean" | "select" | "textarea" | "password" | "form-builder" | "expression" | "validation-builder";
  required?: boolean;
  default?: any;
  options?: { value: string; label: string }[];
  placeholder?: string;
  supportsExpressions?: boolean;  // Allow ${node.field} syntax in this field
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
}

// React Flow Edge Data
export interface FlowEdgeData {
  edgeType: "success" | "error";
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

