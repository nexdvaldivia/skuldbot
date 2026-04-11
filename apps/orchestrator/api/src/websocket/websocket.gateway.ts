import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

/**
 * WebSocket Gateway for real-time updates
 * - Run logs streaming
 * - Run status updates
 * - Runner status updates
 */
@WebSocketGateway({
  cors: {
    origin: '*', // In production, restrict to UI domain
  },
  namespace: '/ws',
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  // Track which clients are subscribed to which runs
  private runSubscriptions = new Map<string, Set<string>>(); // runId -> Set<socketId>
  private socketRuns = new Map<string, Set<string>>(); // socketId -> Set<runId>

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.socketRuns.set(client.id, new Set());
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Cleanup subscriptions
    const runs = this.socketRuns.get(client.id);
    if (runs) {
      for (const runId of runs) {
        const sockets = this.runSubscriptions.get(runId);
        if (sockets) {
          sockets.delete(client.id);
          if (sockets.size === 0) {
            this.runSubscriptions.delete(runId);
          }
        }
      }
    }
    this.socketRuns.delete(client.id);
  }

  /**
   * Subscribe to a run's real-time updates
   */
  @SubscribeMessage('subscribe:run')
  handleSubscribeRun(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { runId: string },
  ) {
    const { runId } = data;
    this.logger.log(`Client ${client.id} subscribing to run ${runId}`);

    // Add to run subscriptions
    if (!this.runSubscriptions.has(runId)) {
      this.runSubscriptions.set(runId, new Set());
    }
    this.runSubscriptions.get(runId)!.add(client.id);

    // Track on socket
    this.socketRuns.get(client.id)?.add(runId);

    // Join room for this run
    client.join(`run:${runId}`);

    return { success: true, runId };
  }

  /**
   * Unsubscribe from a run's updates
   */
  @SubscribeMessage('unsubscribe:run')
  handleUnsubscribeRun(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { runId: string },
  ) {
    const { runId } = data;
    this.logger.log(`Client ${client.id} unsubscribing from run ${runId}`);

    // Remove from subscriptions
    this.runSubscriptions.get(runId)?.delete(client.id);
    this.socketRuns.get(client.id)?.delete(runId);

    // Leave room
    client.leave(`run:${runId}`);

    return { success: true };
  }

  /**
   * Subscribe to all runner status updates
   */
  @SubscribeMessage('subscribe:runners')
  handleSubscribeRunners(@ConnectedSocket() client: Socket) {
    this.logger.log(`Client ${client.id} subscribing to runners`);
    client.join('runners');
    return { success: true };
  }

  /**
   * Unsubscribe from runner updates
   */
  @SubscribeMessage('unsubscribe:runners')
  handleUnsubscribeRunners(@ConnectedSocket() client: Socket) {
    client.leave('runners');
    return { success: true };
  }

  // ============================================
  // Server-side emit methods (called by services)
  // ============================================

  /**
   * Emit a log line for a run
   */
  emitRunLog(runId: string, log: RunLogEvent) {
    this.server.to(`run:${runId}`).emit('run:log', log);
  }

  /**
   * Emit run status change
   */
  emitRunStatus(runId: string, status: RunStatusEvent) {
    this.server.to(`run:${runId}`).emit('run:status', status);
  }

  /**
   * Emit step progress
   */
  emitRunStep(runId: string, step: RunStepEvent) {
    this.server.to(`run:${runId}`).emit('run:step', step);
  }

  /**
   * Emit run completion
   */
  emitRunComplete(runId: string, result: RunCompleteEvent) {
    this.server.to(`run:${runId}`).emit('run:complete', result);
  }

  /**
   * Emit runner status change
   */
  emitRunnerStatus(runner: RunnerStatusEvent) {
    this.server.to('runners').emit('runner:status', runner);
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(event: string, data: any) {
    this.server.emit(event, data);
  }
}

// ============================================
// Event types
// ============================================

export interface RunLogEvent {
  runId: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  nodeId?: string;
  stepIndex?: number;
}

export interface RunStatusEvent {
  runId: string;
  status: string;
  timestamp: string;
}

export interface RunStepEvent {
  runId: string;
  stepIndex: number;
  nodeId: string;
  nodeType: string;
  status: 'running' | 'success' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  output?: any;
  error?: string;
}

export interface RunCompleteEvent {
  runId: string;
  status: 'success' | 'failed' | 'cancelled';
  completedAt: string;
  durationMs: number;
  stepsCompleted: number;
  stepsFailed: number;
  error?: string;
}

export interface RunnerStatusEvent {
  runnerId: string;
  name: string;
  status: string;
  currentRunId?: string;
  timestamp: string;
}
