import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { SchedulerService } from './scheduler.service';
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
  CreateScheduleDto,
  UpdateScheduleDto,
  PauseScheduleDto,
  ResumeScheduleDto,
  TriggerScheduleDto,
  CreateWebhookTriggerDto,
  UpdateWebhookTriggerDto,
  RevokeWebhookTriggerDto,
  CreateEventTriggerDto,
  UpdateEventTriggerDto,
  ListSchedulesQueryDto,
  ListScheduleExecutionsQueryDto,
  ListWebhookTriggersQueryDto,
  ListEventTriggersQueryDto,
  ScheduleDetailDto,
  WebhookTriggerDto,
  EventTriggerDto,
  PaginatedSchedulesDto,
  PaginatedScheduleExecutionsDto,
  ScheduleStatsDto,
  TriggerResultDto,
} from './dto/schedule.dto';

/**
 * Schedules Controller.
 *
 * Provides REST API endpoints for schedule management.
 *
 * Schedule CRUD:
 * - POST   /schedules                          - Create a new schedule
 * - GET    /schedules                          - List schedules with filtering
 * - GET    /schedules/stats                    - Get schedule statistics
 * - GET    /schedules/:id                      - Get schedule details
 * - PATCH  /schedules/:id                      - Update a schedule
 * - DELETE /schedules/:id                      - Delete a schedule
 *
 * Schedule Lifecycle:
 * - POST   /schedules/:id/activate             - Activate a schedule
 * - POST   /schedules/:id/pause                - Pause a schedule
 * - POST   /schedules/:id/resume               - Resume a paused schedule
 * - POST   /schedules/:id/disable              - Disable a schedule
 * - POST   /schedules/:id/trigger              - Manually trigger a schedule
 *
 * Execution History:
 * - GET    /schedules/:id/executions           - Get execution history
 *
 * Webhook Triggers:
 * - POST   /schedules/:id/webhooks             - Create webhook trigger
 * - GET    /schedules/:id/webhooks             - List webhook triggers
 * - PATCH  /schedules/:id/webhooks/:wid        - Update webhook trigger
 * - POST   /schedules/:id/webhooks/:wid/revoke - Revoke webhook trigger
 *
 * Event Triggers:
 * - POST   /schedules/:id/events               - Create event trigger
 * - GET    /schedules/:id/events               - List event triggers
 * - PATCH  /schedules/:id/events/:eid          - Update event trigger
 * - DELETE /schedules/:id/events/:eid          - Delete event trigger
 */
