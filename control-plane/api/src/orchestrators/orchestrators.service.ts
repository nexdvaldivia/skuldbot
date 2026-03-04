import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  OrchestratorInstance,
  OrchestratorLifecycleStatus,
} from './entities/orchestrator-instance.entity';
import {
  DeregisterOrchestratorDto,
  FleetHeartbeatResponseDto,
  FleetRegistrationResponseDto,
  OrchestratorHealthResponseDto,
  OrchestratorHeartbeatDto,
  RegisterOrchestratorDto,
} from './dto/orchestrator.dto';
import { assertNoOperationalEvidencePayload } from '../common/security/evidence-boundary.util';

@Injectable()
export class OrchestratorsService {
  private readonly logger = new Logger(OrchestratorsService.name);

  constructor(
    @InjectRepository(OrchestratorInstance)
    private readonly orchestratorRepository: Repository<OrchestratorInstance>,
    private readonly configService: ConfigService,
  ) {}

  async register(
    dto: RegisterOrchestratorDto,
    sourceIp: string | null,
    traceId: string,
  ): Promise<FleetRegistrationResponseDto> {
    if (dto.metadata) {
      assertNoOperationalEvidencePayload(
        dto.metadata,
        `Orchestrator ${dto.orchestratorId} registration metadata`,
      );
    }

    const now = new Date();
    const existing = await this.orchestratorRepository.findOne({
      where: { orchestratorId: dto.orchestratorId },
    });

    const instance = existing ?? this.orchestratorRepository.create();

    instance.orchestratorId = dto.orchestratorId;
    instance.tenantId = dto.tenantId ?? existing?.tenantId ?? null;
    instance.version = dto.version ?? existing?.version ?? null;
    instance.status = OrchestratorLifecycleStatus.ACTIVE;
    instance.registeredAt = existing?.registeredAt ?? now;
    instance.lastHeartbeatAt = now;
    instance.deregisteredAt = null;
    instance.lastSeenIp = sourceIp;
    instance.capabilities = dto.capabilities ?? existing?.capabilities ?? {};
    instance.metadata = dto.metadata ?? existing?.metadata ?? {};

    await this.orchestratorRepository.save(instance);

    this.logger.log(
      `[trace:${traceId}] Registered orchestrator ${instance.orchestratorId} (tenant=${instance.tenantId ?? 'n/a'})`,
    );

    return {
      orchestratorId: instance.orchestratorId,
      status: instance.status,
      tenantId: instance.tenantId,
      registeredAt: instance.registeredAt,
      traceId,
      serverTime: now.toISOString(),
      controlPlaneVersion: this.getControlPlaneVersion(),
      heartbeatIntervalSeconds: this.getHeartbeatIntervalSeconds(),
      heartbeatStaleAfterSeconds: this.getHeartbeatStaleAfterSeconds(),
    };
  }

  async heartbeat(
    dto: OrchestratorHeartbeatDto,
    sourceIp: string | null,
    traceId: string,
    tenantIdFromHeader: string | null,
  ): Promise<FleetHeartbeatResponseDto> {
    if (dto.metrics) {
      assertNoOperationalEvidencePayload(
        dto.metrics,
        `Orchestrator ${dto.orchestratorId} heartbeat metrics`,
      );
    }

    if (dto.healthReport) {
      assertNoOperationalEvidencePayload(
        dto.healthReport,
        `Orchestrator ${dto.orchestratorId} heartbeat health report`,
      );
    }

    const heartbeatAt = dto.timestamp ? new Date(dto.timestamp) : new Date();
    if (Number.isNaN(heartbeatAt.getTime())) {
      throw new BadRequestException('Invalid heartbeat timestamp');
    }

    const existing = await this.orchestratorRepository.findOne({
      where: { orchestratorId: dto.orchestratorId },
    });

    const instance = existing ?? this.orchestratorRepository.create();
    const wasAutoRegistered = !existing;

    instance.orchestratorId = dto.orchestratorId;
    if (tenantIdFromHeader) {
      instance.tenantId = tenantIdFromHeader;
    } else if (!instance.tenantId) {
      instance.tenantId = null;
    }
    instance.status = OrchestratorLifecycleStatus.ACTIVE;
    instance.registeredAt = existing?.registeredAt ?? heartbeatAt;
    instance.lastHeartbeatAt = heartbeatAt;
    instance.deregisteredAt = null;
    instance.lastSeenIp = sourceIp;
    instance.lastMetrics = dto.metrics ?? existing?.lastMetrics ?? {};
    instance.lastHealthReport = dto.healthReport ?? existing?.lastHealthReport ?? null;

    await this.orchestratorRepository.save(instance);

    if (wasAutoRegistered) {
      this.logger.warn(
        `[trace:${traceId}] Auto-registered orchestrator ${instance.orchestratorId} from heartbeat`,
      );
    }

    return {
      accepted: true,
      orchestratorId: instance.orchestratorId,
      status: instance.status,
      traceId,
      serverTime: new Date().toISOString(),
      heartbeatStaleAfterSeconds: this.getHeartbeatStaleAfterSeconds(),
    };
  }

