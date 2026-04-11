import { Classification } from './classification';

/**
 * Bot DSL - The complete workflow definition
 */
export interface BotDSL {
  version: string;
  bot: {
    id: string;
    name: string;
    description?: string;
  };
  nodes: DSLNode[];
  variables?: Record<string, VariableDefinition>;
  triggers?: string[];
}

/**
 * Variable definition in DSL
 */
export interface VariableDefinition {
  type: string;
  default?: any;
  classification?: Classification;
}

/**
 * Model configuration for AI nodes (connected visually)
 */
export interface ModelConfig {
  provider: string;
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

/**
 * Embeddings configuration for AI nodes
 */
export interface EmbeddingsConfig {
  provider: string;
  model: string;
  dimension?: number;
  api_key?: string;
  base_url?: string;
}

/**
 * Memory configuration for AI agents
 */
export interface MemoryConfig {
  provider: string;
  collection: string;
  memory_type: 'retrieve' | 'store' | 'both';
  top_k?: number;
  min_score?: number;
}

/**
 * Tool connection for AI agents
 */
export interface ToolConnection {
  name: string;
  description: string;
  nodeId: string;
  inputMapping?: Record<string, string>;
}

/**
 * DSL Node - Individual node in the workflow
 */
export interface DSLNode {
  id: string;
  type: string;
  label?: string;
  config: Record<string, any>;
  outputs: {
    success: string; // Node ID or "END"
    error: string; // Node ID or "END"
    done?: string; // For containers (Node ID or "END")
  };
  position?: { x: number; y: number };

  // For container nodes (control.if, control.loop, etc.)
  children?: DSLNode[];

  // Scope with ports (Option C from ChatGPT)
  scope?: {
    ports: {
      [portName: string]: {
        nodeIds: string[]; // Children IDs in this region
        entryId: string; // First node in region
      };
    };
  };

  // AI Agent specific fields (connected visually in n8n style)
  model_config?: ModelConfig;
  embeddings?: EmbeddingsConfig;
  memory?: MemoryConfig;
  tools?: ToolConnection[];
}

/**
 * Container port names by node type
 */
export const CONTAINER_PORTS: Record<string, string[]> = {
  'control.if': ['then', 'else'],
  'control.try_catch': ['try', 'catch'],
  'control.loop': ['body'],
  'control.while': ['body'],
  'control.switch': ['default'], // + case_* dynamically
  'control.parallel': [], // branch_* dynamically
};

/**
 * Check if a node type is a container
 */
export function isContainerType(type: string): boolean {
  return type.startsWith('control.') && type in CONTAINER_PORTS;
}
