import { Module } from '@nestjs/common';
import { MCPController } from './mcp.controller';
import { ComplianceServer } from './servers/compliance.server';
import { WorkflowServer } from './servers/workflow.server';
import { MCPGuard } from './guards/mcp.guard';
import { ControlPlaneClient } from './clients/control-plane.client';
import { BYOMService } from './services/byom.service';

/**
 * MCP Module for Orchestrator
 * 
 * Provides tenant-specific MCP services:
 * - Compliance (PHI/PII classification, audit, LLM routing)
 * - Workflows (templates, customization, cloning)
 * - BYOM (Bring Your Own Model - 12+ LLM providers)
 * 
 * These services run in the tenant's VPC for data residency compliance.
 */
@Module({
  controllers: [MCPController],
  providers: [
    ComplianceServer,
    WorkflowServer,
    BYOMService,
    MCPGuard,
    ControlPlaneClient,
  ],
  exports: [ComplianceServer, WorkflowServer, BYOMService, ControlPlaneClient],
})
export class MCPModule {}

