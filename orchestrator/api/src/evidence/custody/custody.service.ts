import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Custody Event - Single entry in chain of custody
 */
export interface CustodyEvent {
  eventId: string;
  action: string;
  actorId: string;
  actorType: 'runner' | 'orchestrator' | 'user' | 'auditor' | 'system';
  timestamp: string;
  details?: Record<string, unknown>;
  previousEventHash: string | null;
  eventHash: string;
}

/**
 * Custody Chain - Complete chain for an evidence pack
 */
export interface CustodyChain {
  packId: string;
  events: CustodyEvent[];
  createdAt: string;
  lastEventAt: string;
  chainValid: boolean;
}

/**
 * Chain of Custody Service
 *
 * Implements a cryptographically-linked chain of custody for evidence packs.
 * Each event includes a hash of the previous event, making tampering detectable.
 *
 * Events are stored in append-only fashion to maintain immutability.
 *
 * Common custody events:
 * - pack_created: Initial creation by runner
 * - pack_stored: Uploaded to storage
 * - pack_accessed: Downloaded/viewed
 * - integrity_verified: Integrity check performed
 * - signature_verified: Signature check performed
 * - legal_hold_applied: Legal hold placed
 * - legal_hold_released: Legal hold removed
 * - exported: Exported for external use
 * - transferred: Ownership/access transferred
 */
@Injectable()
export class CustodyService {
  private readonly logger = new Logger(CustodyService.name);

  // In-memory cache for chains (in production, this would be in database)
  private chains: Map<string, CustodyChain> = new Map();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Initialize a new chain of custody for an evidence pack.
   */
  async initializeChain(
    packId: string,
    firstEvent: {
      actorId: string;
      actorType: CustodyEvent['actorType'];
      action: string;
      details?: Record<string, unknown>;
    },
  ): Promise<CustodyChain> {
    const timestamp = new Date().toISOString();

    const event: CustodyEvent = {
      eventId: this.generateEventId(),
      action: firstEvent.action,
      actorId: firstEvent.actorId,
      actorType: firstEvent.actorType,
      timestamp,
      details: firstEvent.details,
      previousEventHash: null,
      eventHash: '', // Calculated below
    };

    // Calculate event hash
    event.eventHash = this.hashEvent(event);

    const chain: CustodyChain = {
      packId,
      events: [event],
      createdAt: timestamp,
      lastEventAt: timestamp,
      chainValid: true,
    };

    this.chains.set(packId, chain);

    this.logger.log(`Chain of custody initialized for pack ${packId}`);

    return chain;
  }

  /**
   * Add an event to the chain of custody.
   */
  async addEvent(
    packId: string,
    eventData: {
      actorId: string;
      actorType: CustodyEvent['actorType'];
      action: string;
      details?: Record<string, unknown>;
    },
  ): Promise<CustodyEvent> {
    const chain = this.chains.get(packId);

    if (!chain) {
      // Initialize chain if it doesn't exist
      const newChain = await this.initializeChain(packId, eventData);
      return newChain.events[0];
    }

    const timestamp = new Date().toISOString();
    const previousEvent = chain.events[chain.events.length - 1];

    const event: CustodyEvent = {
      eventId: this.generateEventId(),
      action: eventData.action,
      actorId: eventData.actorId,
      actorType: eventData.actorType,
      timestamp,
      details: eventData.details,
      previousEventHash: previousEvent.eventHash,
      eventHash: '', // Calculated below
    };

    event.eventHash = this.hashEvent(event);

    chain.events.push(event);
    chain.lastEventAt = timestamp;

    this.logger.debug(`Custody event added to pack ${packId}: ${event.action}`);

    return event;
  }

  /**
   * Get the chain of custody for an evidence pack.
   */
  async getChain(packId: string): Promise<CustodyChain> {
    const chain = this.chains.get(packId);

    if (!chain) {
      // Return empty chain
      return {
        packId,
        events: [],
        createdAt: new Date().toISOString(),
        lastEventAt: new Date().toISOString(),
        chainValid: true,
      };
    }

    // Verify chain integrity before returning
    chain.chainValid = await this.verifyChain(packId);

    return chain;
  }

  /**
   * Verify the integrity of a chain of custody.
   */
  async verifyChain(packId: string): Promise<boolean> {
    const chain = this.chains.get(packId);

    if (!chain || chain.events.length === 0) {
      return true; // Empty chain is valid
    }

    for (let i = 0; i < chain.events.length; i++) {
      const event = chain.events[i];

      // Verify event hash
      const expectedHash = this.hashEvent({ ...event, eventHash: '' });
      if (event.eventHash !== expectedHash) {
        this.logger.warn(`Chain verification failed: event ${event.eventId} hash mismatch`);
        return false;
      }

      // Verify link to previous event
      if (i === 0) {
        if (event.previousEventHash !== null) {
          this.logger.warn(`Chain verification failed: first event has previous hash`);
          return false;
        }
      } else {
        const previousEvent = chain.events[i - 1];
        if (event.previousEventHash !== previousEvent.eventHash) {
          this.logger.warn(`Chain verification failed: event ${event.eventId} link broken`);
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Export chain for external verification.
   */
  async exportChain(packId: string): Promise<{
    packId: string;
    events: CustodyEvent[];
    exportedAt: string;
    exportHash: string;
  }> {
    const chain = await this.getChain(packId);
    const exportedAt = new Date().toISOString();

    // Add export event
    await this.addEvent(packId, {
      actorId: 'system',
      actorType: 'orchestrator',
      action: 'chain_exported',
      details: { exportedAt },
    });

    // Calculate export hash
    const exportHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(chain.events))
      .digest('hex');

    return {
      packId,
      events: chain.events,
      exportedAt,
      exportHash,
    };
  }

  /**
   * Record an access event.
   */
  async recordAccess(
    packId: string,
    accessor: {
      id: string;
      type: CustodyEvent['actorType'];
      reason?: string;
    },
  ): Promise<CustodyEvent> {
    return this.addEvent(packId, {
      actorId: accessor.id,
      actorType: accessor.type,
      action: 'pack_accessed',
      details: { reason: accessor.reason },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Private Helper Methods
  // ─────────────────────────────────────────────────────────────────

  private generateEventId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `evt_${timestamp}_${random}`;
  }

  private hashEvent(event: CustodyEvent): string {
    const data = {
      eventId: event.eventId,
      action: event.action,
      actorId: event.actorId,
      actorType: event.actorType,
      timestamp: event.timestamp,
      details: event.details,
      previousEventHash: event.previousEventHash,
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }
}
