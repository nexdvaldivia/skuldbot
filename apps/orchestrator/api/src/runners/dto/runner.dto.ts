import {
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  IsEnum,
} from 'class-validator';
import { RunnerStatus } from '../entities/runner.entity';

/**
 * DTO for runner registration
 */
export class RegisterRunnerDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsObject()
  labels?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @IsOptional()
  @IsString()
  agentVersion?: string;

  @IsOptional()
  @IsObject()
  systemInfo?: {
    os?: string;
    hostname?: string;
    cpuCount?: number;
    memoryMb?: number;
  };

  @IsOptional()
  @IsObject()
  secretsConfig?: {
    provider: 'azure-keyvault' | 'aws-secrets' | 'hashicorp-vault' | 'env';
    config: Record<string, any>;
  };
}

/**
 * DTO for updating runner
 */
export class UpdateRunnerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(RunnerStatus)
  status?: RunnerStatus;

  @IsOptional()
  @IsObject()
  labels?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];
}

/**
 * DTO for heartbeat from runner
 */
export class HeartbeatDto {
  @IsOptional()
  @IsEnum(RunnerStatus)
  status?: RunnerStatus;

  @IsOptional()
  @IsString()
  currentRunId?: string;

  @IsOptional()
  @IsObject()
  metrics?: {
    cpuPercent?: number;
    memoryPercent?: number;
    activeSteps?: number;
  };
}

/**
 * DTO for runner claiming a job
 */
export class ClaimJobDto {
  @IsString()
  runId: string;
}

/**
 * DTO for reporting run progress
 */
export class ReportProgressDto {
  @IsString()
  runId: string;

  @IsString()
  stepId: string;

  @IsString()
  nodeId: string;

  @IsString()
  eventType: string; // step_start, step_end, step_error, etc.

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  durationMs?: number;

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;

  @IsOptional()
  @IsObject()
  classification?: {
    in: string;
    out: string;
  };

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  controlsApplied?: string[];
}

/**
 * DTO for sending a log entry (real-time streaming)
 */
export class SendLogDto {
  @IsString()
  runId: string;

  @IsString()
  timestamp: string;

  @IsString()
  level: 'info' | 'warn' | 'error' | 'debug';

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  stepIndex?: number;
}

/**
 * DTO for completing a run
 */
export class CompleteRunDto {
  @IsString()
  runId: string;

  success: boolean;

  @IsOptional()
  durationMs?: number;

  @IsOptional()
  stepsCompleted?: number;

  @IsOptional()
  stepsFailed?: number;

  @IsOptional()
  stepsSkipped?: number;

  @IsOptional()
  @IsObject()
  outputs?: Record<string, any>;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsObject()
  errorDetails?: Record<string, any>;
}
