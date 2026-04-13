import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { LicenseService } from '../license/license.service';
import { buildFleetAuthHeaders } from '../control-plane/fleet-auth.util';

/**
 * Subscription Status from Control-Plane
 */
export interface SubscriptionStatus {
  canRun: boolean;
  reason?: string;
  status: 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled' | 'unpaid';
  gracePeriodEnds?: string;
}

/**
 * Billing Enforcement Service
 *
 * Enforces billing rules by checking with Control-Plane before bot execution.
 *
 * Flow:
 * 1. Before any bot execution, Orchestrator calls canExecuteBot()
 * 2. This service checks with Control-Plane if the tenant's subscription is active
 * 3. If subscription is suspended/canceled, bot execution is blocked
 * 4. Results are cached for 5 minutes to reduce API calls
 *
 * This ensures that:
 * - Tenants with failed payments cannot run bots
 * - Grace period is respected (14 days)
 * - Immediate enforcement when payment succeeds
 */
@Injectable()
export class BillingEnforcementService implements OnModuleInit {
  private readonly logger = new Logger(BillingEnforcementService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly licenseService: LicenseService,
  ) {}

  async onModuleInit() {
    // Warm up Control-Plane enforcement connectivity on startup.
    const tenantId = this.licenseService.getTenantId();
    if (tenantId) {
      try {
        await this.checkQuota(tenantId, 'runs_per_month', 0);
      } catch (error) {
        if (this.shouldFailClosed()) {
          this.logger.error(
            `Enforcement warm-up failed for tenant ${tenantId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        } else {
          this.logger.warn(
            `Enforcement warm-up warning: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  }

  async canExecuteBot(_botId?: string): Promise<{
    allowed: boolean;
    reason?: string;
    gracePeriodEnds?: Date;
  }> {
    const tenantId = this.licenseService.getTenantId();
    if (!tenantId) {
      return { allowed: true };
    }

    try {
      const entitlement = await this.checkEntitlement(tenantId, 'concurrent_runs', 1);
      if (!entitlement.allowed) {
        return { allowed: false, reason: entitlement.reason };
      }

      const quota = await this.checkQuota(tenantId, 'runs_per_month', 1);
      if (!quota.allowed) {
        return { allowed: false, reason: quota.reason };
      }

      return { allowed: true };
    } catch (error) {
      if (this.shouldFailClosed()) {
        return {
          allowed: false,
          reason: error instanceof Error ? error.message : 'Control-Plane enforcement unavailable',
        };
      }

      this.logger.warn(
        `Fail-open canExecuteBot due to enforcement error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { allowed: true };
    }
  }

  async checkEntitlement(
    tenantId: string,
    resourceType: string,
    requestedCount: number,
  ): Promise<{
    allowed: boolean;
    reason: string;
    state: 'normal' | 'approaching' | 'at_limit' | 'grace' | 'blocked';
    limit: number | null;
    projectedUsage: number;
  }> {
    const payload = {
      tenantId,
      resourceType,
      requestedCount,
    };

    const result = await this.requestControlPlane<{
      allowed: boolean;
      reason: string;
      state: 'normal' | 'approaching' | 'at_limit' | 'grace' | 'blocked';
      limit: number | null;
      projectedUsage: number;
    }>('/api/entitlements/check', tenantId, 'POST', payload);

    if (!result.allowed) {
      throw new ForbiddenException(result.reason || 'Entitlement denied');
    }

    return result;
  }

  async checkQuota(
    tenantId: string,
    resourceType: string,
    requestedAmount: number,
  ): Promise<{
    allowed: boolean;
    reason: string;
    state: 'normal' | 'approaching' | 'at_limit' | 'grace' | 'blocked';
    limit: number | null;
    projectedUsage: number;
  }> {
    const payload = {
      tenantId,
      resourceType,
      requestedAmount,
    };

    const result = await this.requestControlPlane<{
      allowed: boolean;
      reason: string;
      state: 'normal' | 'approaching' | 'at_limit' | 'grace' | 'blocked';
      limit: number | null;
      projectedUsage: number;
    }>('/api/quota/check', tenantId, 'POST', payload);

    if (!result.allowed) {
      throw new ForbiddenException(result.reason || 'Quota denied');
    }

    return result;
  }

  async consumeQuota(
    tenantId: string,
    resourceType: string,
    amount: number,
  ): Promise<{
    consumed: boolean;
    allowed: boolean;
    reason: string;
    state: 'normal' | 'approaching' | 'at_limit' | 'grace' | 'blocked';
  }> {
    const payload = {
      tenantId,
      resourceType,
      amount,
    };

    const result = await this.requestControlPlane<{
      consumed: boolean;
      allowed: boolean;
      reason: string;
      state: 'normal' | 'approaching' | 'at_limit' | 'grace' | 'blocked';
    }>('/api/quota/consume', tenantId, 'POST', payload);

    if (!result.allowed || !result.consumed) {
      throw new ForbiddenException(result.reason || 'Quota consume denied');
    }

    return result;
  }

  /**
   * Get a human-readable message for blocked execution
   */
  getBlockedMessage(status: SubscriptionStatus): string {
    switch (status.status) {
      case 'past_due':
        const gracePeriodEnd = status.gracePeriodEnds
          ? new Date(status.gracePeriodEnds).toLocaleDateString()
          : 'soon';
        return `Payment is past due. Please update your payment method. Service will be suspended on ${gracePeriodEnd}.`;

      case 'suspended':
        return 'Your subscription has been suspended due to non-payment. Please update your payment method to resume service.';

      case 'canceled':
        return 'Your subscription has been canceled. Please contact support to reactivate.';

      case 'unpaid':
        return 'Your account has unpaid invoices. Please settle your balance to continue using the service.';

      default:
        return status.reason || 'Subscription inactive';
    }
  }

  private shouldFailClosed(): boolean {
    const configured = this.configService.get<string | boolean>('ENFORCEMENT_FAIL_CLOSED', true);
    if (typeof configured === 'boolean') {
      return configured;
    }
    return configured.toLowerCase() !== 'false';
  }

  private getControlPlaneUrl(): string | null {
    const url = this.configService.get<string>('CONTROL_PLANE_URL', '').trim();
    return url.length > 0 ? url : null;
  }

  private getOrchestratorId(): string {
    return this.configService.get<string>('ORCHESTRATOR_ID', 'orchestrator-local');
  }

  private async requestControlPlane<T>(
    path: string,
    tenantId: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>,
  ): Promise<T> {
    const controlPlaneUrl = this.getControlPlaneUrl();
    if (!controlPlaneUrl) {
      throw new ServiceUnavailableException('CONTROL_PLANE_URL is not configured');
    }

    const traceId = randomUUID();
    const fleetHeaders = buildFleetAuthHeaders(
      this.configService,
      this.getOrchestratorId(),
      tenantId,
      traceId,
    );
    const response = await fetch(`${controlPlaneUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-License-Key': this.configService.get<string>('LICENSE_KEY', ''),
        'X-Api-Key': this.configService.get<string>('CONTROL_PLANE_API_KEY', ''),
        ...fleetHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Control-Plane ${method} ${path} failed (${response.status}): ${text || response.statusText}`,
      );
    }

    if (!text) {
      return {} as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ServiceUnavailableException(
        `Control-Plane ${method} ${path} returned non-JSON payload`,
      );
    }
  }
}
