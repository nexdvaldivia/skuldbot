import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
  StreamableFile,
} from '@nestjs/common';
import { RunsService } from './runs.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TenantId } from '../common/decorators/current-tenant.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Audit } from '../common/interceptors/audit.interceptor';
import { AuditCategory, AuditAction } from '../audit/entities/audit-log.entity';
import { User } from '../users/entities/user.entity';
import {
  CreateRunDto,
  CancelRunDto,
  PauseRunDto,
  ResumeRunDto,
  RetryRunDto,
  HitlActionDto,
  ListRunsQueryDto,
  ListRunEventsQueryDto,
  ListRunLogsQueryDto,
  ListHitlRequestsQueryDto,
  RunSummaryDto,
  RunDetailDto,
  RunEventDto,
  RunLogDto,
  RunArtifactDto,
  HitlRequestDto,
  PaginatedRunsDto,
  PaginatedRunEventsDto,
  PaginatedRunLogsDto,
  PaginatedHitlRequestsDto,
  RunStatsDto,
  RunTimelineStatsDto,
} from './dto/run.dto';

/**
 * Runs Controller.
 *
 * Provides REST API endpoints for run management.
 *
 * Run Endpoints:
 * - POST   /runs                         - Create and queue a new run
 * - GET    /runs                         - List runs with filtering
 * - GET    /runs/stats                   - Get run statistics
 * - GET    /runs/timeline                - Get timeline statistics
 * - GET    /runs/:id                     - Get run details
 * - POST   /runs/:id/cancel              - Cancel a run
 * - POST   /runs/:id/pause               - Pause a run
 * - POST   /runs/:id/resume              - Resume a paused run
 * - POST   /runs/:id/retry               - Retry a failed run
 *
 * Events & Logs:
 * - GET    /runs/:id/events              - Get run events (timeline)
 * - GET    /runs/:id/logs                - Get run logs
 *
 * Artifacts:
 * - GET    /runs/:id/artifacts           - List run artifacts
 * - GET    /runs/:id/artifacts/:aid      - Get artifact details
 * - GET    /runs/:id/artifacts/:aid/download - Download artifact
 *
 * HITL Endpoints:
 * - GET    /hitl-requests                - List pending HITL requests
 * - GET    /hitl-requests/:id            - Get HITL request details
 * - POST   /hitl-requests/:id/action     - Process HITL action
 *
 * Bot-Specific Endpoints:
 * - POST   /bots/:botId/runs             - Create run for specific bot
 * - GET    /bots/:botId/runs             - List runs for specific bot
 * - GET    /bots/:botId/runs/stats       - Get stats for specific bot
 */
@Controller('runs')
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
export class RunsController {
  constructor(private readonly runsService: RunsService) {}

  // ============================================================================
  // RUN CRUD
  // ============================================================================

  /**
   * Create and queue a new run.
   */
  @Post()
  @RequirePermissions('runs:create')
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.CREATE,
    resourceType: 'run',
    getResourceId: (_req, res) => res?.id,
  })
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateRunDto,
  ): Promise<RunDetailDto> {
    return this.runsService.create(tenantId, user.id, dto);
  }

  /**
   * List runs with filtering.
   */
  @Get()
  @RequirePermissions('runs:read')
  async findAll(
    @TenantId() tenantId: string,
    @Query() query: ListRunsQueryDto,
  ): Promise<PaginatedRunsDto> {
    return this.runsService.findAll(tenantId, query);
  }

  /**
   * Get run statistics.
   */
  @Get('stats')
  @RequirePermissions('runs:read')
  async getStats(
    @TenantId() tenantId: string,
    @Query('botId') botId?: string,
  ): Promise<RunStatsDto> {
    return this.runsService.getStats(tenantId, botId);
  }

  /**
   * Get timeline statistics.
   */
  @Get('timeline')
  @RequirePermissions('runs:read')
  async getTimelineStats(
    @TenantId() tenantId: string,
    @Query('period') period: 'hour' | 'day' | 'week' = 'day',
    @Query('botId') botId?: string,
  ): Promise<RunTimelineStatsDto> {
    return this.runsService.getTimelineStats(tenantId, period, botId);
  }

  /**
   * Get run details.
   */
  @Get(':id')
  @RequirePermissions('runs:read')
  async findOne(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) runId: string,
  ): Promise<RunDetailDto> {
    return this.runsService.findOne(tenantId, runId);
  }

  /**
   * Cancel a run.
   */
  @Post(':id/cancel')
  @RequirePermissions('runs:cancel')
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.UPDATE,
    resourceType: 'run',
    getResourceId: (req) => req.params.id,
  })
  async cancel(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) runId: string,
    @Body() dto: CancelRunDto,
  ): Promise<RunDetailDto> {
    return this.runsService.cancel(tenantId, runId, user.id, dto);
  }

  /**
   * Pause a running run.
   */
  @Post(':id/pause')
  @RequirePermissions('runs:manage')
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.UPDATE,
    resourceType: 'run',
    getResourceId: (req) => req.params.id,
  })
  async pause(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) runId: string,
    @Body() dto: PauseRunDto,
  ): Promise<RunDetailDto> {
    return this.runsService.pause(tenantId, runId, user.id, dto);
  }

  /**
   * Resume a paused run.
   */
  @Post(':id/resume')
  @RequirePermissions('runs:manage')
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.UPDATE,
    resourceType: 'run',
    getResourceId: (req) => req.params.id,
  })
  async resume(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) runId: string,
    @Body() dto: ResumeRunDto,
  ): Promise<RunDetailDto> {
    return this.runsService.resume(tenantId, runId, user.id, dto);
  }

  /**
   * Retry a failed run.
   */
  @Post(':id/retry')
  @RequirePermissions('runs:create')
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.CREATE,
    resourceType: 'run',
    getResourceId: (_req, res) => res?.id,
  })
  async retry(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) runId: string,
    @Body() dto: RetryRunDto,
  ): Promise<RunDetailDto> {
    return this.runsService.retry(tenantId, runId, user.id, dto);
  }

  // ============================================================================
  // EVENTS & LOGS
  // ============================================================================

  /**
   * Get run events (timeline).
   */
  @Get(':id/events')
  @RequirePermissions('runs:read')
  async getEvents(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) runId: string,
    @Query() query: ListRunEventsQueryDto,
  ): Promise<PaginatedRunEventsDto> {
    return this.runsService.getEvents(tenantId, runId, query);
  }

  /**
   * Get run logs.
   */
  @Get(':id/logs')
  @RequirePermissions('runs:read')
  async getLogs(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) runId: string,
    @Query() query: ListRunLogsQueryDto,
  ): Promise<PaginatedRunLogsDto> {
    return this.runsService.getLogs(tenantId, runId, query);
  }

  // ============================================================================
  // ARTIFACTS
  // ============================================================================

  /**
   * List run artifacts.
   */
  @Get(':id/artifacts')
  @RequirePermissions('runs:read')
  async getArtifacts(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) runId: string,
  ): Promise<RunArtifactDto[]> {
    return this.runsService.getArtifacts(tenantId, runId);
  }

  /**
   * Get artifact details.
   */
  @Get(':id/artifacts/:artifactId')
  @RequirePermissions('runs:read')
  async getArtifact(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) runId: string,
    @Param('artifactId', ParseUUIDPipe) artifactId: string,
  ): Promise<RunArtifactDto> {
    return this.runsService.getArtifact(tenantId, runId, artifactId);
  }

  // Note: Artifact download would require integration with storage service
  // This would be implemented in a separate storage module
}

