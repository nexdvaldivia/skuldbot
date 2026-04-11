import {
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OrchestratorLifecycleStatus } from '../entities/orchestrator-instance.entity';

const ORCHESTRATOR_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

export class RegisterOrchestratorDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(120)
  @Matches(ORCHESTRATOR_ID_PATTERN, {
    message:
      'orchestratorId must contain only letters, numbers, dot, underscore, colon or hyphen',
  })
  orchestratorId: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  tenantId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  version?: string;

  @IsObject()
  @IsOptional()
  capabilities?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class OrchestratorHeartbeatDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(120)
  @Matches(ORCHESTRATOR_ID_PATTERN, {
    message:
      'orchestratorId must contain only letters, numbers, dot, underscore, colon or hyphen',
  })
  orchestratorId: string;

  @IsISO8601()
  @IsOptional()
  timestamp?: string;

  @IsObject()
  @IsOptional()
  metrics?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  healthReport?: Record<string, unknown>;
}

export class DeregisterOrchestratorDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(120)
  @Matches(ORCHESTRATOR_ID_PATTERN, {
    message:
      'orchestratorId must contain only letters, numbers, dot, underscore, colon or hyphen',
  })
  orchestratorId: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}

export interface FleetRegistrationResponseDto {
  orchestratorId: string;
  status: OrchestratorLifecycleStatus;
  tenantId: string | null;
  registeredAt: Date;
  traceId: string;
  serverTime: string;
  controlPlaneVersion: string;
  heartbeatIntervalSeconds: number;
  heartbeatStaleAfterSeconds: number;
}

export interface FleetHeartbeatResponseDto {
  accepted: boolean;
  orchestratorId: string;
  status: OrchestratorLifecycleStatus;
  traceId: string;
  serverTime: string;
  heartbeatStaleAfterSeconds: number;
}

export interface OrchestratorHealthResponseDto {
  orchestratorId: string;
  tenantId: string | null;
  version: string | null;
  status: OrchestratorLifecycleStatus;
  stale: boolean;
  staleThresholdSeconds: number;
  registeredAt: Date;
  lastHeartbeatAt: Date | null;
  deregisteredAt: Date | null;
  lastMetrics: Record<string, unknown>;
  lastHealthReport: Record<string, unknown> | null;
  lastSeenIp: string | null;
  serverTime: string;
}
