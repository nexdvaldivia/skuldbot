import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LicenseService } from '../license/license.service';

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

  // Cache subscription status to reduce Control-Plane API calls
  private statusCache = new Map<
    string,
    { status: SubscriptionStatus; cachedAt: number }
  >();
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  // For offline mode / Control-Plane unavailable
  private lastKnownStatus = new Map<string, SubscriptionStatus>();

  constructor(
    private readonly configService: ConfigService,
    private readonly licenseService: LicenseService,
  ) {}

  async onModuleInit() {
    // Pre-fetch tenant status on startup
    const tenantId = this.licenseService.getTenantId();
    if (tenantId) {
      await this.refreshStatus(tenantId);
    }
  }

  /**
   * Check if a bot can be executed for the current tenant
   *
   * Called by the Dispatcher/RunsService before starting a bot execution
   *
   * @returns true if bot can run, throws error if blocked
   */
  async canExecuteBot(botId?: string): Promise<{
    allowed: boolean;
    reason?: string;
    gracePeriodEnds?: Date;
  }> {
    const tenantId = this.licenseService.getTenantId();

    if (!tenantId) {
      // No tenant ID = local development mode, allow execution
      this.logger.debug('No tenant ID, allowing execution (development mode)');
      return { allowed: true };
    }

    const status = await this.getSubscriptionStatus(tenantId);

    if (status.canRun) {
      return { allowed: true };
    }

    // Execution blocked
    this.logger.warn(
      `Bot execution blocked for tenant ${tenantId}: ${status.reason}`,
    );

    return {
      allowed: false,
      reason: status.reason || 'Subscription inactive',
      gracePeriodEnds: status.gracePeriodEnds
        ? new Date(status.gracePeriodEnds)
        : undefined,
    };
  }

  /**
   * Get subscription status for a tenant
   *
   * Uses cache to minimize Control-Plane API calls
   */
  async getSubscriptionStatus(tenantId: string): Promise<SubscriptionStatus> {
    // Check cache
    const cached = this.statusCache.get(tenantId);
    if (cached && Date.now() - cached.cachedAt < this.cacheTtlMs) {
      return cached.status;
    }

    // Fetch from Control-Plane
    try {
      const status = await this.fetchStatusFromControlPlane(tenantId);

      // Update caches
      this.statusCache.set(tenantId, { status, cachedAt: Date.now() });
      this.lastKnownStatus.set(tenantId, status);

      return status;
    } catch (error) {
      this.logger.error(
        `Failed to fetch subscription status from Control-Plane: ${error}`,
      );

      // Fall back to last known status
      const lastKnown = this.lastKnownStatus.get(tenantId);
      if (lastKnown) {
        this.logger.warn(
          `Using last known status for tenant ${tenantId}: ${lastKnown.status}`,
        );
        return lastKnown;
      }

      // If we've never successfully fetched, allow execution
      // (fail open to avoid blocking legitimate tenants)
      this.logger.warn(
        `No known status for tenant ${tenantId}, allowing execution`,
      );
      return {
        canRun: true,
        status: 'active',
        reason: 'Control-Plane unavailable, allowing execution',
      };
    }
  }

  /**
   * Fetch subscription status from Control-Plane API
   */
  private async fetchStatusFromControlPlane(
    tenantId: string,
  ): Promise<SubscriptionStatus> {
    const controlPlaneUrl = this.configService.get<string>('CONTROL_PLANE_URL');

    if (!controlPlaneUrl) {
      // No Control-Plane configured = development mode
      return {
        canRun: true,
        status: 'active',
        reason: 'No Control-Plane configured',
      };
    }

    const response = await fetch(
      `${controlPlaneUrl}/api/subscriptions/${tenantId}/can-run`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-License-Key': this.configService.get<string>('LICENSE_KEY', ''),
          'X-Api-Key': this.configService.get<string>('CONTROL_PLANE_API_KEY', ''),
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Control-Plane returned ${response.status}`);
    }

    const data = await response.json();

    return {
      canRun: data.canRun,
      status: data.status,
      reason: data.reason,
      gracePeriodEnds: data.gracePeriodEnds,
    };
  }

  /**
   * Force refresh the subscription status
   *
   * Called when we receive a webhook indicating status change
   */
  async refreshStatus(tenantId: string): Promise<SubscriptionStatus> {
    // Clear cache to force refresh
    this.statusCache.delete(tenantId);
    return this.getSubscriptionStatus(tenantId);
  }

  /**
   * Invalidate cache for a tenant
   *
   * Called when we know status has changed (e.g., payment received)
   */
  invalidateCache(tenantId: string): void {
    this.statusCache.delete(tenantId);
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
}
