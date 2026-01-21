import { Injectable, Logger } from '@nestjs/common';
import {
  compile,
  CompileResult,
  BotDSL,
  NodeManifest,
  TenantPolicyPack,
  HIPAA_POLICY_PACK,
} from '@skuldbot/compiler';
import { ManifestsService } from '../manifests/manifests.service';
import { PoliciesService } from '../policies/policies.service';

/**
 * Compilation request
 */
export interface CompileRequest {
  dsl: BotDSL;
  tenantId: string;
  botId: string;
  botVersion: string;
  runId?: string;
}

/**
 * Service for compiling DSL into ExecutionPlans
 */
@Injectable()
export class CompilerService {
  private readonly logger = new Logger(CompilerService.name);

  constructor(
    private readonly manifestsService: ManifestsService,
    private readonly policiesService: PoliciesService,
  ) {}

  /**
   * Compile a DSL into an ExecutionPlan
   */
  async compile(request: CompileRequest): Promise<CompileResult> {
    const { dsl, tenantId, botId, botVersion, runId } = request;

    this.logger.log(
      `Compiling bot ${botId} version ${botVersion} for tenant ${tenantId}`,
    );

    // Get manifests for all node types in the DSL
    const nodeTypes = this.extractNodeTypes(dsl);
    const manifests = await this.manifestsService.getManifestsForTypes(nodeTypes);

    // Get tenant policy pack
    const policyPack = await this.policiesService.getPolicyPackForTenant(tenantId);

    // Compile
    const result = compile(dsl, manifests, {
      runId: runId ?? `compile-${Date.now()}`,
      tenantId,
      botId,
      botVersion,
      policyPack,
      failOnWarnings: false,
    });

    if (result.success) {
      this.logger.log(
        `Compilation successful: ${result.plan?.steps.length} steps, hash: ${result.planHash}`,
      );
    } else {
      this.logger.warn(
        `Compilation failed: ${result.errors.length} errors`,
      );
    }

    if (result.warnings.length > 0) {
      this.logger.warn(`Compilation warnings: ${result.warnings.join(', ')}`);
    }

    return result;
  }

  /**
   * Extract all node types from DSL (including nested)
   */
  private extractNodeTypes(dsl: BotDSL): string[] {
    const types = new Set<string>();

    const extractFromNodes = (nodes: BotDSL['nodes']) => {
      for (const node of nodes) {
        types.add(node.type);
        if (node.children?.length) {
          extractFromNodes(node.children);
        }
      }
    };

    extractFromNodes(dsl.nodes);
    return Array.from(types);
  }

  /**
   * Validate DSL structure before compilation
   */
  validateDSL(dsl: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!dsl || typeof dsl !== 'object') {
      errors.push('DSL must be an object');
      return { valid: false, errors };
    }

    const d = dsl as Record<string, unknown>;

    if (!d.version || typeof d.version !== 'string') {
      errors.push('DSL must have a version string');
    }

    if (!d.bot || typeof d.bot !== 'object') {
      errors.push('DSL must have a bot object');
    } else {
      const bot = d.bot as Record<string, unknown>;
      if (!bot.id) errors.push('bot.id is required');
      if (!bot.name) errors.push('bot.name is required');
    }

    if (!d.nodes || !Array.isArray(d.nodes)) {
      errors.push('DSL must have a nodes array');
    } else if (d.nodes.length === 0) {
      errors.push('DSL must have at least one node');
    }

    return { valid: errors.length === 0, errors };
  }
}