  async deregister(
    dto: DeregisterOrchestratorDto,
    sourceIp: string | null,
    traceId: string,
  ): Promise<{
    accepted: boolean;
    orchestratorId: string;
    status: OrchestratorLifecycleStatus;
    traceId: string;
  }> {
    const now = new Date();
    const existing = await this.orchestratorRepository.findOne({
      where: { orchestratorId: dto.orchestratorId },
    });

    const instance = existing ?? this.orchestratorRepository.create();

    instance.orchestratorId = dto.orchestratorId;
    instance.status = OrchestratorLifecycleStatus.DEREGISTERED;
    instance.deregisteredAt = now;
    instance.lastSeenIp = sourceIp;
    instance.metadata = {
      ...(existing?.metadata ?? {}),
      ...(dto.reason ? { deregisterReason: dto.reason } : {}),
      deregisteredAt: now.toISOString(),
    };
    if (!existing) {
      instance.registeredAt = now;
      instance.lastHeartbeatAt = null;
      instance.tenantId = null;
      instance.version = null;
      instance.capabilities = {};
      instance.lastMetrics = {};
      instance.lastHealthReport = null;
    }

    await this.orchestratorRepository.save(instance);

    this.logger.log(`[trace:${traceId}] Deregistered orchestrator ${dto.orchestratorId}`);

    return {
      accepted: true,
      orchestratorId: dto.orchestratorId,
      status: instance.status,
      traceId,
    };
  }

  async getHealth(orchestratorId: string): Promise<OrchestratorHealthResponseDto> {
    const instance = await this.orchestratorRepository.findOne({
      where: { orchestratorId },
    });

    if (!instance) {
      throw new NotFoundException(`Orchestrator ${orchestratorId} not found`);
    }

    const staleThresholdSeconds = this.getHeartbeatStaleAfterSeconds();
    const derivedStatus = this.computeStatus(instance, staleThresholdSeconds);

    if (
      derivedStatus !== instance.status &&
      instance.status !== OrchestratorLifecycleStatus.DEREGISTERED
    ) {
      instance.status = derivedStatus;
      await this.orchestratorRepository.save(instance);
    }

    const now = new Date();
    const stale =
      instance.status !== OrchestratorLifecycleStatus.DEREGISTERED &&
      !!instance.lastHeartbeatAt &&
      now.getTime() - instance.lastHeartbeatAt.getTime() > staleThresholdSeconds * 1000;

    return {
      orchestratorId: instance.orchestratorId,
      tenantId: instance.tenantId,
      version: instance.version,
      status: instance.status,
      stale,
      staleThresholdSeconds,
      registeredAt: instance.registeredAt,
      lastHeartbeatAt: instance.lastHeartbeatAt,
      deregisteredAt: instance.deregisteredAt,
      lastMetrics: instance.lastMetrics,
      lastHealthReport: instance.lastHealthReport,
      lastSeenIp: instance.lastSeenIp,
      serverTime: now.toISOString(),
    };
  }

  private computeStatus(
    instance: OrchestratorInstance,
    staleThresholdSeconds: number,
  ): OrchestratorLifecycleStatus {
    if (instance.status === OrchestratorLifecycleStatus.DEREGISTERED) {
      return instance.status;
    }

    if (instance.status === OrchestratorLifecycleStatus.ERROR) {
      return instance.status;
    }

    if (!instance.lastHeartbeatAt) {
      return OrchestratorLifecycleStatus.REGISTERED;
    }

    const ageMs = Date.now() - instance.lastHeartbeatAt.getTime();
    const staleThresholdMs = staleThresholdSeconds * 1000;

    if (ageMs > staleThresholdMs * 2) {
      return OrchestratorLifecycleStatus.OFFLINE;
    }

    if (ageMs > staleThresholdMs) {
      return OrchestratorLifecycleStatus.DEGRADED;
    }

    return OrchestratorLifecycleStatus.ACTIVE;
  }

  private getControlPlaneVersion(): string {
    return this.configService.get<string>('APP_VERSION', '1.0.0');
  }

  private getHeartbeatIntervalSeconds(): number {
    return this.configService.get<number>('ORCHESTRATOR_HEARTBEAT_INTERVAL_SECONDS', 60);
  }

  private getHeartbeatStaleAfterSeconds(): number {
    return this.configService.get<number>('ORCHESTRATOR_HEARTBEAT_STALE_SECONDS', 180);
  }
}
