import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';

import type { StorageService } from '../storage/storage.interface';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import { EncryptionService } from './encryption/encryption.service';
import { SignatureService } from './signature/signature.service';
import { IntegrityService } from './integrity/integrity.service';
import { CustodyService } from './custody/custody.service';
import { RetentionService } from './retention/retention.service';

/**
 * Evidence Pack entity for database tracking
 */
export interface EvidencePackRecord {
  id: string;
  executionId: string;
  botId: string;
  tenantId: string;
  merkleRoot: string;
  signatureAlgorithm: string;
  signedAt: Date;
  totalFiles: number;
  sizeBytes: number;
  storagePath: string;
  retentionPolicy: string;
  legalHoldActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
}

/**
 * Evidence Pack manifest structure
 */
export interface EvidenceManifest {
  version: string;
  packId: string;
  executionId: string;
  botId: string;
  botName: string;
  tenantId: string;
  createdAt: string;
  completedAt: string;

  integrity: {
    merkleRoot: string;
    merkleAlgorithm: string;
    totalFiles: number;
    treeDepth: number;
    fileHashes: Record<string, string>;
  };

  verification: {
    canonicalSchema: string;
    canonicalAlgorithm: string;
    canonicalRunHash: string;
  };

  signature: {
    algorithm: string;
    signedAt: string;
    signatureValue: string;
    certificateFingerprint: string;
    tsaTimestamp?: string;
    tsaAuthority?: string;
  };

  encryption: {
    algorithm: string;
    keyId: string;
    keyProvider: string;
  };

  retention: {
    policy: string;
    expiresAt: string | null;
    legalHold: boolean;
  };

  custody: {
    events: CustodyEvent[];
    chainValid: boolean;
  };

  contents: {
    screenshots: string[];
    decisions: string[];
    lineage: string[];
    logs: string[];
    compliance: string[];
  };
}

export interface CustodyEvent {
  eventId: string;
  action: string;
  actorId: string;
  actorType: string;
  timestamp: string;
  previousEventHash: string | null;
  eventHash: string;
}

export interface CanonicalRunHashVerification {
  valid: boolean;
  expectedCanonicalRunHash: string;
  manifestCanonicalRunHash: string;
  canonicalSchema: string;
  canonicalAlgorithm: string;
}

export interface EvidenceRetentionEnforcementResult {
  tenantId: string;
  evaluatedPacks: number;
  deletedPacks: number;
  skippedLegalHold: number;
  skippedPermanent: number;
  skippedUnexpired: number;
  errors: Array<{ packId: string; message: string }>;
}

/**
 * Evidence Pack Service
 *
 * Manages evidence pack lifecycle:
 * - Creation from bot execution results
 * - Storage with encryption
 * - Integrity verification (Merkle trees)
 * - Digital signatures with TSA
 * - Chain of custody tracking
 * - Retrieval for auditors
 */
@Injectable()
export class EvidencePackService {
  private readonly logger = new Logger(EvidencePackService.name);

