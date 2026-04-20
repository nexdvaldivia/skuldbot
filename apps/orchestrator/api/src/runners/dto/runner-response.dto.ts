import { RunnerStatus } from '../entities/runner.entity';

export class RunnerResponseDto {
  id: string;
  tenantId: string;
  name: string;
  status: RunnerStatus;
  labels?: Record<string, string>;
  capabilities?: string[];
  lastHeartbeatAt?: string;
  ipAddress?: string;
  agentVersion?: string;
  systemInfo?: {
    os?: string;
    hostname?: string;
    cpuCount?: number;
    memoryMb?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export class RunnerRegistrationResponseDto {
  runner: RunnerResponseDto;
  apiKey: string; // Only returned once during registration
}

export class PendingJobDto {
  runId: string;
  tenantId: string;
  botVersionId: string;
  planHash: string | null;
  inputs?: Record<string, any>;
  queuedAt: string;
}

export class JobClaimResponseDto {
  success: boolean;
  job?: {
    runId: string;
    tenantId: string;
    botVersionId: string;
    plan: Record<string, any>;
    inputs?: Record<string, any>;
  };
  message?: string;
}

export class RunnerStatsDto {
  total: number;
  online: number;
  busy: number;
  offline: number;
  maintenance: number;
}
