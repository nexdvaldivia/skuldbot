import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { LicenseService } from '../license/license.service';
import { buildFleetAuthHeaders } from './fleet-auth.util';

/**
 * Control-Plane Connection Status
 */
export enum ConnectionStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  ERROR = 'error',
}

/**
 * Sync Status for various resources
 */
export interface SyncStatus {
  lastSync: Date | null;
  status: 'synced' | 'syncing' | 'error' | 'never';
  error?: string;
}

/**
 * Control-Plane Connection Info
 */
export interface ControlPlaneConnection {
  url: string;
  status: ConnectionStatus;
  lastPing: Date | null;
  latencyMs: number | null;
  version?: string;
}

/**
 * Discovered Schema from bot executions
 */
export interface DiscoveredSchemaPayload {
  nodeType: string;
  fields: SchemaField[];
  sampleCount: number;
  discoveredAt: Date;
}

export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  items?: SchemaField[];
  fields?: SchemaField[];
}

/**
 * Bot Package Info from Control-Plane
 */
export interface BotPackageInfo {
  id: string;
  botId: string;
  version: string;
  name: string;
  description?: string;
  packageUrl: string;
  packageHash: string;
  signature: string;
  size: number;
  publishedAt: Date;
}

/**
 * Control-Plane Sync Service
 *
 * Manages the connection and synchronization with the central Control-Plane.
 *
 * Responsibilities:
 * - Maintain connection to Control-Plane
 * - Sync bot packages from marketplace
 * - Handle offline mode gracefully
 * - Report Orchestrator registration
 */
