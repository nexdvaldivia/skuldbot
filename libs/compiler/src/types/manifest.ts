import {
  Classification,
  PropagationMode,
  EgressMode,
  WriteMode,
  ControlType,
} from './classification';

/**
 * Node Manifest - Contract for each node type
 * Extends the basic NodeTemplate with runtime/compliance metadata
 */
export interface NodeManifest {
  type: string; // category.action e.g., "ai.llm_prompt"
  category: string;
  label: string;
  description: string;
  icon: string;

  defaultConfig: Record<string, any>;
  configSchema: ConfigField[];
  outputSchema?: OutputField[];

  // Data classification policy
  data: {
    consumes: Classification[]; // What classifications this node can receive
    produces: Classification[]; // What classifications this node outputs
    propagation: PropagationMode;
    outputClassificationOverride?: Record<string, Classification>;
  };

  // Node capabilities (for policy evaluation)
  capabilities: {
    egress: EgressMode;
    writes: WriteMode;
    deletes: boolean;
    privilegedAccess: boolean;
    network?: {
      allowDomains?: string[];
      denyDomains?: string[];
    };
  };

  // Controls
  controls: {
    requires: ControlType[]; // Always required
    supports: ControlType[]; // Can be injected by policy
  };

  // Runtime behavior
  runtime: {
    idempotent: boolean;
    retryable: boolean;
    defaultRetry: {
      max: number;
      backoffMs: number;
    };
    timeoutMs: number;
  };
}

/**
 * Config field definition
 */
export interface ConfigField {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  default?: any;
  options?: Array<{ value: string; label: string }>;
  supportsExpressions?: boolean;
  placeholder?: string;
}

/**
 * Output field definition
 */
export interface OutputField {
  name: string;
  type: string;
  description?: string;
  classification?: Classification;
}

/**
 * Create a default manifest for unknown nodes (conservative)
 */
export function createUnknownNodeManifest(type: string): NodeManifest {
  const [category] = type.split('.');

  return {
    type,
    category: category || 'unknown',
    label: type,
    description: 'Unknown node type',
    icon: 'HelpCircle',
    defaultConfig: {},
    configSchema: [],
    outputSchema: [],
    data: {
      consumes: ['UNCLASSIFIED', 'PII', 'PHI', 'PCI', 'CREDENTIALS'],
      produces: ['PHI'], // Conservative: assume it might produce PHI
      propagation: 'PASS_THROUGH',
    },
    capabilities: {
      egress: 'EXTERNAL', // Conservative: assume external
      writes: 'EXTERNAL',
      deletes: true,
      privilegedAccess: true,
    },
    controls: {
      requires: ['AUDIT_LOG'],
      supports: [],
    },
    runtime: {
      idempotent: false,
      retryable: false,
      defaultRetry: { max: 0, backoffMs: 0 },
      timeoutMs: 60000,
    },
  };
}
