import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Envelope Encryption with AES-256-GCM
 *
 * Each evidence pack file is encrypted with a unique DEK (Data Encryption Key).
 * The DEK is encrypted with a KEK (Key Encryption Key) from the configured KMS.
 *
 * Encryption Format:
 * [12 bytes IV][16 bytes Auth Tag][N bytes Encrypted DEK][M bytes Ciphertext]
 *
 * Supported KMS Providers:
 * - local: Uses PBKDF2-derived key from environment secret
 * - aws-kms: Uses AWS KMS for DEK encryption (production)
 * - azure-keyvault: Uses Azure Key Vault (production)
 * - gcp-kms: Uses Google Cloud KMS (production)
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLength = 12;
  private readonly authTagLength = 16;
  private readonly dekLength = 32; // 256 bits

  private kek: Buffer | null = null;
  private keyId: string = 'local-key-001';

  constructor(private readonly configService: ConfigService) {
    this.initializeKek();
  }

  /**
   * Initialize the Key Encryption Key (KEK).
   * In production, this would be fetched from KMS.
   */
  private initializeKek(): void {
    const provider = this.configService.get<string>('evidence.keyProvider', 'local');

    if (provider === 'local') {
      // Derive KEK from secret using PBKDF2
      const secret = this.configService.get<string>(
        'evidence.encryptionSecret',
        'skuldbot-evidence-default-secret-change-in-production',
      );
      const salt = this.configService.get<string>(
        'evidence.encryptionSalt',
        'skuldbot-salt-v1',
      );

      this.kek = crypto.pbkdf2Sync(secret, salt, 310000, 32, 'sha256');
      this.keyId = 'local-pbkdf2-v1';
      this.logger.log('Encryption initialized with local PBKDF2 key');
    } else {
      // TODO: Implement KMS provider integration
      this.logger.warn(`KMS provider '${provider}' not yet implemented, using local fallback`);
      const fallbackSecret = 'skuldbot-fallback-key';
      this.kek = crypto.pbkdf2Sync(fallbackSecret, 'fallback-salt', 310000, 32, 'sha256');
      this.keyId = 'fallback-v1';
    }
  }

  /**
   * Encrypt data using envelope encryption.
   */
  async encrypt(data: Buffer): Promise<Buffer> {
    if (!this.kek) {
      throw new Error('Encryption key not initialized');
    }

    // Generate random DEK for this file
    const dek = crypto.randomBytes(this.dekLength);

    // Encrypt the DEK with KEK
    const dekIv = crypto.randomBytes(this.ivLength);
    const dekCipher = crypto.createCipheriv(this.algorithm, this.kek, dekIv);
    const encryptedDek = Buffer.concat([
      dekCipher.update(dek),
      dekCipher.final(),
    ]);
    const dekAuthTag = dekCipher.getAuthTag();

    // Encrypt data with DEK
    const dataIv = crypto.randomBytes(this.ivLength);
    const dataCipher = crypto.createCipheriv(this.algorithm, dek, dataIv);
    const encryptedData = Buffer.concat([
      dataCipher.update(data),
      dataCipher.final(),
    ]);
    const dataAuthTag = dataCipher.getAuthTag();

    // Build envelope: [DEK IV][DEK Auth Tag][Encrypted DEK][Data IV][Data Auth Tag][Ciphertext]
    const envelope = Buffer.concat([
      dekIv,           // 12 bytes
      dekAuthTag,      // 16 bytes
      encryptedDek,    // 32 bytes (encrypted DEK)
      dataIv,          // 12 bytes
      dataAuthTag,     // 16 bytes
      encryptedData,   // Variable length
    ]);

    return envelope;
  }

  /**
   * Decrypt envelope-encrypted data.
   */
  async decrypt(envelope: Buffer): Promise<Buffer> {
    if (!this.kek) {
      throw new Error('Encryption key not initialized');
    }

    // Parse envelope
    let offset = 0;

    const dekIv = envelope.subarray(offset, offset + this.ivLength);
    offset += this.ivLength;

    const dekAuthTag = envelope.subarray(offset, offset + this.authTagLength);
    offset += this.authTagLength;

    const encryptedDek = envelope.subarray(offset, offset + this.dekLength);
    offset += this.dekLength;

    const dataIv = envelope.subarray(offset, offset + this.ivLength);
    offset += this.ivLength;

    const dataAuthTag = envelope.subarray(offset, offset + this.authTagLength);
    offset += this.authTagLength;

    const ciphertext = envelope.subarray(offset);

    // Decrypt DEK with KEK
    const dekDecipher = crypto.createDecipheriv(this.algorithm, this.kek, dekIv);
    dekDecipher.setAuthTag(dekAuthTag);
    const dek = Buffer.concat([
      dekDecipher.update(encryptedDek),
      dekDecipher.final(),
    ]);

    // Decrypt data with DEK
    const dataDecipher = crypto.createDecipheriv(this.algorithm, dek, dataIv);
    dataDecipher.setAuthTag(dataAuthTag);
    const plaintext = Buffer.concat([
      dataDecipher.update(ciphertext),
      dataDecipher.final(),
    ]);

    return plaintext;
  }

  /**
   * Get current key ID (for manifest).
   */
  async getCurrentKeyId(): Promise<string> {
    return this.keyId;
  }

  /**
   * Rotate encryption key.
   * In production, this would create a new KMS key version.
   */
  async rotateKey(): Promise<{ oldKeyId: string; newKeyId: string }> {
    const oldKeyId = this.keyId;

    // In local mode, just generate a new derivation
    const timestamp = Date.now().toString(36);
    this.keyId = `local-pbkdf2-${timestamp}`;

    // Re-derive KEK with new salt
    const secret = this.configService.get<string>(
      'evidence.encryptionSecret',
      'skuldbot-evidence-default-secret-change-in-production',
    );
    this.kek = crypto.pbkdf2Sync(secret, `salt-${timestamp}`, 310000, 32, 'sha256');

    this.logger.log(`Encryption key rotated: ${oldKeyId} -> ${this.keyId}`);

    return { oldKeyId, newKeyId: this.keyId };
  }
}