@Injectable()
export class ControlPlaneSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ControlPlaneSyncService.name);

  private connection: ControlPlaneConnection = {
    url: '',
    status: ConnectionStatus.DISCONNECTED,
    lastPing: null,
    latencyMs: null,
  };

  private syncStatus: Record<string, SyncStatus> = {
    botPackages: { lastSync: null, status: 'never' },
    config: { lastSync: null, status: 'never' },
    schemas: { lastSync: null, status: 'never' },
  };

  // Local cache of discovered schemas to sync
  private pendingSchemas: Map<string, DiscoveredSchemaPayload> = new Map();

  private readonly orchestratorId: string;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly licenseService: LicenseService,
  ) {
    this.orchestratorId = this.configService.get<string>(
      'ORCHESTRATOR_ID',
      `orch-${Math.random().toString(36).substring(2, 10)}`,
    );
  }

  async onModuleInit() {
    const controlPlaneUrl = this.configService.get<string>('CONTROL_PLANE_URL');

    if (!controlPlaneUrl) {
      this.logger.warn('No CONTROL_PLANE_URL configured - running in standalone mode');
      return;
    }

    this.connection.url = controlPlaneUrl;
    this.connection.status = ConnectionStatus.CONNECTING;

    // Initial connection
    await this.connect();

    // Start periodic ping
    this.pingInterval = setInterval(() => this.ping(), 60000); // Every minute
  }

  async onModuleDestroy() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    // Deregister from Control-Plane
    await this.deregister();
  }

  /**
   * Connect to Control-Plane and register this Orchestrator
   */
  async connect(): Promise<boolean> {
    if (!this.connection.url) {
      return false;
    }

    try {
      this.connection.status = ConnectionStatus.CONNECTING;

      const startTime = Date.now();
      const response = await this.makeRequest('/api/orchestrators/register', {
        method: 'POST',
        body: JSON.stringify({
          orchestratorId: this.orchestratorId,
          tenantId: this.licenseService.getTenantId(),
          version: this.configService.get<string>('APP_VERSION', '1.0.0'),
          capabilities: {
            maxConcurrentRuns: this.configService.get<number>('MAX_CONCURRENT_RUNS', 10),
            cloudWorkersEnabled: this.configService.get<boolean>('CLOUD_WORKERS_ENABLED', false),
            runnerGatewayEnabled: true,
          },
          metadata: {
            hostname: this.configService.get<string>('HOSTNAME', 'unknown'),
            region: this.configService.get<string>('REGION', 'unknown'),
            environment: this.configService.get<string>('NODE_ENV', 'development'),
          },
        }),
      });

      this.connection.latencyMs = Date.now() - startTime;
      this.connection.lastPing = new Date();

      if (response.ok) {
        this.connection.status = ConnectionStatus.CONNECTED;
        const data = await response.json();
        this.connection.version = data.controlPlaneVersion;
        this.logger.log(`Connected to Control-Plane (version: ${this.connection.version})`);
        return true;
      } else {
        throw new Error(`Registration failed: ${response.status}`);
      }
    } catch (error) {
      this.connection.status = ConnectionStatus.ERROR;
      this.logger.error(`Failed to connect to Control-Plane: ${error}`);
      return false;
    }
  }

  /**
   * Ping Control-Plane to maintain connection
   */
  private async ping(): Promise<void> {
    if (!this.connection.url || this.connection.status === ConnectionStatus.DISCONNECTED) {
      return;
    }

    try {
      const startTime = Date.now();
      const response = await this.makeRequest('/api/orchestrators/heartbeat', {
        method: 'POST',
        body: JSON.stringify({
          orchestratorId: this.orchestratorId,
          timestamp: new Date().toISOString(),
          metrics: await this.collectMetrics(),
        }),
      });

      this.connection.latencyMs = Date.now() - startTime;
      this.connection.lastPing = new Date();

      if (response.ok) {
        this.connection.status = ConnectionStatus.CONNECTED;
      } else if (response.status === 401 || response.status === 403) {
        // Re-register
        await this.connect();
      }
    } catch (error) {
      this.logger.warn(`Control-Plane heartbeat failed: ${error}`);
      this.connection.status = ConnectionStatus.ERROR;
    }
  }

  /**
   * Deregister from Control-Plane
   */
  private async deregister(): Promise<void> {
    if (!this.connection.url || this.connection.status === ConnectionStatus.DISCONNECTED) {
      return;
    }

    try {
      await this.makeRequest('/api/orchestrators/deregister', {
        method: 'POST',
        body: JSON.stringify({
          orchestratorId: this.orchestratorId,
        }),
      });
      this.logger.log('Deregistered from Control-Plane');
    } catch (error) {
      this.logger.warn(`Failed to deregister from Control-Plane: ${error}`);
    }

    this.connection.status = ConnectionStatus.DISCONNECTED;
  }

  /**
   * Sync bot packages from marketplace
   */
  @Cron(CronExpression.EVERY_HOUR)
  async syncBotPackages(): Promise<void> {
    if (!this.isConnected()) {
      return;
    }

    try {
      this.syncStatus.botPackages.status = 'syncing';

      const response = await this.makeRequest('/api/marketplace/packages/sync', {
        method: 'POST',
        body: JSON.stringify({
          orchestratorId: this.orchestratorId,
          tenantId: this.licenseService.getTenantId(),
          // Only fetch packages for installed bots
          // In production, this would check local installations
        }),
      });

      if (response.ok) {
        const data = await response.json();
        this.logger.log(`Synced ${data.packagesCount || 0} bot packages`);
        this.syncStatus.botPackages = {
          lastSync: new Date(),
          status: 'synced',
        };
      } else {
        throw new Error(`Sync failed: ${response.status}`);
      }
    } catch (error) {
      this.logger.error(`Bot packages sync failed: ${error}`);
      this.syncStatus.botPackages = {
        lastSync: this.syncStatus.botPackages.lastSync,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get a specific bot package from Control-Plane
   */
  async getBotPackage(botId: string, version: string): Promise<BotPackageInfo | null> {
    if (!this.isConnected()) {
      return null;
    }

    try {
      const response = await this.makeRequest(
        `/api/marketplace/packages/${botId}/versions/${version}`,
        { method: 'GET' },
      );

      if (response.ok) {
        return await response.json();
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to get bot package ${botId}@${version}: ${error}`);
      return null;
    }
  }

  /**
   * Download bot package from Control-Plane
   */
  async downloadBotPackage(packageUrl: string): Promise<Buffer | null> {
    try {
      const response = await fetch(packageUrl, {
        headers: this.getAuthHeaders(),
      });

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to download bot package: ${error}`);
      return null;
    }
  }

  /**
   * Check if connected to Control-Plane
   */
  isConnected(): boolean {
    return this.connection.status === ConnectionStatus.CONNECTED;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): ControlPlaneConnection {
    return { ...this.connection };
  }

  /**
   * Get sync status
   */
  getSyncStatus(): Record<string, SyncStatus> {
    return { ...this.syncStatus };
  }

  /**
   * Make authenticated request to Control-Plane
   */
  private async makeRequest(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.connection.url}${path}`;
    const traceId = randomUUID();

    return fetch(url, {
      ...options,
      headers: {
        ...this.getAuthHeaders(traceId),
        ...(options.headers || {}),
      },
    });
  }

  /**
   * Get authentication headers
   */
  private getAuthHeaders(traceId?: string): Record<string, string> {
    const licenseKey = this.configService.get<string>('LICENSE_KEY', '');
    const apiKey = this.configService.get<string>('CONTROL_PLANE_API_KEY', '');
    const tenantId = this.licenseService.getTenantId();
    const fleetHeaders = buildFleetAuthHeaders(
      this.configService,
      this.orchestratorId,
      tenantId,
      traceId,
    );

    return {
      'Content-Type': 'application/json',
      'X-License-Key': licenseKey,
      'X-Api-Key': apiKey,
      ...fleetHeaders,
    };
  }

  /**
   * Collect current metrics
   */
  private async collectMetrics(): Promise<Record<string, unknown>> {
    // In production, this would collect actual metrics from:
    // - RunsService (active runs, queue depth)
    // - RunnersService (connected runners)
    // - System metrics (CPU, memory)

    return {
      activeRuns: 0, // TODO: Get from RunsService
      queuedRuns: 0, // TODO: Get from BullMQ
      connectedRunners: 0, // TODO: Get from RunnerGateway
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== SCHEMA DISCOVERY ====================

  /**
   * Add a discovered schema to the pending sync queue
   * Called by the engine/runner after bot execution
   */
  addDiscoveredSchema(schema: DiscoveredSchemaPayload): void {
    const existing = this.pendingSchemas.get(schema.nodeType);

    if (existing) {
      // Merge fields from both schemas
      const mergedFields = this.mergeSchemaFields(existing.fields, schema.fields);
      existing.fields = mergedFields;
      existing.sampleCount += schema.sampleCount;
      existing.discoveredAt = new Date();
    } else {
      this.pendingSchemas.set(schema.nodeType, {
        ...schema,
        discoveredAt: new Date(),
      });
    }

    this.logger.debug(
      `Added discovered schema for ${schema.nodeType} (${this.pendingSchemas.size} pending)`,
    );
  }

  /**
   * Get all pending schemas (for debugging/inspection)
   */
  getPendingSchemas(): DiscoveredSchemaPayload[] {
    return Array.from(this.pendingSchemas.values());
  }

  /**
   * Sync discovered schemas to Control-Plane
   * Runs every 5 minutes if there are pending schemas
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncDiscoveredSchemas(): Promise<void> {
    if (!this.isConnected() || this.pendingSchemas.size === 0) {
      return;
    }

    try {
      this.syncStatus.schemas.status = 'syncing';

      const schemas = Array.from(this.pendingSchemas.values());

      const response = await this.makeRequest('/api/schemas/bulk', {
        method: 'POST',
        body: JSON.stringify({
          schemas: schemas.map((s) => ({
            nodeType: s.nodeType,
            fields: s.fields,
            sampleCount: s.sampleCount,
          })),
          tenantId: this.licenseService.getTenantId(),
          orchestratorId: this.orchestratorId,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        this.logger.log(`Synced ${result.processed} discovered schemas to Control-Plane`);

        // Clear synced schemas
        this.pendingSchemas.clear();

        this.syncStatus.schemas = {
          lastSync: new Date(),
          status: 'synced',
        };
      } else {
        throw new Error(`Schema sync failed: ${response.status}`);
      }
    } catch (error) {
      this.logger.error(`Failed to sync discovered schemas: ${error}`);
      this.syncStatus.schemas = {
        lastSync: this.syncStatus.schemas.lastSync,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Force sync schemas immediately (for manual trigger)
   */
  async forceSyncSchemas(): Promise<{ success: boolean; synced: number }> {
    if (this.pendingSchemas.size === 0) {
      return { success: true, synced: 0 };
    }

    const count = this.pendingSchemas.size;
    await this.syncDiscoveredSchemas();

    return {
      success: this.syncStatus.schemas.status === 'synced',
      synced: count,
    };
  }

  /**
   * Merge two schema field arrays, combining unique fields
   */
  private mergeSchemaFields(existing: SchemaField[], incoming: SchemaField[]): SchemaField[] {
    const merged = new Map<string, SchemaField>();

    // Add existing fields
    for (const field of existing) {
      merged.set(field.name, { ...field });
    }

    // Merge incoming fields
    for (const field of incoming) {
      const existingField = merged.get(field.name);
      if (existingField) {
        // Merge nested fields if both have them
        if (existingField.items && field.items) {
          existingField.items = this.mergeSchemaFields(existingField.items, field.items);
        }
        if (existingField.fields && field.fields) {
          existingField.fields = this.mergeSchemaFields(existingField.fields, field.fields);
        }
        // If incoming has nested but existing doesn't, add them
        if (!existingField.items && field.items) {
          existingField.items = field.items;
        }
        if (!existingField.fields && field.fields) {
          existingField.fields = field.fields;
        }
      } else {
        merged.set(field.name, { ...field });
      }
    }

    return Array.from(merged.values());
  }
}
