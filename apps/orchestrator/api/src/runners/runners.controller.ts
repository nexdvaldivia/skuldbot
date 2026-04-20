import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { RunnersService } from './runners.service';
import { RunnerAuthGuard } from './guards/runner-auth.guard';
import { CurrentRunner } from './decorators/runner.decorator';
import { Runner } from './entities/runner.entity';
import {
  RegisterRunnerDto,
  UpdateRunnerDto,
  HeartbeatDto,
  ClaimJobDto,
  ReportProgressDto,
  CompleteRunDto,
  SendLogDto,
} from './dto/runner.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantId } from '../common/decorators/current-tenant.decorator';
import { Audit } from '../common/interceptors/audit.interceptor';
import { AuditAction, AuditCategory } from '../audit/entities/audit-log.entity';

type RunnerAuditRequest = {
  params?: { runnerId?: string };
  body?: { runId?: string; eventType?: string };
};

type RunnerAuditResponse = {
  id?: string;
  name?: string;
};

/**
 * Admin controller for managing runners (used by Orchestrator UI)
 */
@Controller('runners')
@UseGuards(JwtAuthGuard, TenantGuard)
export class RunnersController {
  constructor(private readonly runnersService: RunnersService) {}

  /**
   * Register a new runner
   */
  @Post('register')
  @Audit({
    category: AuditCategory.RUNNER,
    action: AuditAction.CREATE,
    resourceType: 'runner',
    getResourceId: (_req, response: RunnerAuditResponse) => response.id,
    getResourceName: (_req, response: RunnerAuditResponse) => response.name,
  })
  register(
    @TenantId() tenantId: string,
    @Body() dto: RegisterRunnerDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    return this.runnersService.register(tenantId, dto, ipAddress);
  }

  /**
   * Get all runners
   */
  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.runnersService.findAll(tenantId);
  }

  /**
   * Get runner statistics
   */
  @Get('stats')
  getStats(@TenantId() tenantId: string) {
    return this.runnersService.getStats(tenantId);
  }

  /**
   * Get a single runner
   */
  @Get(':runnerId')
  findOne(@TenantId() tenantId: string, @Param('runnerId') runnerId: string) {
    return this.runnersService.findOne(tenantId, runnerId);
  }

  /**
   * Update a runner
   */
  @Put(':runnerId')
  @Audit({
    category: AuditCategory.RUNNER,
    action: AuditAction.UPDATE,
    resourceType: 'runner',
    getResourceId: (req: RunnerAuditRequest) => req.params?.runnerId,
  })
  update(
    @TenantId() tenantId: string,
    @Param('runnerId') runnerId: string,
    @Body() dto: UpdateRunnerDto,
  ) {
    return this.runnersService.update(tenantId, runnerId, dto);
  }

  /**
   * Delete a runner
   */
  @Delete(':runnerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    category: AuditCategory.RUNNER,
    action: AuditAction.DELETE,
    resourceType: 'runner',
    getResourceId: (req: RunnerAuditRequest) => req.params?.runnerId,
  })
  remove(@TenantId() tenantId: string, @Param('runnerId') runnerId: string) {
    return this.runnersService.remove(tenantId, runnerId);
  }

  /**
   * Regenerate API key for a runner
   */
  @Post(':runnerId/regenerate-key')
  @Audit({
    category: AuditCategory.SECURITY,
    action: AuditAction.REGENERATE,
    resourceType: 'runner',
    getResourceId: (req: RunnerAuditRequest) => req.params?.runnerId,
  })
  regenerateApiKey(
    @TenantId() tenantId: string,
    @Param('runnerId') runnerId: string,
  ) {
    return this.runnersService.regenerateApiKey(tenantId, runnerId);
  }
}

/**
 * Runner agent controller (used by Runner agents)
 * All endpoints require runner authentication via API key
 */
@Controller('runner-agent')
@UseGuards(RunnerAuthGuard)
export class RunnerAgentController {
  constructor(private readonly runnersService: RunnersService) {}

  /**
   * Send heartbeat
   */
  @Post('heartbeat')
  heartbeat(@CurrentRunner() runner: Runner, @Body() dto: HeartbeatDto) {
    return this.runnersService.heartbeat(runner, dto);
  }

  /**
   * Get pending jobs available for this runner
   */
  @Get('jobs')
  getPendingJobs(@CurrentRunner() runner: Runner) {
    return this.runnersService.getPendingJobs(runner);
  }

  /**
   * Claim a job
   */
  @Post('jobs/claim')
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.ASSIGN,
    resourceType: 'run',
    getResourceId: (req: RunnerAuditRequest) => req.body?.runId,
  })
  claimJob(@CurrentRunner() runner: Runner, @Body() dto: ClaimJobDto) {
    return this.runnersService.claimJob(runner, dto.runId);
  }

  /**
   * Report progress on a step
   */
  @Post('progress')
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.UPDATE,
    resourceType: 'run',
    getResourceId: (req: RunnerAuditRequest) => req.body?.runId,
    // Record only error progress events to avoid excessive audit volume.
    skipAudit: (req: RunnerAuditRequest) =>
      req.body?.eventType !== 'step_error',
  })
  reportProgress(
    @CurrentRunner() runner: Runner,
    @Body() dto: ReportProgressDto,
  ) {
    return this.runnersService.reportProgress(runner, dto);
  }

  /**
   * Send a log entry for real-time streaming
   */
  @Post('log')
  @HttpCode(HttpStatus.ACCEPTED)
  sendLog(@CurrentRunner() runner: Runner, @Body() dto: SendLogDto) {
    return this.runnersService.sendLog(runner, dto);
  }

  /**
   * Complete a run
   */
  @Post('complete')
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.EXECUTE,
    resourceType: 'run',
    getResourceId: (req: RunnerAuditRequest) => req.body?.runId,
  })
  completeRun(@CurrentRunner() runner: Runner, @Body() dto: CompleteRunDto) {
    return this.runnersService.completeRun(runner, dto);
  }
}
