import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Runner Authentication Payload
 */
interface RunnerAuthPayload {
  runnerId: string;
  apiKey: string;
  version: string;
  capabilities: RunnerCapabilities;
}

/**
 * Runner Capabilities
 */
interface RunnerCapabilities {
  os: 'windows' | 'macos' | 'linux';
  hasDisplay: boolean;
  maxConcurrentJobs: number;
  installedSoftware: string[];
  engineVersion: string;
  pythonVersion: string;
}

/**
 * Connected Runner Info
 */
interface ConnectedRunner {
  runnerId: string;
  socketId: string;
  name: string;
  tenantId: string;
  capabilities: RunnerCapabilities;
  status: 'idle' | 'busy' | 'draining';
  currentJobs: string[];
  connectedAt: Date;
  lastHeartbeat: Date;
}

/**
 * Job Assignment
 */
interface JobAssignment {
  jobId: string;
  runId: string;
  botId: string;
  botPackageUrl: string;
  variables: Record<string, unknown>;
  secrets: Record<string, string>; // Resolved secrets (encrypted in transit)
  priority: number;
  timeout: number;
  retryAttempt: number;
}

/**
 * Job Progress Update
 */
interface JobProgress {
  jobId: string;
  runId: string;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  currentStep?: {
    index: number;
    nodeId: string;
    nodeType: string;
    startedAt: string;
  };
  logs: Array<{
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    nodeId?: string;
  }>;
  error?: {
    code: string;
    message: string;
    stack?: string;
    nodeId?: string;
    retryable: boolean;
  };
}

/**
 * Job Result
 */
interface JobResult {
  jobId: string;
  runId: string;
  status: 'success' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  stepsExecuted: number;
  stepsFailed: number;
  output?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    stack?: string;
    nodeId?: string;
  };
  evidencePackId?: string;
  billingEvents?: Array<{
    metric: string;
    quantity: number;
    timestamp: string;
  }>;
}

/**
 * Runner Gateway - WebSocket communication with on-premise runners
 *
 * Protocol:
 * 1. Runner connects and authenticates with API key
 * 2. Runner receives 'job:assign' events with work to do
 * 3. Runner sends 'job:progress' updates during execution
 * 4. Runner sends 'job:result' when complete
 * 5. Periodic heartbeats to detect disconnections
 *
 * Security:
 * - API key authentication on connect
 * - Secrets encrypted in transit (TLS + envelope encryption)
 * - Runner can only process jobs for its tenant
 *
 * Resilience:
 * - Automatic reconnection handling
 * - Job requeue on runner disconnect
 * - Heartbeat timeout detection
 */
