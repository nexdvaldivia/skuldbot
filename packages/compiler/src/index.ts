// Types
export * from './types';

// CFG Builder
export * from './cfg';

// Classification Propagation
export * from './classification';

// Policy Evaluation
export * from './policy';

// Execution Plan Compiler
export * from './executor';

// High-level compile function
import { BotDSL, DSLNode } from './types/dsl';
import { NodeManifest } from './types/manifest';
import { TenantPolicyPack, HIPAA_POLICY_PACK } from './types/policy';
import { ExecutionPlan } from './types/execution-plan';
import { buildCFG } from './cfg';
import { propagateClassification } from './classification';
import { evaluatePolicies, shouldBlockCompilation } from './policy';
import {
  compileExecutionPlan,
  validateExecutionPlan,
  hashExecutionPlan,
  CompileOptions,
} from './executor';

/**
 * AI configuration node types (sub-nodes that don't execute directly)
 */
const AI_CONFIG_NODES = new Set(['ai.model', 'ai.embeddings']);

/**
 * Validate AI-related configurations in DSL nodes
 * Returns errors (blocking) and warnings (non-blocking)
 */
function validateAIConfigurations(nodes: DSLNode[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const node of nodes) {
    // Skip non-AI nodes
    if (!node.type.startsWith('ai.')) continue;

    const nodeLabel = node.label || node.id;

    // Validate AI Agent nodes
    if (node.type === 'ai.agent') {
      // Check if model_config is connected
      if (!node.model_config) {
        errors.push(
          `AI Agent '${nodeLabel}' no tiene un AI Model conectado. ` +
          `Conecta un nodo 'AI Model' al puerto 'model' del AI Agent.`
        );
      } else {
        const { provider, api_key, base_url, api_version, region } = node.model_config;

        // Check for API key based on provider
        const providersRequiringApiKey = ['openai', 'anthropic', 'groq', 'mistral', 'cohere'];
        if (providersRequiringApiKey.includes(provider) && !api_key) {
          warnings.push(
            `AI Agent '${nodeLabel}': AI Model (${provider}) no tiene API key configurada. ` +
            `Asegúrate de configurar la API key antes de ejecutar.`
          );
        }

        // Azure-specific validation
        if (provider === 'azure') {
          if (!base_url) {
            warnings.push(`AI Agent '${nodeLabel}': Azure AI Foundry requiere endpoint (base_url).`);
          }
          if (!api_version) {
            warnings.push(`AI Agent '${nodeLabel}': Azure AI Foundry requiere api_version.`);
          }
        }

        // AWS Bedrock validation
        if (provider === 'aws' && !region) {
          warnings.push(`AI Agent '${nodeLabel}': AWS Bedrock requiere region configurada.`);
        }
      }

      // Check embeddings config if memory is connected
      if (node.memory && ['retrieve', 'both'].includes(node.memory.memory_type)) {
        if (!node.embeddings) {
          warnings.push(
            `AI Agent '${nodeLabel}' tiene memoria conectada pero no tiene ` +
            `Embeddings configurados. Conecta un nodo 'Embeddings' para habilitar ` +
            `la búsqueda semántica en memoria.`
          );
        }
      }
    }

    // Validate Chat Model nodes (ai.model)
    else if (node.type === 'ai.model') {
      const { provider, model, base_url } = node.config;

      if (!model) {
        warnings.push(
          `Chat Model '${nodeLabel}': No tiene modelo especificado, ` +
          `se usará el modelo por defecto del proveedor.`
        );
      }

      if (provider === 'ollama' && !base_url) {
        warnings.push(
          `Chat Model '${nodeLabel}': Ollama requiere base_url (ej: http://localhost:11434).`
        );
      }
    }

    // Validate Embeddings nodes (ai.embeddings)
    else if (node.type === 'ai.embeddings') {
      const { provider, base_url } = node.config;

      if (provider === 'ollama' && !base_url) {
        warnings.push(`Embeddings '${nodeLabel}': Ollama requiere base_url.`);
      }
    }

    // Recursively validate children
    if (node.children?.length) {
      const childValidation = validateAIConfigurations(node.children);
      errors.push(...childValidation.errors);
      warnings.push(...childValidation.warnings);
    }
  }

  return { errors, warnings };
}

/**
 * Result of compilation
 */
export interface CompileResult {
  success: boolean;
  plan?: ExecutionPlan;
  planHash?: string;
  errors: string[];
  warnings: string[];
}

/**
 * Full compilation options
 */
export interface FullCompileOptions extends CompileOptions {
  policyPack?: TenantPolicyPack;
  failOnWarnings?: boolean;
}

/**
 * Compile a DSL into an ExecutionPlan
 * This is the main entry point for the compiler
 */
export function compile(
  dsl: BotDSL,
  manifests: Record<string, NodeManifest>,
  options: FullCompileOptions,
): CompileResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Phase 0: Validate AI configurations
    const aiValidation = validateAIConfigurations(dsl.nodes);
    errors.push(...aiValidation.errors);
    warnings.push(...aiValidation.warnings);

    // If there are AI validation errors, fail early
    if (aiValidation.errors.length > 0) {
      return {
        success: false,
        errors,
        warnings,
      };
    }

    // Phase 1: Build Control Flow Graph
    const cfg = buildCFG(dsl);

    // Phase 2: Propagate Classification (first pass without injected controls)
    const initialClassMap = propagateClassification(cfg, manifests, {});

    // Phase 3: Evaluate Policies
    const policyPack = options.policyPack ?? HIPAA_POLICY_PACK;
    const policyResult = evaluatePolicies(cfg, initialClassMap, manifests, policyPack);

    // Collect warnings
    for (const warning of policyResult.warnings) {
      warnings.push(`[${warning.severity}] ${warning.message} (node: ${warning.nodeId})`);
    }

    // Check for blocking violations
    if (shouldBlockCompilation(policyResult)) {
      for (const block of policyResult.blocks) {
        errors.push(`[BLOCKED] ${block.message} (node: ${block.nodeId})`);
      }

      if (options.failOnWarnings && warnings.length > 0) {
        errors.push(`Compilation has ${warnings.length} warnings and failOnWarnings is enabled`);
      }

      return {
        success: false,
        errors,
        warnings,
      };
    }

    // Phase 2b: Re-propagate with injected controls (for TRANSFORM nodes)
    const injectedControls: Record<string, string[]> = {};
    for (const [nodeId, controls] of Object.entries(policyResult.requiresControls)) {
      injectedControls[nodeId] = Array.from(controls);
    }
    const finalClassMap = propagateClassification(cfg, manifests, injectedControls as any);

    // Phase 4: Compile Execution Plan
    const plan = compileExecutionPlan(cfg, finalClassMap, manifests, policyResult, options);

    // Validate the plan
    const validation = validateExecutionPlan(plan);
    if (!validation.valid) {
      for (const error of validation.errors) {
        errors.push(error);
      }
      return {
        success: false,
        errors,
        warnings,
      };
    }

    // Calculate hash
    const planHash = hashExecutionPlan(plan);

    // Check if we should fail on warnings
    if (options.failOnWarnings && warnings.length > 0) {
      errors.push(`Compilation has ${warnings.length} warnings and failOnWarnings is enabled`);
      return {
        success: false,
        plan,
        planHash,
        errors,
        warnings,
      };
    }

    return {
      success: true,
      plan,
      planHash,
      errors,
      warnings,
    };
  } catch (error) {
    errors.push(`Compilation failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      errors,
      warnings,
    };
  }
}
