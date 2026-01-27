import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Control Plane Client
 * 
 * HTTP client for Orchestrator to communicate with Control Plane MCP.
 * Used for:
 * - Reporting usage metrics (metering)
 * - Validating licenses
 * - Fetching marketplace bots
 * - Submitting billing data
 */
@Injectable()
export class ControlPlaneClient {
  private controlPlaneUrl: string;
  private tenantId: string;
  private apiKey: string;

  constructor(private configService: ConfigService) {
    this.controlPlaneUrl = configService.get<string>(
      'CONTROL_PLANE_URL',
      'http://localhost:3000',
    );
    this.tenantId = configService.get<string>('TENANT_ID', 'default-tenant');
    this.apiKey = configService.get<string>('CONTROL_PLANE_API_KEY', 'dev-key');
  }

  /**
   * Report bot execution for metering
   */
  async reportBotExecution(execution: {
    botId: string;
    executionId: string;
    startTime: string;
    endTime: string;
    status: 'success' | 'failed' | 'timeout';
    metrics: {
      claimsCompleted?: number;
      apiCalls?: number;
      recordsProcessed?: number;
    };
  }): Promise<any> {
    return await this.callTool('report_bot_execution', {
      tenantId: this.tenantId,
      ...execution,
    });
  }

  /**
   * Report runner heartbeat
   */
  async reportRunnerHeartbeat(heartbeat: {
    runnerId: string;
    type: 'attended' | 'unattended';
    status?: 'active' | 'idle' | 'error';
  }): Promise<any> {
    return await this.callTool('report_runner_heartbeat', {
      tenantId: this.tenantId,
      ...heartbeat,
    });
  }

  /**
   * Get current usage
   */
  async getCurrentUsage(botId: string): Promise<any> {
    return await this.callTool('get_current_usage', {
      tenantId: this.tenantId,
      botId,
    });
  }

  /**
   * Validate license feature
   */
  async validateLicenseFeature(
    feature: string,
    context?: Record<string, any>,
  ): Promise<any> {
    return await this.callTool('validate_license_feature', {
      tenantId: this.tenantId,
      feature,
      context,
    });
  }

  /**
   * Check entitlement
   */
  async checkEntitlement(resourceType: string, requestedCount: number): Promise<any> {
    return await this.callTool('check_entitlement', {
      tenantId: this.tenantId,
      resourceType,
      requestedCount,
    });
  }

  /**
   * Search marketplace
   */
  async searchMarketplace(query: {
    searchQuery?: string;
    category?: string;
    industry?: string;
    limit?: number;
  }): Promise<any> {
    return await this.callTool('search_marketplace', {
      tenantId: this.tenantId,
      ...query,
    });
  }

  /**
   * Get bot from marketplace
   */
  async getMarketplaceBot(botId: string): Promise<any> {
    return await this.callTool('get_bot_details', {
      botId,
    });
  }

  /**
   * Download bot
   */
  async downloadBot(botId: string, version?: string): Promise<any> {
    return await this.callTool('download_bot', {
      tenantId: this.tenantId,
      botId,
      version,
    });
  }

  /**
   * Subscribe to bot
   */
  async subscribeToBot(botId: string, pricingTier?: string): Promise<any> {
    return await this.callTool('subscribe_to_bot', {
      tenantId: this.tenantId,
      botId,
      pricingTier,
    });
  }

  /**
   * Unsubscribe from bot
   */
  async unsubscribeFromBot(botId: string): Promise<any> {
    return await this.callTool('unsubscribe_from_bot', {
      tenantId: this.tenantId,
      botId,
    });
  }

  /**
   * Get subscribed bots
   */
  async getSubscribedBots(): Promise<any> {
    return await this.callTool('list_subscribed_bots', {
      tenantId: this.tenantId,
    });
  }

  /**
   * Generic tool call to Control Plane MCP
   */
  private async callTool(
    toolName: string,
    args: Record<string, any>,
  ): Promise<any> {
    try {
      const response = await fetch(
        `${this.controlPlaneUrl}/api/v1/mcp/tools/call`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'x-tenant-id': this.tenantId,
          },
          body: JSON.stringify({
            name: toolName,
            arguments: args,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Control Plane API error: ${response.status} ${response.statusText}`,
        );
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(
          `Control Plane tool call failed: ${result.error || 'Unknown error'}`,
        );
      }

      return result.result;
    } catch (error) {
      console.error(`Failed to call Control Plane tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Read a resource from Control Plane MCP
   */
  async readResource(uri: string): Promise<any> {
    try {
      const encodedUri = encodeURIComponent(uri);
      const response = await fetch(
        `${this.controlPlaneUrl}/api/v1/mcp/resources/${encodedUri}`,
        {
          method: 'GET',
          headers: {
            'x-api-key': this.apiKey,
            'x-tenant-id': this.tenantId,
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Control Plane API error: ${response.status} ${response.statusText}`,
        );
      }

      const resource = await response.json();
      return resource;
    } catch (error) {
      console.error(`Failed to read Control Plane resource ${uri}:`, error);
      throw error;
    }
  }

  /**
   * Get Control Plane capabilities
   */
  async getCapabilities(): Promise<any> {
    try {
      const response = await fetch(
        `${this.controlPlaneUrl}/api/v1/mcp/capabilities`,
        {
          method: 'GET',
          headers: {
            'x-api-key': this.apiKey,
            'x-tenant-id': this.tenantId,
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Control Plane API error: ${response.status} ${response.statusText}`,
        );
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get Control Plane capabilities:', error);
      throw error;
    }
  }
}