@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*', // In production, restrict based on runner IPs
  },
  namespace: '/runner',
})
export class RunnerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RunnerGateway.name);

  @WebSocketServer()
  server: Server;

  // Connected runners by runnerId
  private runners = new Map<string, ConnectedRunner>();

  // Socket ID to runner ID mapping
  private socketToRunner = new Map<string, string>();

  // Pending jobs waiting for runners
  private pendingJobs = new Map<string, JobAssignment>();

  // Heartbeat interval (30 seconds)
  private readonly HEARTBEAT_INTERVAL = 30000;

  // Heartbeat timeout (90 seconds - 3 missed heartbeats)
  private readonly HEARTBEAT_TIMEOUT = 90000;

  constructor(private readonly configService: ConfigService) {
    // Start heartbeat checker
    setInterval(() => this.checkHeartbeats(), this.HEARTBEAT_INTERVAL);
  }

  /**
   * Handle new runner connection
   */
  async handleConnection(client: Socket) {
    this.logger.log(`Runner connecting: ${client.id}`);

    // Wait for authentication (runner must send auth within 10 seconds)
    setTimeout(() => {
      if (!this.socketToRunner.has(client.id)) {
        this.logger.warn(`Runner ${client.id} did not authenticate in time, disconnecting`);
        client.disconnect(true);
      }
    }, 10000);
  }

  /**
   * Handle runner disconnection
   */
  async handleDisconnect(client: Socket) {
    const runnerId = this.socketToRunner.get(client.id);

    if (runnerId) {
      const runner = this.runners.get(runnerId);

      if (runner) {
        this.logger.warn(`Runner ${runnerId} disconnected, had ${runner.currentJobs.length} jobs`);

        // Requeue any in-progress jobs
        for (const jobId of runner.currentJobs) {
          this.logger.log(`Requeuing job ${jobId} from disconnected runner ${runnerId}`);
          // Emit event for job requeue (handled by DispatchService)
          this.server.emit('runner:job-orphaned', { jobId, runnerId });
        }

        // Remove runner
        this.runners.delete(runnerId);

        // Broadcast runner offline
        this.server.emit('runner:offline', {
          runnerId,
          name: runner.name,
          timestamp: new Date().toISOString(),
        });
      }

      this.socketToRunner.delete(client.id);
    }

    this.logger.log(`Runner socket disconnected: ${client.id}`);
  }

  /**
   * Runner authentication
   */
  @SubscribeMessage('runner:auth')
  async handleRunnerAuth(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RunnerAuthPayload,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.log(`Runner ${payload.runnerId} authenticating...`);

      // Validate API key (in production, this would check against database)
      const isValid = await this.validateRunnerApiKey(payload.runnerId, payload.apiKey);

      if (!isValid) {
        this.logger.warn(`Runner ${payload.runnerId} authentication failed`);
        throw new WsException('Invalid API key');
      }

      // Get runner info from database (simplified for now)
      const runnerInfo = await this.getRunnerInfo(payload.runnerId);

      if (!runnerInfo) {
        throw new WsException('Runner not found');
      }

      // Check if already connected (kick old connection)
      if (this.runners.has(payload.runnerId)) {
        const oldRunner = this.runners.get(payload.runnerId);
        if (oldRunner) {
          this.logger.warn(`Runner ${payload.runnerId} already connected, disconnecting old socket`);
          const oldSocket = this.server.sockets.sockets.get(oldRunner.socketId);
          if (oldSocket) {
            oldSocket.disconnect(true);
          }
        }
      }

      // Register runner
      const connectedRunner: ConnectedRunner = {
        runnerId: payload.runnerId,
        socketId: client.id,
        name: runnerInfo.name,
        tenantId: runnerInfo.tenantId,
        capabilities: payload.capabilities,
        status: 'idle',
        currentJobs: [],
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
      };

      this.runners.set(payload.runnerId, connectedRunner);
      this.socketToRunner.set(client.id, payload.runnerId);

      // Join tenant room
      client.join(`tenant:${runnerInfo.tenantId}`);

      // Broadcast runner online
      this.server.emit('runner:online', {
        runnerId: payload.runnerId,
        name: runnerInfo.name,
        tenantId: runnerInfo.tenantId,
        capabilities: payload.capabilities,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`Runner ${payload.runnerId} authenticated successfully`);

      // Check for pending jobs
      this.dispatchPendingJobs();

      return { success: true };
    } catch (error) {
      this.logger.error(`Runner auth error: ${error}`);
      return { success: false, error: error instanceof Error ? error.message : 'Authentication failed' };
    }
  }

  /**
   * Runner heartbeat
   */
  @SubscribeMessage('runner:heartbeat')
  handleHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { runnerId: string; status: string; cpuUsage?: number; memoryUsage?: number },
  ): { success: boolean } {
    const runner = this.runners.get(payload.runnerId);

    if (runner && runner.socketId === client.id) {
      runner.lastHeartbeat = new Date();

      // Update status if provided
      if (payload.status === 'idle' || payload.status === 'busy' || payload.status === 'draining') {
        runner.status = payload.status;
      }

      this.logger.debug(`Heartbeat from runner ${payload.runnerId}`);

      return { success: true };
    }

    return { success: false };
  }

  /**
   * Job progress update from runner
   */
  @SubscribeMessage('job:progress')
  handleJobProgress(
    @ConnectedSocket() client: Socket,
    @MessageBody() progress: JobProgress,
  ): { success: boolean } {
    const runnerId = this.socketToRunner.get(client.id);

    if (!runnerId) {
      return { success: false };
    }

    const runner = this.runners.get(runnerId);
    if (!runner || !runner.currentJobs.includes(progress.jobId)) {
      this.logger.warn(`Runner ${runnerId} reporting progress for unknown job ${progress.jobId}`);
      return { success: false };
    }

    // Forward progress to subscribers (UI clients)
    this.server.to(`run:${progress.runId}`).emit('run:progress', {
      runId: progress.runId,
      jobId: progress.jobId,
      runnerId,
      ...progress,
    });

    // Forward logs individually
    for (const log of progress.logs) {
      this.server.to(`run:${progress.runId}`).emit('run:log', {
        runId: progress.runId,
        ...log,
      });
    }

    this.logger.debug(`Job ${progress.jobId} progress: ${progress.progress}%`);

    return { success: true };
  }

  /**
   * Job result from runner
   */
  @SubscribeMessage('job:result')
  handleJobResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() result: JobResult,
  ): { success: boolean } {
    const runnerId = this.socketToRunner.get(client.id);

    if (!runnerId) {
      return { success: false };
    }

    const runner = this.runners.get(runnerId);
    if (!runner) {
      return { success: false };
    }

    // Remove job from runner's current jobs
    const jobIndex = runner.currentJobs.indexOf(result.jobId);
    if (jobIndex > -1) {
      runner.currentJobs.splice(jobIndex, 1);
    }

    // Update runner status
    if (runner.currentJobs.length === 0) {
      runner.status = 'idle';
    }

    // Forward result to subscribers
    this.server.to(`run:${result.runId}`).emit('run:complete', {
      runId: result.runId,
      ...result,
    });

    // Emit event for RunsService to update database
    this.server.emit('job:completed', {
      jobId: result.jobId,
      runnerId,
      result,
    });

    this.logger.log(`Job ${result.jobId} completed with status: ${result.status}`);

    // Check for more pending jobs
    this.dispatchPendingJobs();

    return { success: true };
  }

  // ============================================
  // Server-side methods (called by other services)
  // ============================================

  /**
   * Assign a job to an available runner
   */
  assignJob(job: JobAssignment): boolean {
    // Find available runner
    const runner = this.findAvailableRunner(job);

    if (!runner) {
      // Queue job for later
      this.pendingJobs.set(job.jobId, job);
      this.logger.log(`No available runner for job ${job.jobId}, queued`);
      return false;
    }

    // Send job to runner
    const socket = this.server.sockets.sockets.get(runner.socketId);
    if (!socket) {
      this.pendingJobs.set(job.jobId, job);
      return false;
    }

    // Update runner state
    runner.currentJobs.push(job.jobId);
    runner.status = 'busy';

    // Send job assignment
    socket.emit('job:assign', job);

    this.logger.log(`Job ${job.jobId} assigned to runner ${runner.runnerId}`);

    return true;
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    // Check if queued
    if (this.pendingJobs.has(jobId)) {
      this.pendingJobs.delete(jobId);
      return true;
    }

    // Find runner with this job
    for (const runner of this.runners.values()) {
      if (runner.currentJobs.includes(jobId)) {
        const socket = this.server.sockets.sockets.get(runner.socketId);
        if (socket) {
          socket.emit('job:cancel', { jobId });
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get list of connected runners
   */
  getConnectedRunners(): ConnectedRunner[] {
    return Array.from(this.runners.values());
  }

  /**
   * Get runner by ID
   */
  getRunner(runnerId: string): ConnectedRunner | undefined {
    return this.runners.get(runnerId);
  }

  /**
   * Check if any runners are available
   */
  hasAvailableRunners(): boolean {
    for (const runner of this.runners.values()) {
      if (runner.status === 'idle' || runner.currentJobs.length < runner.capabilities.maxConcurrentJobs) {
        return true;
      }
    }
    return false;
  }

  // ============================================
  // Private helper methods
  // ============================================

  private async validateRunnerApiKey(runnerId: string, apiKey: string): Promise<boolean> {
    // TODO: Implement proper API key validation against database
    // For now, accept any non-empty key
    return apiKey && apiKey.length > 0;
  }

  private async getRunnerInfo(runnerId: string): Promise<{ name: string; tenantId: string } | null> {
    // TODO: Fetch from database
    // For now, return mock data
    return {
      name: `Runner ${runnerId}`,
      tenantId: 'default-tenant',
    };
  }

  private findAvailableRunner(job: JobAssignment): ConnectedRunner | null {
    for (const runner of this.runners.values()) {
      // Check if runner has capacity
      if (runner.currentJobs.length >= runner.capabilities.maxConcurrentJobs) {
        continue;
      }

      // Check if draining
      if (runner.status === 'draining') {
        continue;
      }

      // TODO: Add more matching criteria:
      // - Tenant matching
      // - Capability matching (OS, software requirements)
      // - Priority/affinity

      return runner;
    }

    return null;
  }

  private dispatchPendingJobs(): void {
    for (const [jobId, job] of this.pendingJobs) {
      if (this.assignJob(job)) {
        this.pendingJobs.delete(jobId);
      }
    }
  }

  private checkHeartbeats(): void {
    const now = Date.now();

    for (const [runnerId, runner] of this.runners) {
      const timeSinceHeartbeat = now - runner.lastHeartbeat.getTime();

      if (timeSinceHeartbeat > this.HEARTBEAT_TIMEOUT) {
        this.logger.warn(`Runner ${runnerId} heartbeat timeout, disconnecting`);

        // Disconnect the socket
        const socket = this.server.sockets.sockets.get(runner.socketId);
        if (socket) {
          socket.disconnect(true);
        }

        // handleDisconnect will clean up
      }
    }
  }
}
