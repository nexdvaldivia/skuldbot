import { Injectable, Logger } from '@nestjs/common';
import { LicensesService } from '../../licenses/licenses.service';
import { UsersService } from '../../users/users.service';
import { TenantsService } from '../../tenants/tenants.service';
import { MarketplaceService } from '../../marketplace/marketplace.service';
import { LookupsService } from '../../lookups/lookups.service';
import { LOOKUP_DOMAIN_LICENSE_TYPE } from '../../lookups/lookups.constants';
import { Tool, Resource, ToolResult, ResourceContent } from '../types/mcp.types';

type FeatureBag = Record<string, unknown>;

const FEATURE_ACCESS_KEYS: Record<string, string[]> = {
  marketplace: ['marketplace', 'allowMarketplace'],
  custom_nodes: ['customNodes', 'custom_nodes', 'allowCustomNodes'],
  ai_planner: ['aiAssistant', 'ai_planner', 'allowAIPlanner'],
  compliance_tools: ['auditLog', 'compliance_tools', 'allowComplianceTools'],
  api_access: ['apiAccess', 'api_access'],
};

/**
 * Licensing MCP Server
 *
 * Provides tools and resources for license validation and management.
 * Critical for Control Plane to validate what features each tenant can access.
 */
@Injectable()
export class LicensingServer {
  private readonly logger = new Logger(LicensingServer.name);

  constructor(
    private readonly licensesService: LicensesService,
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
    private readonly marketplaceService: MarketplaceService,
    private readonly lookupsService: LookupsService,
  ) {}