/**
 * HITL (Human In The Loop) Controller.
 *
 * Provides REST API endpoints for HITL request management.
 */
@Controller('hitl-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
export class HitlController {
  constructor(private readonly runsService: RunsService) {}

  /**
   * List HITL requests.
   */
  @Get()
  @RequirePermissions('hitl:read')
  async findAll(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Query() query: ListHitlRequestsQueryDto,
  ): Promise<PaginatedHitlRequestsDto> {
    return this.runsService.getHitlRequests(tenantId, user.id, query);
  }

  /**
   * Get HITL request details.
   */
  @Get(':id')
  @RequirePermissions('hitl:read')
  async findOne(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) requestId: string,
  ): Promise<HitlRequestDto> {
    return this.runsService.getHitlRequest(tenantId, requestId);
  }

  /**
   * Process HITL action (approve, reject, modify, etc.).
   */
  @Post(':id/action')
  @RequirePermissions('hitl:manage')
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.UPDATE,
    resourceType: 'hitl_request',
    getResourceId: (req) => req.params.id,
  })
  async processAction(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) requestId: string,
    @Body() dto: HitlActionDto,
  ): Promise<HitlRequestDto> {
    return this.runsService.processHitlAction(tenantId, requestId, user.id, dto);
  }
}

/**
 * Bot Runs Controller.
 *
 * Provides bot-scoped run endpoints.
 */
@Controller('bots/:botId/runs')
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
export class BotRunsController {
  constructor(private readonly runsService: RunsService) {}

  /**
   * Create run for a specific bot.
   */
  @Post()
  @RequirePermissions('runs:create')
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.CREATE,
    resourceType: 'run',
    getResourceId: (_req, res) => res?.id,
  })
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Body() dto: Omit<CreateRunDto, 'botId'>,
  ): Promise<RunDetailDto> {
    return this.runsService.create(tenantId, user.id, { ...dto, botId });
  }

  /**
   * List runs for a specific bot.
   */
  @Get()
  @RequirePermissions('runs:read')
  async findAll(
    @TenantId() tenantId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Query() query: ListRunsQueryDto,
  ): Promise<PaginatedRunsDto> {
    return this.runsService.findAll(tenantId, { ...query, botId });
  }

  /**
   * Get run statistics for a specific bot.
   */
  @Get('stats')
  @RequirePermissions('runs:read')
  async getStats(
    @TenantId() tenantId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
  ): Promise<RunStatsDto> {
    return this.runsService.getStats(tenantId, botId);
  }

  /**
   * Get timeline statistics for a specific bot.
   */
  @Get('timeline')
  @RequirePermissions('runs:read')
  async getTimelineStats(
    @TenantId() tenantId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Query('period') period: 'hour' | 'day' | 'week' = 'day',
  ): Promise<RunTimelineStatsDto> {
    return this.runsService.getTimelineStats(tenantId, period, botId);
  }
}
