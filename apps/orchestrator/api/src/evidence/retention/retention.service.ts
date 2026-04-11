import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Retention Policy definition
 */
export interface RetentionPolicy {
  id: string;
  name: string;
  description: string;
  retentionDays: number | null; // null = permanent
  allowLegalHold: boolean;
  autoExtendOnAccess: boolean;
  extensionDays: number;
  complianceFramework?: string; // HIPAA, SOC2, PCI-DSS, etc.
}

/**
 * Legal Hold information
 */
export interface LegalHold {
  id: string;
  packId: string;
  reason: string;
  caseId?: string;
  requestedBy: string;
  requestedAt: string;
  releasedAt?: string;
  releasedBy?: string;
}

/**
 * Retention Result
 */
export interface RetentionResult {
  packId: string;
  policy: string;
  expiresAt: Date | null;
  legalHoldActive: boolean;
  canDelete: boolean;
}

/**
 * Retention Service - Evidence Pack Lifecycle Management
 *
 * Manages retention policies for evidence packs including:
 * - Time-based retention (days until deletion)
 * - Legal hold (prevents deletion)
 * - Auto-extension on access
 * - Compliance-based retention (HIPAA, SOC2, etc.)
 *
 * Default policies:
 * - temporary: 30 days (development/testing)
 * - standard: 1 year (general use)
 * - compliance: 7 years (regulated industries)
 * - hipaa: 6 years (healthcare)
 * - sox: 7 years (financial)
 * - permanent: never expires
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  private readonly policies: Map<string, RetentionPolicy> = new Map();
  private readonly legalHolds: Map<string, LegalHold> = new Map();

  constructor(private readonly configService: ConfigService) {
    this.initializeDefaultPolicies();
  }

  /**
   * Initialize default retention policies.
   */
  private initializeDefaultPolicies(): void {
    const defaultPolicies: RetentionPolicy[] = [
      {
        id: 'temporary',
        name: 'Temporary',
        description: 'Short-term retention for development and testing',
        retentionDays: 30,
        allowLegalHold: false,
        autoExtendOnAccess: false,
        extensionDays: 0,
      },
      {
        id: 'standard',
        name: 'Standard',
        description: 'Default retention policy for general use',
        retentionDays: 365,
        allowLegalHold: true,
        autoExtendOnAccess: true,
        extensionDays: 90,
      },
      {
        id: 'compliance',
        name: 'Compliance',
        description: 'Extended retention for compliance requirements',
        retentionDays: 2555, // 7 years
        allowLegalHold: true,
        autoExtendOnAccess: false,
        extensionDays: 0,
        complianceFramework: 'general',
      },
      {
        id: 'hipaa',
        name: 'HIPAA',
        description: 'Healthcare compliance retention (6 years)',
        retentionDays: 2190, // 6 years
        allowLegalHold: true,
        autoExtendOnAccess: false,
        extensionDays: 0,
        complianceFramework: 'HIPAA',
      },
      {
        id: 'sox',
        name: 'SOX/Financial',
        description: 'Financial compliance retention (7 years)',
        retentionDays: 2555, // 7 years
        allowLegalHold: true,
        autoExtendOnAccess: false,
        extensionDays: 0,
        complianceFramework: 'SOX',
      },
      {
        id: 'permanent',
        name: 'Permanent',
        description: 'Never expires - use for critical evidence',
        retentionDays: null,
        allowLegalHold: true,
        autoExtendOnAccess: false,
        extensionDays: 0,
      },
    ];

    for (const policy of defaultPolicies) {
      this.policies.set(policy.id, policy);
    }

    this.logger.log(`Initialized ${this.policies.size} retention policies`);
  }

  /**
   * Get all available retention policies.
   */
  async getPolicies(): Promise<RetentionPolicy[]> {
    return Array.from(this.policies.values());
  }

  /**
   * Get a specific policy.
   */
  async getPolicy(policyId: string): Promise<RetentionPolicy | null> {
    return this.policies.get(policyId) || null;
  }

  /**
   * Calculate expiration date for a policy.
   */
  async calculateExpiration(
    policyId: string,
    createdAt: Date = new Date(),
  ): Promise<Date | null> {
    const policy = this.policies.get(policyId);

    if (!policy || policy.retentionDays === null) {
      return null; // Permanent
    }

    const expiresAt = new Date(createdAt);
    expiresAt.setDate(expiresAt.getDate() + policy.retentionDays);

    return expiresAt;
  }

  /**
   * Apply a legal hold to an evidence pack.
   */
  async applyLegalHold(params: {
    packId: string;
    reason: string;
    caseId?: string;
    requestedBy: string;
  }): Promise<LegalHold> {
    const holdId = `hold_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const hold: LegalHold = {
      id: holdId,
      packId: params.packId,
      reason: params.reason,
      caseId: params.caseId,
      requestedBy: params.requestedBy,
      requestedAt: new Date().toISOString(),
    };

    this.legalHolds.set(params.packId, hold);

    this.logger.log(`Legal hold ${holdId} applied to pack ${params.packId}`);

    return hold;
  }

  /**
   * Release a legal hold.
   */
  async releaseLegalHold(packId: string, releasedBy: string): Promise<LegalHold | null> {
    const hold = this.legalHolds.get(packId);

    if (!hold) {
      return null;
    }

    hold.releasedAt = new Date().toISOString();
    hold.releasedBy = releasedBy;

    this.legalHolds.delete(packId);

    this.logger.log(`Legal hold released from pack ${packId}`);

    return hold;
  }

  /**
   * Check if a pack is under legal hold.
   */
  async hasLegalHold(packId: string): Promise<boolean> {
    return this.legalHolds.has(packId);
  }

  /**
   * Get legal hold information for a pack.
   */
  async getLegalHold(packId: string): Promise<LegalHold | null> {
    return this.legalHolds.get(packId) || null;
  }

  /**
   * Check if a pack can be deleted.
   */
  async canDelete(packId: string, expiresAt: Date | null): Promise<RetentionResult> {
    const hasHold = await this.hasLegalHold(packId);

    // Cannot delete if under legal hold
    if (hasHold) {
      return {
        packId,
        policy: 'unknown',
        expiresAt,
        legalHoldActive: true,
        canDelete: false,
      };
    }

    // Cannot delete if permanent or not yet expired
    if (expiresAt === null) {
      return {
        packId,
        policy: 'permanent',
        expiresAt: null,
        legalHoldActive: false,
        canDelete: false,
      };
    }

    const now = new Date();
    const canDelete = now > expiresAt;

    return {
      packId,
      policy: 'unknown',
      expiresAt,
      legalHoldActive: false,
      canDelete,
    };
  }

  /**
   * Extend retention on access (if policy allows).
   */
  async extendOnAccess(
    packId: string,
    policyId: string,
    currentExpiration: Date | null,
  ): Promise<Date | null> {
    const policy = this.policies.get(policyId);

    if (!policy || !policy.autoExtendOnAccess || policy.extensionDays === 0) {
      return currentExpiration;
    }

    if (currentExpiration === null) {
      return null; // Permanent doesn't extend
    }

    const newExpiration = new Date(currentExpiration);
    newExpiration.setDate(newExpiration.getDate() + policy.extensionDays);

    this.logger.debug(`Retention extended for pack ${packId} by ${policy.extensionDays} days`);

    return newExpiration;
  }

  /**
   * Get packs due for deletion.
   * In production, this would query the database.
   */
  async getPacksDueForDeletion(): Promise<string[]> {
    // This is a placeholder - in production, query database for expired packs
    this.logger.debug('Checking for packs due for deletion');
    return [];
  }

  /**
   * Create a custom retention policy.
   */
  async createPolicy(policy: Omit<RetentionPolicy, 'id'>): Promise<RetentionPolicy> {
    const id = `custom_${Date.now().toString(36)}`;

    const newPolicy: RetentionPolicy = {
      ...policy,
      id,
    };

    this.policies.set(id, newPolicy);

    this.logger.log(`Custom retention policy created: ${id}`);

    return newPolicy;
  }
}