  /**
   * Get all tools provided by this server
   */
  getTools(): Tool[] {
    return [
      {
        name: 'validate_orchestrator_license',
        description: 'Validate if a tenant has an active Orchestrator license',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID to validate',
            },
            orchestratorId: {
              type: 'string',
              description: 'Orchestrator instance ID',
            },
          },
          required: ['tenantId', 'orchestratorId'],
        },
        requiresApproval: false,
        tags: ['licensing', 'validation'],
      },
      {
        name: 'validate_studio_license',
        description: 'Validate if a user has an active Studio license',
        inputSchema: {
          type: 'object',
          properties: {
            userId: {
              type: 'string',
              description: 'User ID to validate',
            },
            studioId: {
              type: 'string',
              description: 'Studio instance ID',
            },
          },
          required: ['userId', 'studioId'],
        },
        requiresApproval: false,
        tags: ['licensing', 'validation'],
      },
      {
        name: 'check_bot_access',
        description: 'Check if a tenant has access to a specific marketplace bot',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            botId: {
              type: 'string',
              description: 'Bot ID from marketplace',
            },
          },
          required: ['tenantId', 'botId'],
        },
        requiresApproval: false,
        tags: ['licensing', 'marketplace', 'access-control'],
      },
      {
        name: 'get_license_limits',
        description: 'Get feature limits for a tenant based on their license',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
          },
          required: ['tenantId'],
        },
        requiresApproval: false,
        tags: ['licensing', 'limits'],
      },
      {
        name: 'check_feature_access',
        description: 'Check if a tenant has access to a specific feature',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            feature: {
              type: 'string',
              enum: ['marketplace', 'custom_nodes', 'ai_planner', 'compliance_tools', 'api_access'],
              description: 'Feature to check',
            },
          },
          required: ['tenantId', 'feature'],
        },
        requiresApproval: false,
        tags: ['licensing', 'features'],
      },
    ];
  }

  /**
   * Get all resources provided by this server
   */
  getResources(): Resource[] {
    return [
      {
        uri: 'licenses://tenant/{tenantId}/orchestrator',
        name: 'Orchestrator License',
        description: 'Orchestrator license details for a tenant',
        mimeType: 'application/json',
        tags: ['licensing', 'orchestrator'],
      },
      {
        uri: 'licenses://tenant/{tenantId}/studios',
        name: 'Studio Licenses',
        description: 'All Studio licenses for a tenant',
        mimeType: 'application/json',
        tags: ['licensing', 'studio'],
      },
      {
        uri: 'licenses://tenant/{tenantId}/runners',
        name: 'Runner Licenses',
        description: 'Active runner licenses for a tenant',
        mimeType: 'application/json',
        tags: ['licensing', 'runners'],
      },
      {
        uri: 'licenses://tenant/{tenantId}/limits',
        name: 'Feature Limits',
        description: 'Feature limits based on license tier',
        mimeType: 'application/json',
        tags: ['licensing', 'limits'],
      },
      {
        uri: 'licenses://features',
        name: 'Available Features',
        description: 'All available features by license tier',
        mimeType: 'application/json',
        tags: ['licensing', 'features'],
      },
    ];
  }

  /**
   * Execute a tool
   */
  async executeTool(toolCall: {
    name: string;
    arguments: Record<string, any>;
  }): Promise<ToolResult> {
    try {
      switch (toolCall.name) {
        case 'validate_orchestrator_license':
          return await this.validateOrchestratorLicense(
            toolCall.arguments.tenantId,
            toolCall.arguments.orchestratorId,
          );

        case 'validate_studio_license':
          return await this.validateStudioLicense(
            toolCall.arguments.userId,
            toolCall.arguments.studioId,
          );

        case 'check_bot_access':
          return await this.checkBotAccess(toolCall.arguments.tenantId, toolCall.arguments.botId);

        case 'get_license_limits':
          return await this.getLicenseLimits(toolCall.arguments.tenantId);

        case 'check_feature_access':
          return await this.checkFeatureAccess(
            toolCall.arguments.tenantId,
            toolCall.arguments.feature,
          );

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolCall.name}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Tool execution failed',
      };
    }
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<ResourceContent> {
    if (uri === 'licenses://features') {
      return this.getFeaturesResource();
    }

    // Parse URI: licenses://tenant/{tenantId}/orchestrator
    const match = uri.match(/licenses:\/\/tenant\/([^/]+)\/(.+)/);
    if (!match) {
      throw new Error(`Invalid URI format: ${uri}`);
    }

    const [, tenantId, resourceType] = match;

    switch (resourceType) {
      case 'orchestrator':
        return await this.getOrchestratorLicenseResource(tenantId);

      case 'studios':
        return await this.getStudioLicensesResource(tenantId);

      case 'runners':
        return await this.getRunnerLicensesResource(tenantId);

      case 'limits':
        return await this.getLimitsResource(tenantId);

      default:
        throw new Error(`Unknown resource type: ${resourceType}`);
    }
  }

  // ============================================================
  // Tool Implementations
  // ============================================================

  private async validateOrchestratorLicense(
    tenantId: string,
    orchestratorId: string,
  ): Promise<ToolResult> {
    const tenantStatus = await this.licensesService.getTenantStatus(tenantId);
    const limitsResult = await this.getLicenseLimits(tenantId);
    const limits = limitsResult.success ? limitsResult.result : null;

    return {
      success: true,
      result: {
        valid: tenantStatus.isActive,
        tier: tenantStatus.type,
        expiresAt: tenantStatus.validUntil,
        orchestratorId,
        tenantId,
        maxRunners: limits?.maxRunners ?? null,
        maxStudios: limits?.maxStudios ?? null,
        licenseStatus: tenantStatus.status,
        reason: tenantStatus.isActive
          ? 'Orchestrator license is active.'
          : 'License missing or inactive.',
      },
    };
  }

  private async validateStudioLicense(userId: string, studioId: string): Promise<ToolResult> {
    const tenantId = await this.resolveTenantIdForUser(userId);
    if (!tenantId) {
      return {
        success: true,
        result: {
          valid: false,
          userId,
          studioId,
          tenantId: null,
          tier: null,
          expiresAt: null,
          features: [],
          reason: 'User is not mapped to a tenant.',
        },
      };
    }

    const tenantStatus = await this.licensesService.getTenantStatus(tenantId);
    const features = this.normalizeFeatures(tenantStatus.features);

    return {
      success: true,
      result: {
        valid: tenantStatus.isActive,
        userId,
        studioId,
        tenantId,
        tier: tenantStatus.type,
        expiresAt: tenantStatus.validUntil,
        features: this.listEnabledFeatures(features),
        reason: tenantStatus.isActive
          ? 'Studio access allowed by active tenant license.'
          : 'Tenant license is inactive.',
      },
    };
  }

  private async checkBotAccess(tenantId: string, botId: string): Promise<ToolResult> {
    const tenantStatus = await this.licensesService.getTenantStatus(tenantId);
    if (!tenantStatus.isActive) {
      return {
        success: true,
        result: {
          hasAccess: false,
          allowed: false,
          botId,
          tenantId,
          reason: 'Tenant license is inactive.',
          subscription: null,
        },
      };
    }

    const featureCheck = await this.checkFeatureAccess(tenantId, 'marketplace');
    if (!featureCheck.success || !featureCheck.result?.hasAccess) {
      return {
        success: true,
        result: {
          hasAccess: false,
          allowed: false,
          botId,
          tenantId,
          reason: 'Marketplace capability is not enabled for this tenant license.',
          subscription: null,
        },
      };
    }

    try {
      const bot = await this.marketplaceService.getBotById(botId);
      return {
        success: true,
        result: {
          hasAccess: true,
          allowed: true,
          botId,
          tenantId,
          reason: 'Tenant license allows marketplace bots.',
          subscription: {
            status: 'eligible',
            botId,
            botSlug: bot.slug,
            pricingModel: bot.pricingModel,
          },
        },
      };
    } catch (error) {
      return {
        success: true,
        result: {
          hasAccess: false,
          allowed: false,
          botId,
          tenantId,
          reason:
            error instanceof Error
              ? `Marketplace bot not available: ${error.message}`
              : 'Marketplace bot not available.',
          subscription: null,
        },
      };
    }
  }

  private async getLicenseLimits(tenantId: string): Promise<ToolResult> {
    const tenantStatus = await this.licensesService.getTenantStatus(tenantId);
    const features = this.normalizeFeatures(tenantStatus.features);

    const maxBots = this.readNumberFeature(features, ['maxBots', 'max_bots']);
    const maxRunners = this.readNumberFeature(features, ['maxRunners', 'max_runners']);
    const maxConcurrentRuns = this.readNumberFeature(features, [
      'maxConcurrentRuns',
      'max_concurrent_runs',
    ]);
    const maxRunsPerMonth = this.readNumberFeature(features, [
      'maxRunsPerMonth',
      'max_runs_per_month',
      'maxExecutionsPerMonth',
    ]);
    const maxStudios = this.readNumberFeature(features, ['maxStudios', 'max_studios']);
    const maxDevelopers = this.readNumberFeature(features, ['maxDevelopers', 'max_developers']);

    const result = {
      tenantId,
      licenseType: tenantStatus.type,
      licenseStatus: tenantStatus.status,
      isActive: tenantStatus.isActive,
      maxNodes: maxBots,
      maxWorkflows: maxBots,
      maxExecutionsPerMonth: maxRunsPerMonth,
      maxRunners,
      maxStudios,
      maxDevelopers,
      maxConcurrentRuns,
      maxBots,
      maxRunsPerMonth,
      allowMarketplace: this.readBooleanFeature(features, FEATURE_ACCESS_KEYS.marketplace),
      allowCustomNodes: this.readBooleanFeature(features, FEATURE_ACCESS_KEYS.custom_nodes),
      allowAIPlanner: this.readBooleanFeature(features, FEATURE_ACCESS_KEYS.ai_planner),
      allowComplianceTools: this.readBooleanFeature(features, FEATURE_ACCESS_KEYS.compliance_tools),
      allowApiAccess: this.readBooleanFeature(features, FEATURE_ACCESS_KEYS.api_access),
    };

    return {
      success: true,
      result,
    };
  }

  private async checkFeatureAccess(tenantId: string, feature: string): Promise<ToolResult> {
    const normalizedFeature = feature.trim().toLowerCase();
    const tenantStatus = await this.licensesService.getTenantStatus(tenantId);
    const features = this.normalizeFeatures(tenantStatus.features);

    const featureKeys = FEATURE_ACCESS_KEYS[normalizedFeature] ?? [normalizedFeature];
    const hasAccess = tenantStatus.isActive && this.readBooleanFeature(features, featureKeys);

    return {
      success: true,
      result: {
        hasAccess,
        allowed: hasAccess,
        feature: normalizedFeature,
        requiredTier: this.requiredTierForFeature(normalizedFeature),
        currentTier: tenantStatus.type,
        tenantId,
        reason: hasAccess
          ? 'Feature enabled by tenant license.'
          : 'Feature not enabled or tenant license inactive.',
      },
    };
  }

  // ============================================================
  // Resource Implementations
  // ============================================================

  private async getOrchestratorLicenseResource(tenantId: string): Promise<ResourceContent> {
    const tenantStatus = await this.licensesService.getTenantStatus(tenantId);
    const limitsResult = await this.getLicenseLimits(tenantId);

    return {
      uri: `licenses://tenant/${tenantId}/orchestrator`,
      content: JSON.stringify(
        {
          tenantId,
          status: tenantStatus.status,
          tier: tenantStatus.type,
          isActive: tenantStatus.isActive,
          validFrom: tenantStatus.validFrom,
          validUntil: tenantStatus.validUntil,
          limits: limitsResult.success ? limitsResult.result : null,
        },
        null,
        2,
      ),
      mimeType: 'application/json',
    };
  }

  private async getStudioLicensesResource(tenantId: string): Promise<ResourceContent> {
    const tenantStatus = await this.licensesService.getTenantStatus(tenantId);
    const limitsResult = await this.getLicenseLimits(tenantId);

    return {
      uri: `licenses://tenant/${tenantId}/studios`,
      content: JSON.stringify(
        {
          tenantId,
          mode: 'tenant_entitlement',
          licenseStatus: tenantStatus.status,
          isActive: tenantStatus.isActive,
          maxStudios: limitsResult.result?.maxStudios ?? null,
          note: 'Studio access is enforced at tenant license level.',
        },
        null,
        2,
      ),
      mimeType: 'application/json',
    };
  }

  private async getRunnerLicensesResource(tenantId: string): Promise<ResourceContent> {
    const tenantStatus = await this.licensesService.getTenantStatus(tenantId);
    const limitsResult = await this.getLicenseLimits(tenantId);

    return {
      uri: `licenses://tenant/${tenantId}/runners`,
      content: JSON.stringify(
        {
          tenantId,
          licenseStatus: tenantStatus.status,
          isActive: tenantStatus.isActive,
          maxRunners: limitsResult.result?.maxRunners ?? null,
          maxConcurrentRuns: limitsResult.result?.maxConcurrentRuns ?? null,
        },
        null,
        2,
      ),
      mimeType: 'application/json',
    };
  }

  private async getLimitsResource(tenantId: string): Promise<ResourceContent> {
    const limits = await this.getLicenseLimits(tenantId);

    return {
      uri: `licenses://tenant/${tenantId}/limits`,
      content: JSON.stringify(limits.result, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getFeaturesResource(): Promise<ResourceContent> {
    const featuresByTier: Record<string, string[]> = {};
    const licenseTypes = await this.lookupsService.listValuesByDomainCode(
      LOOKUP_DOMAIN_LICENSE_TYPE,
    );

    for (const licenseType of licenseTypes) {
      if (!licenseType.isActive) {
        continue;
      }

      try {
        const template = await this.licensesService.getLicenseTemplate(licenseType.code);
        featuresByTier[licenseType.code] = this.listEnabledFeatures(
          template.features as unknown as FeatureBag,
        );
      } catch (error) {
        this.logger.warn(
          `Could not resolve license template for "${licenseType.code}": ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return {
      uri: 'licenses://features',
      content: JSON.stringify(featuresByTier, null, 2),
      mimeType: 'application/json',
    };
  }

  private normalizeFeatures(features: unknown): FeatureBag {
    if (!features || typeof features !== 'object') {
      return {};
    }
    return features as FeatureBag;
  }

  private readBooleanFeature(features: FeatureBag, keys: string[]): boolean {
    for (const key of keys) {
      const value = features[key];
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'number') {
        return value > 0;
      }
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') {
          return true;
        }
        if (normalized === 'false') {
          return false;
        }
      }
    }
    return false;
  }

  private readNumberFeature(features: FeatureBag, keys: string[]): number | null {
    for (const key of keys) {
      const value = features[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return null;
  }

  private listEnabledFeatures(features: FeatureBag): string[] {
    const enabled: string[] = [];

    for (const [key, value] of Object.entries(features)) {
      if (typeof value === 'boolean' && value) {
        enabled.push(key);
      } else if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        enabled.push(key);
      }
    }

    return enabled.sort((a, b) => a.localeCompare(b));
  }

  private requiredTierForFeature(feature: string): string {
    switch (feature) {
      case 'api_access':
      case 'custom_nodes':
        return 'enterprise';
      case 'marketplace':
      case 'ai_planner':
      case 'compliance_tools':
        return 'professional';
      default:
        return 'any';
    }
  }

  private async resolveTenantIdForUser(userId: string): Promise<string | null> {
    try {
      const user = await this.usersService.findOne(userId);
      if (!user.clientId) {
        return null;
      }

      const tenants = await this.tenantsService.findAll(user.clientId);
      if (tenants.length === 0) {
        return null;
      }

      const activeTenant = tenants.find((tenant) => tenant.status === 'active');
      return (activeTenant ?? tenants[0]).id;
    } catch (error) {
      this.logger.warn(
        `Failed to resolve tenant for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
