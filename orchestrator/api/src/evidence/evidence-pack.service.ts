import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

import type { StorageService } from '../storage/storage.interface';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import { EncryptionService } from './encryption/encryption.service';
import { SignatureService } from './signature/signature.service';
import { IntegrityService } from './integrity/integrity.service';
import { CustodyService } from './custody/custody.service';

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
  ) {
    this.bucket = this.configService.get<string>('storage.evidenceBucket', 'skuldbot-evidence');
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

    this.logger.log(`Creating evidence pack ${packId} for execution ${params.executionId}`);

    // Prepare files for the pack
    const files: Record<string, Buffer> = {};
    const fileHashes: Record<string, string> = {};

    // Add screenshots (encrypted)
    for (let i = 0; i < params.screenshots.length; i++) {
      const fileName = `screenshots/screenshot_${i.toString().padStart(3, '0')}.png.enc`;
      const encrypted = await this.encryptionService.encrypt(params.screenshots[i]);
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
      const content = Buffer.from(JSON.stringify(params.complianceResults[i], null, 2));
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
    const expiresAt = this.calculateExpiration(retentionPolicy);

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
        screenshots: Object.keys(files).filter((f) => f.startsWith('screenshots/')),
        decisions: Object.keys(files).filter((f) => f.startsWith('decisions/')),
        lineage: Object.keys(files).filter((f) => f.startsWith('lineage/')),
        logs: Object.keys(files).filter((f) => f.startsWith('logs/')),
        compliance: Object.keys(files).filter((f) => f.startsWith('compliance/')),
      },
    };

    // Sign the manifest
    const manifestJson = JSON.stringify(manifest, null, 2);
    const signatureResult = await this.signatureService.signManifest(manifestJson);

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
    files['checksums.json'] = Buffer.from(JSON.stringify({
      merkleRoot: merkleResult.root,
      algorithm: 'SHA-256',
      files: fileHashes,
    }, null, 2));

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

    this.logger.log(`Evidence pack ${packId} created with ${Object.keys(files).length} files`);

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
      const content = await this.storageService.download(this.bucket, storagePath);
      return JSON.parse(content.toString());
    } catch (error) {
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
    for (const [filePath, expectedHash] of Object.entries(manifest.integrity.fileHashes)) {
      try {
        const content = await this.storageService.download(this.bucket, `${storagePath}/${filePath}`);
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
      if (!missingFiles.includes(filePath) && !tamperedFiles.includes(filePath)) {
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
      details: { valid: rootValid && tamperedFiles.length === 0 && missingFiles.length === 0 },
    });

    return {
      valid: rootValid && tamperedFiles.length === 0 && missingFiles.length === 0,
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
   * Get chain of custody for evidence pack.
   */
  async getChainOfCustody(
    tenantId: string,
    packId: string,
  ): Promise<{ events: CustodyEvent[]; chainValid: boolean }> {
    const manifest = await this.getManifest(tenantId, packId);

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
    const storageObjects = await this.storageService.list(this.bucket, basePath);
    const packDirs = storageObjects.map(obj => obj.key.split('/')[2]).filter((v, i, a) => a.indexOf(v) === i);

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
        if (options.from && new Date(manifest.createdAt) < options.from) continue;
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
    packs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Paginate
    const start = (page - 1) * limit;
    const paginated = packs.slice(start, start + limit);

    return {
      packs: paginated,
      total: packs.length,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Private Helper Methods
  // ─────────────────────────────────────────────────────────────────

  private generatePackId(executionId: string): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `evp_${timestamp}_${random}`;
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

  private calculateExpiration(policy: string): Date | null {
    const now = new Date();

    switch (policy) {
      case 'temporary':
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
      case 'standard':
        return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year
      case 'compliance':
        return new Date(now.getTime() + 7 * 365 * 24 * 60 * 60 * 1000); // 7 years
      case 'permanent':
        return null; // Never expires
      default:
        return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // Default 1 year
    }
  }
}
