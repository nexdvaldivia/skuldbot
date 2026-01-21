import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LicenseService } from '../license/license.service';

/**
 * Health Status
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
}

/**
 * Component Health
 */
export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  lastCheck: Date;
}

/**
 * System Metrics
 */
export interface SystemMetrics {
  uptime: number;
  memory: {
    used: number;
    free: number;
    total: number;
    percentUsed: number;
  };
  cpu: {
    loadAvg: number[];
    percentUsed?: number;
  };
}

/**
 * Application Metrics
 */
export interface ApplicationMetrics {
  activeRuns: number;
  queuedRuns: number;
  runningRuns: number;
  failedRuns24h: number;
  connectedRunners: number;
  idleRunners: number;
  busyRunners: number;
  queueDepth: number;
  avgRunDurationMs?: number;
}

/**
 * Health Report
 */
export interface HealthReport {
  orchestratorId: string;
  tenantId: string | null;
  timestamp: Date;
  overallStatus: HealthStatus;
  components: ComponentHealth[];
  system: SystemMetrics;
  application: ApplicationMetrics;
}

/**
 * Health Reporter Service
 *
 * Reports health status and metrics to Control-Plane.
 *
 * Used for:
 * - SLA monitoring
 * - Alerting
 * - Capacity planning
 * - Troubleshooting
 */
@Injectable()
export class HealthReporterService {
  private readonly logger = new Logger(HealthReporterService.name);

  private lastReport: HealthReport | null = null;
  private readonly orchestratorId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly licenseService: LicenseService,
  ) {
    this.orchestratorId = this.configService.get<string>(
      'ORCHESTRATOR_ID',
      `orch-${Math.random().toString(36).substring(2, 10)}`,
    );
  }

  /**
   * Generate and optionally report health
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reportHealth(): Promise<HealthReport> {
    const report = await this.generateReport();
    this.lastReport = report;

    // Report to Control-Plane if configured
    const controlPlaneUrl = this.configService.get<string>('CONTROL_PLANE_URL');
    if (controlPlaneUrl) {
      try {
        await this.sendReport(report, controlPlaneUrl);
      } catch (error) {
        this.logger.warn(`Failed to report health to Control-Plane: ${error}`);
      }
    }

    return report;
  }

  /**
   * Get current health status (local)
   */
  async getHealth(): Promise<HealthReport> {
    if (this.lastReport && Date.now() - this.lastReport.timestamp.getTime() < 60000) {
      return this.lastReport;
    }

    return this.generateReport();
  }

  /**
   * Generate health report
   */
  private async generateReport(): Promise<HealthReport> {
    const components = await this.checkComponents();
    const system = this.getSystemMetrics();
    const application = await this.getApplicationMetrics();

    // Determine overall status
    const overallStatus = this.calculateOverallStatus(components, system, application);

    return {
      orchestratorId: this.orchestratorId,
      tenantId: this.licenseService.getTenantId(),
      timestamp: new Date(),
      overallStatus,
      components,
      system,
      application,
    };
  }

  /**
   * Check health of individual components
   */
  private async checkComponents(): Promise<ComponentHealth[]> {
    const components: ComponentHealth[] = [];

    // Database check
    components.push(await this.checkDatabase());

    // Redis check
    components.push(await this.checkRedis());

    // Storage check
    components.push(await this.checkStorage());

    // Runner Gateway check
    components.push(await this.checkRunnerGateway());

    return components;
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    // In production, this would actually ping the database
    // For now, return healthy

    return {
      name: 'database',
      status: HealthStatus.HEALTHY,
      latencyMs: 5,
      lastCheck: new Date(),
    };
  }

  private async checkRedis(): Promise<ComponentHealth> {
    // In production, this would ping Redis
    // For now, return healthy

    return {
      name: 'redis',
      status: HealthStatus.HEALTHY,
      latencyMs: 2,
      lastCheck: new Date(),
    };
  }

  private async checkStorage(): Promise<ComponentHealth> {
    // In production, this would check storage connectivity
    // For now, return healthy

    return {
      name: 'storage',
      status: HealthStatus.HEALTHY,
      lastCheck: new Date(),
    };
  }

  private async checkRunnerGateway(): Promise<ComponentHealth> {
    // In production, this would check WebSocket server
    // For now, return healthy

    return {
      name: 'runner-gateway',
      status: HealthStatus.HEALTHY,
      lastCheck: new Date(),
    };
  }

  /**
   * Get system metrics
   */
  private getSystemMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();
    const totalMemory = require('os').totalmem();
    const freeMemory = require('os').freemem();

    return {
      uptime: process.uptime(),
      memory: {
        used: memUsage.heapUsed,
        free: freeMemory,
        total: totalMemory,
        percentUsed: ((totalMemory - freeMemory) / totalMemory) * 100,
      },
      cpu: {
        loadAvg: require('os').loadavg(),
      },
    };
  }

  /**
   * Get application metrics
   */
  private async getApplicationMetrics(): Promise<ApplicationMetrics> {
    // In production, these would come from actual services:
    // - RunsService for run counts
    // - RunnerGateway for runner counts
    // - BullMQ for queue depth

    return {
      activeRuns: 0, // TODO: Get from RunsService
      queuedRuns: 0, // TODO: Get from BullMQ
      runningRuns: 0, // TODO: Get from RunsService
      failedRuns24h: 0, // TODO: Get from RunsService
      connectedRunners: 0, // TODO: Get from RunnerGateway
      idleRunners: 0, // TODO: Get from RunnerGateway
      busyRunners: 0, // TODO: Get from RunnerGateway
      queueDepth: 0, // TODO: Get from BullMQ
    };
  }

  /**
   * Calculate overall health status
   */
  private calculateOverallStatus(
    components: ComponentHealth[],
    system: SystemMetrics,
    _application: ApplicationMetrics,
  ): HealthStatus {
    // Check if any component is unhealthy
    const unhealthyComponents = components.filter((c) => c.status === HealthStatus.UNHEALTHY);
    if (unhealthyComponents.length > 0) {
      return HealthStatus.UNHEALTHY;
    }

    // Check if any component is degraded
    const degradedComponents = components.filter((c) => c.status === HealthStatus.DEGRADED);
    if (degradedComponents.length > 0) {
      return HealthStatus.DEGRADED;
    }

    // Check system resources
    if (system.memory.percentUsed > 90) {
      return HealthStatus.DEGRADED;
    }

    if (system.cpu.loadAvg[0] > 0.9) {
      return HealthStatus.DEGRADED;
    }

    return HealthStatus.HEALTHY;
  }

  /**
   * Send health report to Control-Plane
   */
  private async sendReport(report: HealthReport, controlPlaneUrl: string): Promise<void> {
    const licenseKey = this.configService.get<string>('LICENSE_KEY', '');

    await fetch(`${controlPlaneUrl}/api/orchestrators/health`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-License-Key': licenseKey,
        'X-Orchestrator-Id': this.orchestratorId,
      },
      body: JSON.stringify(report),
    });

    this.logger.debug(`Health report sent: ${report.overallStatus}`);
  }
}
