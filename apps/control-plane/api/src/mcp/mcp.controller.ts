import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { LicensingServer } from './servers/licensing.server';
import { MarketplaceServer } from './servers/marketplace.server';
import { MeteringServer } from './servers/metering.server';
import { BillingServer } from './servers/billing.server';
import { ToolCallDto, MCPCapabilitiesDto } from './dto/tool-call.dto';

/**
 * MCP Controller for Control Plane
 * 
 * Exposes MCP servers via REST API
 * Endpoints:
 * - GET  /api/v1/mcp/tools
 * - GET  /api/v1/mcp/resources
 * - POST /api/v1/mcp/tools/call
 * - GET  /api/v1/mcp/resources/:uri
 * - GET  /api/v1/mcp/capabilities
 */
@Controller('api/v1/mcp')
export class MCPController {
  constructor(
    private readonly licensingServer: LicensingServer,
    private readonly marketplaceServer: MarketplaceServer,
    private readonly meteringServer: MeteringServer,
    private readonly billingServer: BillingServer,
  ) {}

  /**
   * List all available tools from all servers
   */
  @Get('tools')
  async listTools() {
    const tools = [
      ...this.licensingServer.getTools(),
      ...this.marketplaceServer.getTools(),
      ...this.meteringServer.getTools(),
      ...this.billingServer.getTools(),
    ];

    return {
      tools,
      total: tools.length,
    };
  }

  /**
   * List all available resources from all servers
   */
  @Get('resources')
  async listResources() {
    const resources = [
      ...this.licensingServer.getResources(),
      ...this.marketplaceServer.getResources(),
      ...this.meteringServer.getResources(),
      ...this.billingServer.getResources(),
    ];

    return {
      resources,
      total: resources.length,
    };
  }

  /**
   * Call a tool
   */
  @Post('tools/call')
  async callTool(@Body() toolCall: ToolCallDto) {
    // Route to the appropriate server based on tool name
    const toolName = toolCall.name;

    // Licensing tools
    if (
      toolName.startsWith('validate_') ||
      toolName.startsWith('check_') ||
      toolName.startsWith('get_license_')
    ) {
      return await this.licensingServer.executeTool(toolCall);
    }

    // Marketplace tools
    if (
      toolName.startsWith('search_marketplace') ||
      toolName.startsWith('get_bot_') ||
      toolName.startsWith('subscribe_') ||
      toolName.startsWith('unsubscribe_') ||
      toolName.startsWith('list_subscribed_') ||
      toolName.startsWith('download_bot') ||
      toolName.startsWith('list_partner_')
    ) {
      return await this.marketplaceServer.executeTool(toolCall);
    }

    // Metering tools
    if (
      toolName.startsWith('report_') ||
      toolName.startsWith('get_current_usage') ||
      toolName.startsWith('get_tenant_usage') ||
      toolName.startsWith('get_active_runners') ||
      toolName.startsWith('reset_usage')
    ) {
      return await this.meteringServer.executeTool(toolCall);
    }

    // Billing tools
    if (
      toolName.startsWith('calculate_invoice') ||
      toolName.startsWith('get_invoice') ||
      toolName.startsWith('list_invoices')
    ) {
      return await this.billingServer.executeTool(toolCall);
    }

    return {
      success: false,
      error: `Unknown tool: ${toolName}`,
    };
  }

  /**
   * Read a resource
   */
  @Get('resources/*')
  async readResource(@Param('0') uri: string) {
    // Reconstruct full URI
    const fullUri = uri;

    // Route to the appropriate server based on URI prefix
    if (fullUri.startsWith('licenses://')) {
      return await this.licensingServer.readResource(fullUri);
    }

    if (fullUri.startsWith('marketplace://')) {
      return await this.marketplaceServer.readResource(fullUri);
    }

    if (fullUri.startsWith('metering://')) {
      return await this.meteringServer.readResource(fullUri);
    }

    if (fullUri.startsWith('billing://')) {
      return await this.billingServer.readResource(fullUri);
    }

    return {
      error: `Unknown resource URI prefix: ${fullUri}`,
    };
  }

  /**
   * Get full capabilities
   */
  @Get('capabilities')
  async getCapabilities(): Promise<MCPCapabilitiesDto> {
    const tools = await this.listTools();
    const resources = await this.listResources();

    return {
      tools: tools.tools,
      resources: resources.resources,
      metadata: {
        name: 'skuldbot-control-plane-mcp',
        version: '1.0.0',
        description:
          'Model Context Protocol server for SkuldBot Control Plane (Licensing, Marketplace, Metering, Billing)',
        vendor: 'Skuld, LLC',
      },
    };
  }

  /**
   * Health check (readiness probe)
   */
  @Get('health')
  async health() {
    const checks = {
      licensing: await this.checkServerHealth(this.licensingServer),
      marketplace: await this.checkServerHealth(this.marketplaceServer),
      metering: await this.checkServerHealth(this.meteringServer),
      billing: await this.checkServerHealth(this.billingServer),
    };

    const allHealthy = Object.values(checks).every((c) => c === 'healthy');

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      servers: checks,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB',
      },
    };
  }

  /**
   * Liveness probe (is the process alive?)
   */
  @Get('health/live')
  async healthLive() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Startup probe (is the server ready to accept traffic?)
   */
  @Get('health/ready')
  async healthReady() {
    // Check if all servers can respond
    try {
      await Promise.all([
        this.licensingServer.getTools(),
        this.marketplaceServer.getTools(),
        this.meteringServer.getTools(),
        this.billingServer.getTools(),
      ]);

      return {
        status: 'ready',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'not_ready',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async checkServerHealth(server: any): Promise<string> {
    try {
      // Simple health check: can the server respond?
      const tools = server.getTools();
      return tools.length > 0 ? 'healthy' : 'unhealthy';
    } catch {
      return 'unhealthy';
    }
  }
}