  private readonly bucket: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
    private readonly encryptionService: EncryptionService,
    private readonly signatureService: SignatureService,
    private readonly integrityService: IntegrityService,
    private readonly custodyService: CustodyService,
    private readonly retentionService: RetentionService,
  ) {
    this.bucket = this.configService.get<string>(
      'storage.evidenceBucket',
      'skuldbot-evidence',
    );
  }

  /**
   * Create a new evidence pack from execution results.
   * Called by the Runner after bot execution completes.
   */
  async createFromExecution(params: {
    executionId: string;
    botId: string;
    botName: string;
    tenantId: string;
    screenshots: Buffer[];
    decisions: Record<string, any>[];
    lineage: Record<string, any>[];
    logs: string[];
    complianceResults: Record<string, any>[];
    retentionPolicy?: string;
  }): Promise<{ packId: string; manifest: EvidenceManifest }> {
    const packId = this.generatePackId(params.executionId);
    const createdAt = new Date().toISOString();

    this.logger.log(
      `Creating evidence pack ${packId} for execution ${params.executionId}`,
    );

    // Prepare files for the pack
    const files: Record<string, Buffer> = {};
    const fileHashes: Record<string, string> = {};

    // Add screenshots (encrypted)
    for (let i = 0; i < params.screenshots.length; i++) {
      const fileName = `screenshots/screenshot_${i.toString().padStart(3, '0')}.png.enc`;
      const encrypted = await this.encryptionService.encrypt(
        params.screenshots[i],
      );
      files[fileName] = encrypted;
    }

    // Add decisions (encrypted JSON)
    for (let i = 0; i < params.decisions.length; i++) {
      const fileName = `decisions/decision_${i.toString().padStart(3, '0')}.json.enc`;
      const content = Buffer.from(JSON.stringify(params.decisions[i], null, 2));
      const encrypted = await this.encryptionService.encrypt(content);
      files[fileName] = encrypted;
    }

    // Add lineage (encrypted JSON)
    for (let i = 0; i < params.lineage.length; i++) {
      const fileName = `lineage/lineage_${i.toString().padStart(3, '0')}.json.enc`;
      const content = Buffer.from(JSON.stringify(params.lineage[i], null, 2));
      const encrypted = await this.encryptionService.encrypt(content);
      files[fileName] = encrypted;
    }

    // Add logs (encrypted)
    if (params.logs.length > 0) {
      const fileName = 'logs/execution.log.enc';
      const content = Buffer.from(params.logs.join('\n'));
      const encrypted = await this.encryptionService.encrypt(content);
      files[fileName] = encrypted;
    }

    // Add compliance results (encrypted JSON)
    for (let i = 0; i < params.complianceResults.length; i++) {
      const fileName = `compliance/result_${i.toString().padStart(3, '0')}.json.enc`;
      const content = Buffer.from(
        JSON.stringify(params.complianceResults[i], null, 2),
      );
      const encrypted = await this.encryptionService.encrypt(content);
      files[fileName] = encrypted;
    }

    // Calculate file hashes and build Merkle tree
    for (const [filePath, content] of Object.entries(files)) {
      fileHashes[filePath] = this.hashBuffer(content);
    }

    const merkleResult = this.integrityService.buildMerkleTree(fileHashes);

    // Initialize chain of custody
    const custodyChain = await this.custodyService.initializeChain(packId, {
      actorId: 'system',
      actorType: 'runner',
      action: 'pack_created',
      details: { executionId: params.executionId, botId: params.botId },
    });

    // Calculate retention expiration
    const retentionPolicy = params.retentionPolicy || 'standard';
    const expiresAt = await this.retentionService.calculateExpiration(
      retentionPolicy,
      new Date(),
    );

    // Build manifest (NOT encrypted - auditors can read)
    const manifest: EvidenceManifest = {
      version: '1.0.0',
      packId,
      executionId: params.executionId,
      botId: params.botId,
      botName: params.botName,
      tenantId: params.tenantId,
      createdAt,
      completedAt: new Date().toISOString(),

      integrity: {
        merkleRoot: merkleResult.root,
        merkleAlgorithm: 'SHA-256',
        totalFiles: Object.keys(files).length,
        treeDepth: merkleResult.depth,
        fileHashes,
      },

      verification: {
        canonicalSchema: 'run-evidence-v1',
        canonicalAlgorithm: 'SHA-256',
        canonicalRunHash: '',
      },

      signature: {
        algorithm: 'RSA-PSS-4096',
        signedAt: '',
        signatureValue: '',
        certificateFingerprint: '',
      },

      encryption: {
        algorithm: 'AES-256-GCM',
        keyId: await this.encryptionService.getCurrentKeyId(),
        keyProvider: this.configService.get('evidence.keyProvider', 'local'),
      },

      retention: {
        policy: retentionPolicy,
        expiresAt: expiresAt?.toISOString() || null,
        legalHold: false,
      },

      custody: {
        events: custodyChain.events,
        chainValid: true,
      },

      contents: {
        screenshots: Object.keys(files).filter((f) =>
          f.startsWith('screenshots/'),
        ),
        decisions: Object.keys(files).filter((f) => f.startsWith('decisions/')),
        lineage: Object.keys(files).filter((f) => f.startsWith('lineage/')),
        logs: Object.keys(files).filter((f) => f.startsWith('logs/')),
        compliance: Object.keys(files).filter((f) =>
          f.startsWith('compliance/'),
        ),
      },
    };

    manifest.verification.canonicalRunHash =
      this.computeCanonicalRunHash(manifest);

    // Sign the manifest
    const manifestJson = JSON.stringify(manifest, null, 2);
    const signatureResult =
      await this.signatureService.signManifest(manifestJson);

    manifest.signature = {
      algorithm: signatureResult.algorithm,
      signedAt: signatureResult.signedAt,
      signatureValue: signatureResult.signature,
      certificateFingerprint: signatureResult.certificateFingerprint,
      tsaTimestamp: signatureResult.tsaTimestamp,
      tsaAuthority: signatureResult.tsaAuthority,
    };

    // Add manifest and checksums to files
    files['manifest.json'] = Buffer.from(JSON.stringify(manifest, null, 2));
    files['checksums.json'] = Buffer.from(
      JSON.stringify(
        {
          merkleRoot: merkleResult.root,
          algorithm: 'SHA-256',
          files: fileHashes,
        },
        null,
        2,
      ),
    );

    // Store the evidence pack
    const storagePath = `evidence/${params.tenantId}/${packId}`;
    await this.storeEvidencePack(storagePath, files);

    // Record custody event for storage
    await this.custodyService.addEvent(packId, {
      actorId: 'system',
      actorType: 'orchestrator',
      action: 'pack_stored',
      details: { storagePath, fileCount: Object.keys(files).length },
    });

    this.logger.log(
      `Evidence pack ${packId} created with ${Object.keys(files).length} files`,
    );

    return { packId, manifest };
  }

  /**
   * Get evidence pack manifest (for auditors - no decryption needed).
   */
  async getManifest(
    tenantId: string,
    packId: string,
  ): Promise<EvidenceManifest> {
    const storagePath = `evidence/${tenantId}/${packId}/manifest.json`;

    try {
      const content = await this.storageService.download(
        this.bucket,
        storagePath,
      );
      const manifest = JSON.parse(content.toString()) as EvidenceManifest;

      // Backward compatibility for packs created before canonical hash rollout.
      if (!manifest.verification) {
        manifest.verification = {
          canonicalSchema: 'run-evidence-v1',
          canonicalAlgorithm: 'SHA-256',
          canonicalRunHash: this.computeCanonicalRunHash(manifest),
        };
      }

      return manifest;
    } catch {
      throw new NotFoundException(`Evidence pack ${packId} not found`);
    }
  }

  /**
   * Verify evidence pack integrity using Merkle tree.
   */
  async verifyIntegrity(
    tenantId: string,
    packId: string,
  ): Promise<{
    valid: boolean;
    merkleRoot: string;
    tamperedFiles: string[];
    missingFiles: string[];
  }> {
    const manifest = await this.getManifest(tenantId, packId);
    const storagePath = `evidence/${tenantId}/${packId}`;

    const tamperedFiles: string[] = [];
    const missingFiles: string[] = [];

    // Verify each file hash
    for (const [filePath, expectedHash] of Object.entries(
      manifest.integrity.fileHashes,
    )) {
      try {
        const content = await this.storageService.download(
          this.bucket,
          `${storagePath}/${filePath}`,
        );
        const actualHash = this.hashBuffer(content);

        if (actualHash !== expectedHash) {
          tamperedFiles.push(filePath);
        }
      } catch {
        missingFiles.push(filePath);
      }
    }

    // Rebuild Merkle tree and verify root
    const currentHashes: Record<string, string> = {};
    for (const [filePath] of Object.entries(manifest.integrity.fileHashes)) {
      if (
        !missingFiles.includes(filePath) &&
        !tamperedFiles.includes(filePath)
      ) {
        currentHashes[filePath] = manifest.integrity.fileHashes[filePath];
      }
    }

    const merkleResult = this.integrityService.buildMerkleTree(currentHashes);
    const rootValid = merkleResult.root === manifest.integrity.merkleRoot;

    // Log verification in custody chain
    await this.custodyService.addEvent(packId, {
      actorId: 'system',
      actorType: 'orchestrator',
      action: 'integrity_verified',
      details: {
        valid:
          rootValid && tamperedFiles.length === 0 && missingFiles.length === 0,
      },
    });

    return {
      valid:
        rootValid && tamperedFiles.length === 0 && missingFiles.length === 0,
      merkleRoot: manifest.integrity.merkleRoot,
      tamperedFiles,
      missingFiles,
    };
  }

  /**
   * Verify digital signature of manifest.
   */
  async verifySignature(
    tenantId: string,
    packId: string,
  ): Promise<{
    valid: boolean;
    algorithm: string;
    signedAt: string;
    tsaTimestamp?: string;
  }> {
    const manifest = await this.getManifest(tenantId, packId);

    // Remove signature from manifest for verification
    const manifestForVerification = { ...manifest };
    const signature = manifest.signature;
    manifestForVerification.signature = {
      algorithm: signature.algorithm,
      signedAt: '',
      signatureValue: '',
      certificateFingerprint: '',
    };

    const manifestJson = JSON.stringify(manifestForVerification, null, 2);

    const isValid = await this.signatureService.verifySignature(
      manifestJson,
      signature.signatureValue,
      signature.certificateFingerprint,
    );

    // Log verification
    await this.custodyService.addEvent(packId, {
      actorId: 'system',
      actorType: 'orchestrator',
      action: 'signature_verified',
      details: { valid: isValid },
    });

    return {
      valid: isValid,
      algorithm: signature.algorithm,
      signedAt: signature.signedAt,
      tsaTimestamp: signature.tsaTimestamp,
    };
  }

  /**
   * Verify canonical hash for execution evidence payload.
   */
  async verifyCanonicalRunHash(
    tenantId: string,
    packId: string,
  ): Promise<CanonicalRunHashVerification> {
    const manifest = await this.getManifest(tenantId, packId);
    const expectedCanonicalRunHash = this.computeCanonicalRunHash(manifest);
    const manifestCanonicalRunHash =
      manifest.verification?.canonicalRunHash ?? '';

    await this.custodyService.addEvent(packId, {
      actorId: 'system',
      actorType: 'orchestrator',
      action: 'canonical_hash_verified',
      details: {
        valid: expectedCanonicalRunHash === manifestCanonicalRunHash,
      },
    });

    return {
      valid: expectedCanonicalRunHash === manifestCanonicalRunHash,
      expectedCanonicalRunHash,
      manifestCanonicalRunHash,
      canonicalSchema:
        manifest.verification?.canonicalSchema ?? 'run-evidence-v1',
      canonicalAlgorithm:
        manifest.verification?.canonicalAlgorithm ?? 'SHA-256',
    };
  }

  /**
   * Generate controlled export bundle for auditors/compliance officers.
   * Does not expose decrypted payload; optionally includes short-lived download URLs.
   */
  async exportForAuditor(
    tenantId: string,
    packId: string,
    options: {
      requestedBy: string;
      includeDownloadUrls?: boolean;
      expiresInSeconds?: number;
    },
  ): Promise<{
    packId: string;
    tenantId: string;
    exportedAt: string;
    verification: {
      integrity: { valid: boolean; merkleRoot: string };
      signature: { valid: boolean; algorithm: string; signedAt: string };
      canonicalRunHash: CanonicalRunHashVerification;
      custodyChainValid: boolean;
    };
    manifest: EvidenceManifest;
    checksums: Record<string, any> | null;
    files?: Array<{
      path: string;
      signedUrl: string;
      expiresInSeconds: number;
    }>;
  }> {
    const manifest = await this.getManifest(tenantId, packId);
    const integrity = await this.verifyIntegrity(tenantId, packId);
    const signature = await this.verifySignature(tenantId, packId);
    const canonicalRunHash = await this.verifyCanonicalRunHash(
      tenantId,
      packId,
    );
    const custody = await this.getChainOfCustody(tenantId, packId);

    const checksumsPath = `evidence/${tenantId}/${packId}/checksums.json`;
    let checksums: Record<string, any> | null = null;
    try {
      const checksumBuffer = await this.storageService.download(
        this.bucket,
        checksumsPath,
      );
      checksums = JSON.parse(checksumBuffer.toString('utf-8')) as Record<
        string,
        any
      >;
    } catch {
      checksums = null;
    }

    const includeDownloadUrls = options.includeDownloadUrls === true;
    const expiresInSeconds = this.normalizeExportExpiry(
      options.expiresInSeconds,
    );
    let files:
      | Array<{ path: string; signedUrl: string; expiresInSeconds: number }>
      | undefined;

    if (includeDownloadUrls) {
      const filePaths = [
        ...Object.keys(manifest.integrity.fileHashes),
        'manifest.json',
        'checksums.json',
      ];
      files = [];
      for (const filePath of filePaths) {
        const signedUrl = await this.storageService.getSignedUrl(
          this.bucket,
          `evidence/${tenantId}/${packId}/${filePath}`,
          expiresInSeconds,
        );
        files.push({ path: filePath, signedUrl, expiresInSeconds });
      }
    }

    await this.custodyService.addEvent(packId, {
      actorId: options.requestedBy,
      actorType: 'auditor',
      action: 'pack_exported',
      details: {
        includeDownloadUrls,
        expiresInSeconds,
      },
    });

    return {
      packId,
      tenantId,
      exportedAt: new Date().toISOString(),
      verification: {
        integrity: {
          valid: integrity.valid,
          merkleRoot: integrity.merkleRoot,
        },
        signature: {
          valid: signature.valid,
          algorithm: signature.algorithm,
          signedAt: signature.signedAt,
        },
        canonicalRunHash,
        custodyChainValid: custody.chainValid,
      },
      manifest,
      checksums,
      files,
    };
  }

  /**
   * Get chain of custody for evidence pack.
   */
  async getChainOfCustody(
    tenantId: string,
    packId: string,
  ): Promise<{ events: CustodyEvent[]; chainValid: boolean }> {
    await this.getManifest(tenantId, packId);

    // Get latest custody events (manifest might be stale)
    const currentChain = await this.custodyService.getChain(packId);

    // Verify chain integrity
    const chainValid = await this.custodyService.verifyChain(packId);

    return {
      events: currentChain.events,
      chainValid,
    };
  }

  /**
   * Apply legal hold to evidence pack.
   */
  async applyLegalHold(
    tenantId: string,
    packId: string,
    holdInfo: {
      reason: string;
      requestedBy: string;
      caseId?: string;
    },
  ): Promise<void> {
    const manifest = await this.getManifest(tenantId, packId);

    // Update manifest with legal hold
    manifest.retention.legalHold = true;
    manifest.retention.expiresAt = null; // Never expires under legal hold

    // Store updated manifest
    const storagePath = `evidence/${tenantId}/${packId}/manifest.json`;
    await this.storageService.upload(
      this.bucket,
      storagePath,
      Buffer.from(JSON.stringify(manifest, null, 2)),
    );

    // Log in custody chain
    await this.custodyService.addEvent(packId, {
      actorId: holdInfo.requestedBy,
      actorType: 'user',
      action: 'legal_hold_applied',
      details: holdInfo,
    });

    this.logger.log(`Legal hold applied to evidence pack ${packId}`);
  }

  /**
   * List evidence packs for a tenant.
   */
  async listPacks(
    tenantId: string,
    options: {
      page?: number;
      limit?: number;
      botId?: string;
      from?: Date;
      to?: Date;
    } = {},
  ): Promise<{
    packs: Array<{
      packId: string;
      executionId: string;
      botId: string;
      botName: string;
      createdAt: string;
      merkleRoot: string;
      totalFiles: number;
    }>;
    total: number;
  }> {
    const { page = 1, limit = 20 } = options;

    // List from storage (in production, this would query a database)
    const basePath = `evidence/${tenantId}`;
    const storageObjects = await this.storageService.list(
      this.bucket,
      basePath,
    );
    const packDirs = storageObjects
      .map((obj) => obj.key.split('/')[2])
      .filter((v, i, a) => a.indexOf(v) === i);

    const packs: Array<{
      packId: string;
      executionId: string;
      botId: string;
      botName: string;
      createdAt: string;
      merkleRoot: string;
      totalFiles: number;
    }> = [];

    for (const dir of packDirs) {
      try {
        const manifest = await this.getManifest(tenantId, dir);

        // Apply filters
        if (options.botId && manifest.botId !== options.botId) continue;
        if (options.from && new Date(manifest.createdAt) < options.from)
          continue;
        if (options.to && new Date(manifest.createdAt) > options.to) continue;

        packs.push({
          packId: manifest.packId,
          executionId: manifest.executionId,
          botId: manifest.botId,
          botName: manifest.botName,
          createdAt: manifest.createdAt,
          merkleRoot: manifest.integrity.merkleRoot,
          totalFiles: manifest.integrity.totalFiles,
        });
      } catch {
        // Skip invalid packs
      }
    }

    // Sort by creation date (newest first)
    packs.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    // Paginate
    const start = (page - 1) * limit;
    const paginated = packs.slice(start, start + limit);

    return {
      packs: paginated,
      total: packs.length,
    };
  }

  /**
   * Enforce retention policy for all packs in a tenant.
   * Deletes expired packs unless legal hold is active.
   */
  async enforceRetentionForTenant(
    tenantId: string,
  ): Promise<EvidenceRetentionEnforcementResult> {
    const basePath = `evidence/${tenantId}`;
    const storageObjects = await this.storageService.list(
      this.bucket,
      basePath,
    );
    const packIds = this.extractPackIds(storageObjects.map((obj) => obj.key));

    const now = new Date();
    const result: EvidenceRetentionEnforcementResult = {
      tenantId,
      evaluatedPacks: 0,
      deletedPacks: 0,
      skippedLegalHold: 0,
      skippedPermanent: 0,
      skippedUnexpired: 0,
      errors: [],
    };

    for (const packId of packIds) {
      result.evaluatedPacks += 1;
      try {
        const manifest = await this.getManifest(tenantId, packId);
        if (manifest.retention.legalHold) {
          result.skippedLegalHold += 1;
          continue;
        }

        if (!manifest.retention.expiresAt) {
          result.skippedPermanent += 1;
          continue;
        }

        const expiresAt = new Date(manifest.retention.expiresAt);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt > now) {
          result.skippedUnexpired += 1;
          continue;
        }

        await this.custodyService.addEvent(packId, {
          actorId: 'system',
          actorType: 'orchestrator',
          action: 'retention_delete_enforced',
          details: {
            policy: manifest.retention.policy,
            expiredAt: manifest.retention.expiresAt,
          },
        });

        const packPrefix = `evidence/${tenantId}/${packId}/`;
        const packObjects = await this.storageService.list(
          this.bucket,
          packPrefix,
        );
        for (const object of packObjects) {
          await this.storageService.delete(this.bucket, object.key);
        }
        result.deletedPacks += 1;
      } catch (error) {
        result.errors.push({
          packId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Scheduled retention enforcement across tenants.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async enforceRetentionPolicies(): Promise<void> {
    const enabled = this.configService.get<boolean>(
      'evidence.retention.enforcementEnabled',
      true,
    );
    if (!enabled) {
      return;
    }

    const objects = await this.storageService.list(this.bucket, 'evidence/');
    const tenantIds = this.extractTenantIds(objects.map((obj) => obj.key));

    for (const tenantId of tenantIds) {
      const summary = await this.enforceRetentionForTenant(tenantId);
      if (summary.deletedPacks > 0 || summary.errors.length > 0) {
        this.logger.log(
          `Retention enforcement tenant=${tenantId} evaluated=${summary.evaluatedPacks} deleted=${summary.deletedPacks} errors=${summary.errors.length}`,
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Private Helper Methods
  // ─────────────────────────────────────────────────────────────────

  private generatePackId(executionId: string): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    const executionPrefix = crypto
      .createHash('sha256')
      .update(executionId)
      .digest('hex')
      .slice(0, 8);
    return `evp_${timestamp}_${executionPrefix}_${random}`;
  }

  private hashBuffer(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private async storeEvidencePack(
    basePath: string,
    files: Record<string, Buffer>,
  ): Promise<void> {
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = `${basePath}/${filePath}`;
      await this.storageService.upload(this.bucket, fullPath, content);
    }
  }

  private normalizeExportExpiry(expiresInSeconds?: number): number {
    const configured = this.configService.get<number>(
      'evidence.export.defaultTtlSeconds',
      900,
    );
    const input = expiresInSeconds ?? configured;
    return Math.max(60, Math.min(input, 3600));
  }

  private extractTenantIds(keys: string[]): string[] {
    const tenants = new Set<string>();
    for (const key of keys) {
      const parts = key.split('/');
      if (parts[0] === 'evidence' && parts[1]) {
        tenants.add(parts[1]);
      }
    }
    return Array.from(tenants);
  }

  private extractPackIds(keys: string[]): string[] {
    const packs = new Set<string>();
    for (const key of keys) {
      const parts = key.split('/');
      if (parts[0] === 'evidence' && parts[2]) {
        packs.add(parts[2]);
      }
    }
    return Array.from(packs);
  }

  private computeCanonicalRunHash(manifest: EvidenceManifest): string {
    const canonicalPayload = {
      executionId: manifest.executionId,
      botId: manifest.botId,
      tenantId: manifest.tenantId,
      createdAt: manifest.createdAt,
      completedAt: manifest.completedAt,
      integrity: {
        merkleRoot: manifest.integrity.merkleRoot,
        merkleAlgorithm: manifest.integrity.merkleAlgorithm,
        totalFiles: manifest.integrity.totalFiles,
        treeDepth: manifest.integrity.treeDepth,
        fileHashes: manifest.integrity.fileHashes,
      },
      encryption: {
        algorithm: manifest.encryption.algorithm,
        keyId: manifest.encryption.keyId,
        keyProvider: manifest.encryption.keyProvider,
      },
      retention: {
        policy: manifest.retention.policy,
        expiresAt: manifest.retention.expiresAt,
        legalHold: manifest.retention.legalHold,
      },
      contents: {
        screenshots: [...manifest.contents.screenshots].sort(),
        decisions: [...manifest.contents.decisions].sort(),
        lineage: [...manifest.contents.lineage].sort(),
        logs: [...manifest.contents.logs].sort(),
        compliance: [...manifest.contents.compliance].sort(),
      },
    };

    const canonical = this.stringifyCanonical(canonicalPayload);
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  private stringifyCanonical(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stringifyCanonical(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      return `{${keys
        .map((key) => `"${key}":${this.stringifyCanonical(record[key])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }
}