@Controller('schedules')
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  // ============================================================================
  // SCHEDULE CRUD
  // ============================================================================

  /**
   * Create a new schedule.
   */
  @Post()
  @RequirePermissions('schedules:create')
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.CREATE,
    resourceType: 'schedule',
    getResourceId: (_req, res) => res?.id,
  })
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateScheduleDto,
  ): Promise<ScheduleDetailDto> {
    return this.schedulesService.create(tenantId, user.id, dto);
  }

  /**
   * List schedules with filtering.
   */
  @Get()
  @RequirePermissions('schedules:read')
  async findAll(
    @TenantId() tenantId: string,
    @Query() query: ListSchedulesQueryDto,
  ): Promise<PaginatedSchedulesDto> {
    return this.schedulesService.findAll(tenantId, query);
  }

  /**
   * Get schedule statistics.
   */
  @Get('stats')
  @RequirePermissions('schedules:read')
  async getStats(
    @TenantId() tenantId: string,
    @Query('botId') botId?: string,
  ): Promise<ScheduleStatsDto> {
    return this.schedulesService.getStats(tenantId, botId);
  }

  /**
   * Get schedule details.
   */
  @Get(':id')
  @RequirePermissions('schedules:read')
  async findOne(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) scheduleId: string,
  ): Promise<ScheduleDetailDto> {
    return this.schedulesService.findOne(tenantId, scheduleId);
  }

  /**
   * Update a schedule.
   */
  @Patch(':id')
  @RequirePermissions('schedules:update')
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.UPDATE,
    resourceType: 'schedule',
    getResourceId: (req) => req.params.id,
  })
  async update(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) scheduleId: string,
    @Body() dto: UpdateScheduleDto,
  ): Promise<ScheduleDetailDto> {
    return this.schedulesService.update(tenantId, scheduleId, user.id, dto);
  }

  /**
   * Delete a schedule.
   */
  @Delete(':id')
  @RequirePermissions('schedules:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.DELETE,
    resourceType: 'schedule',
    getResourceId: (req) => req.params.id,
  })
  async delete(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) scheduleId: string,
  ): Promise<void> {
    return this.schedulesService.delete(tenantId, scheduleId, user.id);
  }

  // ============================================================================
  // SCHEDULE LIFECYCLE
  // ============================================================================

  /**
   * Activate a schedule.
   */
  @Post(':id/activate')
  @RequirePermissions('schedules:manage')
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.UPDATE,
    resourceType: 'schedule',
    getResourceId: (req) => req.params.id,
  })
  async activate(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) scheduleId: string,
  ): Promise<ScheduleDetailDto> {
    return this.schedulesService.activate(tenantId, scheduleId, user.id);
  }

  /**
   * Pause a schedule.
   */
  @Post(':id/pause')
  @RequirePermissions('schedules:manage')
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.UPDATE,
    resourceType: 'schedule',
    getResourceId: (req) => req.params.id,
  })
  async pause(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) scheduleId: string,
    @Body() dto: PauseScheduleDto,
  ): Promise<ScheduleDetailDto> {
    return this.schedulesService.pause(tenantId, scheduleId, user.id, dto);
  }

  /**
   * Resume a paused schedule.
   */
  @Post(':id/resume')
  @RequirePermissions('schedules:manage')
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.UPDATE,
    resourceType: 'schedule',
    getResourceId: (req) => req.params.id,
  })
  async resume(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) scheduleId: string,
    @Body() dto: ResumeScheduleDto,
  ): Promise<ScheduleDetailDto> {
    return this.schedulesService.resume(tenantId, scheduleId, user.id, dto);
  }

  /**
   * Disable a schedule.
   */
  @Post(':id/disable')
  @RequirePermissions('schedules:manage')
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.UPDATE,
    resourceType: 'schedule',
    getResourceId: (req) => req.params.id,
  })
  async disable(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) scheduleId: string,
    @Body('reason') reason?: string,
  ): Promise<ScheduleDetailDto> {
    return this.schedulesService.disable(tenantId, scheduleId, user.id, reason);
  }

  /**
   * Manually trigger a schedule.
   */
  @Post(':id/trigger')
  @RequirePermissions('schedules:trigger')
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.CREATE,
    resourceType: 'schedule_execution',
    getResourceId: (_req, res) => res?.runId,
  })
  async trigger(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) scheduleId: string,
    @Body() dto: TriggerScheduleDto,
  ): Promise<TriggerResultDto> {
    return this.schedulesService.triggerNow(tenantId, scheduleId, user.id, dto);
  }

  // ============================================================================
  // EXECUTION HISTORY
  // ============================================================================

  /**
   * Get execution history for a schedule.
   */
  @Get(':id/executions')
  @RequirePermissions('schedules:read')
  async getExecutions(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) scheduleId: string,
    @Query() query: ListScheduleExecutionsQueryDto,
  ): Promise<PaginatedScheduleExecutionsDto> {
    return this.schedulesService.getExecutions(tenantId, scheduleId, query);
  }

  // ============================================================================
  // WEBHOOK TRIGGERS
  // ============================================================================

  /**
   * Create a webhook trigger for a schedule.
   */
  @Post(':id/webhooks')
  @RequirePermissions('schedules:manage')
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.CREATE,
    resourceType: 'webhook_trigger',
    getResourceId: (_req, res) => res?.id,
  })
  async createWebhook(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) scheduleId: string,
    @Body() dto: CreateWebhookTriggerDto,
  ): Promise<WebhookTriggerDto> {
    return this.schedulesService.createWebhookTrigger(
      tenantId,
      scheduleId,
      user.id,
      dto,
    );
  }

  /**
   * List webhook triggers for a schedule.
   */
  @Get(':id/webhooks')
  @RequirePermissions('schedules:read')
  async getWebhooks(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) scheduleId: string,
    @Query() query: ListWebhookTriggersQueryDto,
  ): Promise<WebhookTriggerDto[]> {
    return this.schedulesService.getWebhookTriggers(tenantId, scheduleId, query);
  }

  /**
   * Update a webhook trigger.
   */
  @Patch(':id/webhooks/:webhookId')
  @RequirePermissions('schedules:manage')
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.UPDATE,
    resourceType: 'webhook_trigger',
    getResourceId: (req) => req.params.webhookId,
  })
  async updateWebhook(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) scheduleId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @Body() dto: UpdateWebhookTriggerDto,
  ): Promise<WebhookTriggerDto> {
    return this.schedulesService.updateWebhookTrigger(
      tenantId,
      scheduleId,
      webhookId,
      dto,
    );
  }

  /**
   * Revoke a webhook trigger.
   */
  @Post(':id/webhooks/:webhookId/revoke')
  @RequirePermissions('schedules:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    category: AuditCategory.SECURITY,
    action: AuditAction.REVOKE,
    resourceType: 'webhook_trigger',
    getResourceId: (req) => req.params.webhookId,
  })
  async revokeWebhook(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) scheduleId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @Body() dto: RevokeWebhookTriggerDto,
  ): Promise<void> {
    return this.schedulesService.revokeWebhookTrigger(
      tenantId,
      scheduleId,
      webhookId,
      user.id,
      dto,
    );
  }

  // ============================================================================
  // EVENT TRIGGERS
  // ============================================================================

  /**
   * Create an event trigger for a schedule.
   */
  @Post(':id/events')
  @RequirePermissions('schedules:manage')
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.CREATE,
    resourceType: 'event_trigger',
    getResourceId: (_req, res) => res?.id,
  })
  async createEventTrigger(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) scheduleId: string,
    @Body() dto: CreateEventTriggerDto,
  ): Promise<EventTriggerDto> {
    return this.schedulesService.createEventTrigger(
      tenantId,
      scheduleId,
      user.id,
      dto,
    );
  }

  /**
   * List event triggers for a schedule.
   */
  @Get(':id/events')
  @RequirePermissions('schedules:read')
  async getEventTriggers(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) scheduleId: string,
    @Query() query: ListEventTriggersQueryDto,
  ): Promise<EventTriggerDto[]> {
    return this.schedulesService.getEventTriggers(tenantId, scheduleId, query);
  }

  /**
   * Update an event trigger.
   */
  @Patch(':id/events/:eventId')
  @RequirePermissions('schedules:manage')
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.UPDATE,
    resourceType: 'event_trigger',
    getResourceId: (req) => req.params.eventId,
  })
  async updateEventTrigger(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) scheduleId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateEventTriggerDto,
  ): Promise<EventTriggerDto> {
    return this.schedulesService.updateEventTrigger(
      tenantId,
      scheduleId,
      eventId,
      dto,
    );
  }

  /**
   * Delete an event trigger.
   */
  @Delete(':id/events/:eventId')
  @RequirePermissions('schedules:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.DELETE,
    resourceType: 'event_trigger',
    getResourceId: (req) => req.params.eventId,
  })
  async deleteEventTrigger(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) scheduleId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<void> {
    return this.schedulesService.deleteEventTrigger(
      tenantId,
      scheduleId,
      eventId,
    );
  }
}

