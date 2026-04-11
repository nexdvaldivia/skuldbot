import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CP_PERMISSIONS } from '../common/authz/permissions';
import { UserRole } from '../users/entities/user.entity';
import { OrchestratorFleetAuthGuard } from './guards/orchestrator-fleet-auth.guard';
import { OrchestratorsService } from './orchestrators.service';
import {
  DeregisterOrchestratorDto,
  FleetHeartbeatResponseDto,
  FleetRegistrationResponseDto,
  OrchestratorHealthResponseDto,
  OrchestratorHeartbeatDto,
  RegisterOrchestratorDto,
} from './dto/orchestrator.dto';

@Controller('orchestrators')
export class OrchestratorsController {
  constructor(private readonly orchestratorsService: OrchestratorsService) {}

  @Post('register')
  @UseGuards(OrchestratorFleetAuthGuard)
  async register(
    @Body() dto: RegisterOrchestratorDto,
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Headers('x-trace-id') traceIdHeader: string,
    @Req() request: Request,
  ): Promise<FleetRegistrationResponseDto> {
    const traceId = traceIdHeader?.trim() || randomUUID();
    if (tenantIdHeader?.trim() && dto.tenantId && tenantIdHeader !== dto.tenantId) {
      throw new BadRequestException('x-tenant-id header does not match body.tenantId');
    }

    if (tenantIdHeader?.trim() && !dto.tenantId) {
      dto.tenantId = tenantIdHeader;
    }

    return this.orchestratorsService.register(dto, this.getSourceIp(request), traceId);
  }

  @Post('heartbeat')
  @UseGuards(OrchestratorFleetAuthGuard)
  async heartbeat(
    @Body() dto: OrchestratorHeartbeatDto,
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Headers('x-trace-id') traceIdHeader: string,
    @Req() request: Request,
  ): Promise<FleetHeartbeatResponseDto> {
    const traceId = traceIdHeader?.trim() || randomUUID();
    return this.orchestratorsService.heartbeat(
      dto,
      this.getSourceIp(request),
      traceId,
      tenantIdHeader?.trim() || null,
    );
  }

  @Post('deregister')
  @UseGuards(OrchestratorFleetAuthGuard)
  async deregister(
    @Body() dto: DeregisterOrchestratorDto,
    @Headers('x-trace-id') traceIdHeader: string,
    @Req() request: Request,
  ): Promise<{ accepted: boolean; orchestratorId: string; status: string; traceId: string }> {
    const traceId = traceIdHeader?.trim() || randomUUID();
    return this.orchestratorsService.deregister(dto, this.getSourceIp(request), traceId);
  }

  @Get(':id/health')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.ORCHESTRATORS_READ)
  async getHealth(@Param('id') id: string): Promise<OrchestratorHealthResponseDto> {
    if (!id?.trim()) {
      throw new BadRequestException('Orchestrator ID is required');
    }

    return this.orchestratorsService.getHealth(id);
  }

  private getSourceIp(request: Request): string | null {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
      return forwardedFor.split(',')[0]?.trim() || null;
    }

    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0]?.split(',')[0]?.trim() || null;
    }

    return request.ip ?? null;
  }
}
