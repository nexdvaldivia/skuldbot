import { Injectable } from '@nestjs/common';
import {
  Tool,
  Resource,
  ToolResult,
  ResourceContent,
  LicenseInfo,
} from '../types/mcp.types';

/**
 * Licensing MCP Server
 * 
 * Provides tools and resources for license validation and management.
 * Critical for Control Plane to validate what features each tenant can access.
 */
@Injectable()
export class LicensingServer {
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
        description:
          'Check if a tenant has access to a specific marketplace bot',
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
              enum: [
                'marketplace',
                'custom_nodes',
                'ai_planner',
                'compliance_tools',
                'api_access',
              ],
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
          return await this.checkBotAccess(
            toolCall.arguments.tenantId,
            toolCall.arguments.botId,
          );

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
        if (uri === 'licenses://features') {
          return await this.getFeaturesResource();
        }
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
    // TODO: Query database for license
    // For now, return mock data
    const isValid = true; // await this.licenseService.validateOrchestrator(...)

    return {
      success: true,
      result: {
        valid: isValid,
        tier: 'professional',
        expiresAt: '2026-12-31T23:59:59Z',
        maxRunners: 10,
        maxStudios: 5,
      },
    };
  }

  private async validateStudioLicense(
    userId: string,
    studioId: string,
  ): Promise<ToolResult> {
    // TODO: Query database
    const isValid = true;

    return {
      success: true,
      result: {
        valid: isValid,
        tier: 'pro',
        expiresAt: '2026-12-31T23:59:59Z',
        features: ['marketplace', 'ai_planner', 'custom_nodes'],
      },
    };
  }

  private async checkBotAccess(
    tenantId: string,
    botId: string,
  ): Promise<ToolResult> {
    // TODO: Check if tenant has subscribed to this bot
    const hasAccess = true;

    return {
      success: true,
      result: {
        hasAccess,
        subscription: {
          botId,
          subscribedAt: '2026-01-01T00:00:00Z',
          pricingModel: 'hybrid',
          status: 'active',
        },
      },
    };
  }

  private async getLicenseLimits(tenantId: string): Promise<ToolResult> {
    // TODO: Get from database based on license tier
    return {
      success: true,
      result: {
        maxNodes: 279,
        maxWorkflows: 100,
        maxExecutionsPerMonth: 10000,
        maxRunners: 10,
        maxStudios: 5,
        maxDevelopers: 5,
        allowMarketplace: true,
        allowCustomNodes: true,
        allowAIPlanner: true,
        allowComplianceTools: true,
      },
    };
  }

  private async checkFeatureAccess(
    tenantId: string,
    feature: string,
  ): Promise<ToolResult> {
    // TODO: Check license tier and feature availability
    const hasAccess = true;

    return {
      success: true,
      result: {
        hasAccess,
        feature,
        requiredTier: 'professional',
        currentTier: 'professional',
      },
    };
  }

  // ============================================================
  // Resource Implementations
  // ============================================================

  private async getOrchestratorLicenseResource(
    tenantId: string,
  ): Promise<ResourceContent> {
    // TODO: Get from database
    const license = {
      tenantId,
      tier: 'professional',
      status: 'active',
      expiresAt: '2026-12-31T23:59:59Z',
      maxRunners: 10,
      maxStudios: 5,
      features: ['marketplace', 'compliance', 'audit'],
    };

    return {
      uri: `licenses://tenant/${tenantId}/orchestrator`,
      content: JSON.stringify(license, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getStudioLicensesResource(
    tenantId: string,
  ): Promise<ResourceContent> {
    // TODO: Get from database
    const licenses = [
      {
        userId: 'user-1',
        tier: 'pro',
        expiresAt: '2026-12-31T23:59:59Z',
      },
      {
        userId: 'user-2',
        tier: 'enterprise',
        expiresAt: '2026-12-31T23:59:59Z',
      },
    ];

    return {
      uri: `licenses://tenant/${tenantId}/studios`,
      content: JSON.stringify(licenses, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getRunnerLicensesResource(
    tenantId: string,
  ): Promise<ResourceContent> {
    // TODO: Get from database
    const runners = [
      {
        runnerId: 'runner-1',
        type: 'attended',
        status: 'active',
        costPerMonth: 50,
      },
      {
        runnerId: 'runner-2',
        type: 'unattended',
        status: 'active',
        costPerMonth: 200,
      },
    ];

    return {
      uri: `licenses://tenant/${tenantId}/runners`,
      content: JSON.stringify(runners, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getLimitsResource(tenantId: string): Promise<ResourceContent> {
    // TODO: Calculate based on license tier
    const limits = {
      maxNodes: 279,
      maxWorkflows: 100,
      maxExecutionsPerMonth: 10000,
      maxRunners: 10,
      maxStudios: 5,
    };

    return {
      uri: `licenses://tenant/${tenantId}/limits`,
      content: JSON.stringify(limits, null, 2),
      mimeType: 'application/json',
    };
  }

  private async getFeaturesResource(): Promise<ResourceContent> {
    const features = {
      free: ['basic_nodes', 'local_execution'],
      professional: [
        'basic_nodes',
        'local_execution',
        'marketplace',
        'ai_planner',
        'compliance_tools',
      ],
      enterprise: [
        'basic_nodes',
        'local_execution',
        'marketplace',
        'ai_planner',
        'compliance_tools',
        'custom_nodes',
        'api_access',
        'priority_support',
      ],
    };

    return {
      uri: 'licenses://features',
      content: JSON.stringify(features, null, 2),
      mimeType: 'application/json',
    };
  }
}