/**
 * Bot Schedules Controller.
 *
 * Provides bot-scoped schedule endpoints.
 */
@Controller('bots/:botId/schedules')
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
export class BotSchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  /**
   * Create schedule for a specific bot.
   */
  @Post()
  @RequirePermissions('schedules:create')
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    category: AuditCategory.EXECUTION,
    action: AuditAction.CREATE,
    resourceType: 'schedule',
    getResourceId: (_req, res) => res?.id,
  })
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Body() dto: Omit<CreateScheduleDto, 'botId'>,
  ): Promise<ScheduleDetailDto> {
    return this.schedulesService.create(tenantId, user.id, { ...dto, botId });
  }

  /**
   * List schedules for a specific bot.
   */
  @Get()
  @RequirePermissions('schedules:read')
  async findAll(
    @TenantId() tenantId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Query() query: ListSchedulesQueryDto,
  ): Promise<PaginatedSchedulesDto> {
    return this.schedulesService.findAll(tenantId, { ...query, botId });
  }

  /**
   * Get schedule statistics for a specific bot.
   */
  @Get('stats')
  @RequirePermissions('schedules:read')
  async getStats(
    @TenantId() tenantId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
  ): Promise<ScheduleStatsDto> {
    return this.schedulesService.getStats(tenantId, botId);
  }
}

/**
 * Scheduler Admin Controller.
 *
 * Provides administrative endpoints for scheduler management.
 * Requires admin permissions.
 *
 * Endpoints:
 * - GET  /scheduler/status    - Get scheduler health and metrics
 * - POST /scheduler/tick      - Force a scheduler tick (debugging)
 */
@Controller('scheduler')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SchedulerAdminController {
  constructor(
    private readonly schedulerService: SchedulerService,
  ) {}

  /**
   * Get scheduler status and health metrics.
   */
  @Get('status')
  @RequirePermissions('schedules:admin')
  getStatus(): {
    running: boolean;
    isLeader: boolean;
    instanceId: string;
    tickIntervalMs: number;
    startedAt: Date | null;
    lastTick: {
      processed: number;
      triggered: number;
      skipped: number;
      errors: number;
      duration: number;
    } | null;
    metrics: {
      totalTicks: number;
      totalTriggered: number;
      totalErrors: number;
    };
  } {
    return this.schedulerService.getStatus();
  }

  /**
   * Force a scheduler tick (for debugging/testing).
   * Only works on leader instance.
   */
  @Post('tick')
  @RequirePermissions('schedules:admin')
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.SYSTEM,
    action: AuditAction.CREATE,
    resourceType: 'scheduler_tick',
  })
  async forceTick(): Promise<{
    processed: number;
    triggered: number;
    skipped: number;
    errors: number;
    duration: number;
  } | null> {
    return this.schedulerService.forceTick();
  }
}
