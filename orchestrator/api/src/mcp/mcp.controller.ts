import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ComplianceServer } from './servers/compliance.server';
import { WorkflowServer } from './servers/workflow.server';
import { ToolCallDto, MCPCapabilitiesDto } from './dto/tool-call.dto';

/**
 * MCP Controller for Orchestrator
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
    private readonly complianceServer: ComplianceServer,
    private readonly workflowServer: WorkflowServer,
  ) {}

  /**
   * List all available tools from all servers
   */
  @Get('tools')
  async listTools() {
    const tools = [
      ...this.complianceServer.getTools(),
      ...this.workflowServer.getTools(),
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
      ...this.complianceServer.getResources(),
      ...this.workflowServer.getResources(),
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

    // Compliance tools
    if (
      toolName.startsWith('classify_') ||
      toolName.startsWith('route_llm') ||
      toolName.startsWith('redact_') ||
      toolName.startsWith('log_audit') ||
      toolName.startsWith('check_compliance') ||
      toolName.startsWith('get_compliance')
    ) {
      return await this.complianceServer.executeTool(toolCall);
    }

    // Workflow tools
    if (
      toolName.startsWith('create_workflow') ||
      toolName.startsWith('get_workflow') ||
      toolName.startsWith('list_workflow') ||
      toolName.startsWith('update_workflow') ||
      toolName.startsWith('delete_workflow') ||
      toolName.startsWith('instantiate_') ||
      toolName.startsWith('clone_marketplace')
    ) {
      return await this.workflowServer.executeTool(toolCall);
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
    if (fullUri.startsWith('compliance://')) {
      return await this.complianceServer.readResource(fullUri);
    }

    if (fullUri.startsWith('workflow://')) {
      return await this.workflowServer.readResource(fullUri);
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
        name: 'skuldbot-orchestrator-mcp',
        version: '1.0.0',
        description:
          'Model Context Protocol server for SkuldBot Orchestrator (Compliance, Workflows)',
        vendor: 'Skuld, LLC',
      },
    };
  }

  /**
   * Health check
   */
  @Get('health')
  async health() {
    return {
      status: 'healthy',
      servers: ['compliance', 'workflow'],
      timestamp: new Date().toISOString(),
    };
  }
}

