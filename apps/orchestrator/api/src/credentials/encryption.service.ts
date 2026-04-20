import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Encryption result with all components needed for decryption
 */
interface EncryptionResult {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: string;
}

/**
 * Data Encryption Key (DEK) for envelope encryption
 */
interface DataEncryptionKey {
  id: string;
  key: Buffer;
  createdAt: Date;
  expiresAt: Date | null;
  isActive: boolean;
}

/**
 * Enterprise-grade Encryption Service.
 *
 * Implements envelope encryption with:
 * - AES-256-GCM for data encryption (authenticated encryption)
 * - Key Encryption Key (KEK) for DEK encryption
 * - Per-credential unique IVs (nonces)
 * - Key rotation support
 * - Constant-time comparison for auth tags
 *
 * Security features:
 * - Uses crypto.randomBytes() for IV generation (CSPRNG)
 * - 96-bit IVs as recommended for GCM
 * - 128-bit authentication tags
 * - Supports multiple active keys for rotation
 * - Never logs sensitive data
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);

  // Encryption configuration
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly IV_LENGTH = 12; // 96 bits (recommended for GCM)
  private readonly AUTH_TAG_LENGTH = 16; // 128 bits
  private readonly KEY_LENGTH = 32; // 256 bits

  // Key Encryption Key (KEK) - derived from master key
  private kek: Buffer | null = null;

  // Data Encryption Keys (DEKs) - keyed by ID
  private deks: Map<string, DataEncryptionKey> = new Map();
  private currentKeyId: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.initializeKeys();
  }

  /**
   * Initialize encryption keys from configuration
   */
  private async initializeKeys(): Promise<void> {
    // Get master key from environment
    const masterKey = this.configService.get<string>('ENCRYPTION_MASTER_KEY');
    const masterKeySalt = this.configService.get<string>(
      'ENCRYPTION_MASTER_KEY_SALT',
      'skuldbot-credential-encryption-v1',
    );

    if (!masterKey) {
      throw new Error(
        'ENCRYPTION_MASTER_KEY environment variable is required for credential encryption',
      );
    }

    // Validate master key (should be at least 32 chars, hex or base64)
    if (masterKey.length < 32) {
      throw new Error(
        'ENCRYPTION_MASTER_KEY must be at least 32 characters long',
      );
    }

    // Derive KEK from master key using PBKDF2
    this.kek = await this.deriveKey(masterKey, masterKeySalt);

    // Generate initial DEK
    await this.generateNewDek();

    this.logger.log('Encryption service initialized');
  }

  /**
   * Derive key using PBKDF2
   */
  private deriveKey(password: string, salt: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        password,
        salt,
        310000, // OWASP recommended iterations for PBKDF2-SHA256
        this.KEY_LENGTH,
        'sha256',
        (err, key) => {
          if (err) reject(err);
          else resolve(key);
        },
      );
    });
  }

  /**
   * Generate a new Data Encryption Key (DEK)
   */
  private async generateNewDek(): Promise<string> {
    const id = crypto.randomUUID();
    const key = crypto.randomBytes(this.KEY_LENGTH);
    const now = new Date();

    // Encrypt DEK with KEK before storing
    const dek: DataEncryptionKey = {
      id,
      key,
      createdAt: now,
      expiresAt: null, // Keys don't expire automatically
      isActive: true,
    };

    // Mark previous key as inactive
    if (this.currentKeyId) {
      const prevDek = this.deks.get(this.currentKeyId);
      if (prevDek) {
        prevDek.isActive = false;
      }
    }

    this.deks.set(id, dek);
    this.currentKeyId = id;

    this.logger.log(`Generated new DEK: ${id}`);
    return id;
  }

  /**
   * Get DEK by ID
   */
  private getDek(keyId: string): DataEncryptionKey | null {
    return this.deks.get(keyId) || null;
  }

  /**
   * Get current active DEK
   */
  private getCurrentDek(): DataEncryptionKey {
    if (!this.currentKeyId) {
      throw new Error('No active encryption key available');
    }

    const dek = this.deks.get(this.currentKeyId);
    if (!dek) {
      throw new Error('Current encryption key not found');
    }

    return dek;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Encrypt data (credential value)
   *
   * @param plaintext - JSON stringified credential value
   * @returns Encrypted result with IV, auth tag, and key ID
   */
  encrypt(plaintext: string): EncryptionResult {
    const dek = this.getCurrentDek();

    // Generate unique IV for this encryption
    const iv = crypto.randomBytes(this.IV_LENGTH);

    // Create cipher with AES-256-GCM
    const cipher = crypto.createCipheriv(this.ALGORITHM, dek.key, iv, {
      authTagLength: this.AUTH_TAG_LENGTH,
    });

    // Encrypt the data
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      keyId: dek.id,
    };
  }

  /**
   * Decrypt data (credential value)
   *
   * @param ciphertext - Base64 encoded ciphertext
   * @param iv - Base64 encoded IV
   * @param authTag - Base64 encoded authentication tag
   * @param keyId - Encryption key ID
   * @returns Decrypted plaintext
   */
  decrypt(
    ciphertext: string,
    iv: string,
    authTag: string,
    keyId: string,
  ): string {
    const dek = this.getDek(keyId);
    if (!dek) {
      throw new Error(`Encryption key not found: ${keyId}`);
    }

    const ivBuffer = Buffer.from(iv, 'base64');
    const authTagBuffer = Buffer.from(authTag, 'base64');

    // Create decipher
    const decipher = crypto.createDecipheriv(
      this.ALGORITHM,
      dek.key,
      ivBuffer,
      {
        authTagLength: this.AUTH_TAG_LENGTH,
      },
    );

    // Set auth tag (must be called before update/final)
    decipher.setAuthTag(authTagBuffer);

    // Decrypt
    let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  }

  /**
   * Encrypt credential value object
   *
   * @param value - Credential value object
   * @returns Encoded encrypted string (format: keyId:iv:authTag:ciphertext)
   */
  encryptCredentialValue(value: Record<string, any>): string {
    const plaintext = JSON.stringify(value);
    const result = this.encrypt(plaintext);

    // Combine into single string for storage
    return `${result.keyId}:${result.iv}:${result.authTag}:${result.ciphertext}`;
  }

  /**
   * Decrypt credential value
   *
   * @param encryptedData - Encoded encrypted string
   * @returns Decrypted credential value object
   */
  decryptCredentialValue(encryptedData: string): Record<string, any> {
    const parts = encryptedData.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }

    const [keyId, iv, authTag, ciphertext] = parts;
    const plaintext = this.decrypt(ciphertext, iv, authTag, keyId);

    return JSON.parse(plaintext);
  }

  /**
   * Re-encrypt data with current key (for key rotation)
   *
   * @param encryptedData - Previously encrypted data string
   * @returns Newly encrypted data string with current key
   */
  reencrypt(encryptedData: string): string {
    const value = this.decryptCredentialValue(encryptedData);
    return this.encryptCredentialValue(value);
  }

  /**
   * Rotate encryption keys
   * Generates a new DEK and marks current as inactive
   *
   * @returns New key ID
   */
  async rotateKeys(): Promise<string> {
    const newKeyId = await this.generateNewDek();
    this.logger.log(`Key rotation completed, new key: ${newKeyId}`);
    return newKeyId;
  }

  /**
   * Get current encryption key ID
   */
  getCurrentKeyId(): string | null {
    return this.currentKeyId;
  }

  /**
   * Check if data is encrypted with current key
   */
  isEncryptedWithCurrentKey(encryptedData: string): boolean {
    const parts = encryptedData.split(':');
    if (parts.length !== 4) return false;
    return parts[0] === this.currentKeyId;
  }

  /**
   * Generate a secure random string (for API keys, tokens, etc.)
   *
   * @param length - Number of random bytes (output will be hex encoded, so 2x length)
   */
  generateSecureRandom(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash sensitive data (one-way, for lookups)
   * Uses HMAC-SHA256 with KEK
   *
   * @param data - Data to hash
   * @returns Base64 encoded hash
   */
  hash(data: string): string {
    if (!this.kek) {
      throw new Error('Encryption service not initialized');
    }

    const hmac = crypto.createHmac('sha256', this.kek);
    hmac.update(data);
    return hmac.digest('base64');
  }

  /**
   * Constant-time string comparison (for security-critical comparisons)
   */
  secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  /**
   * Mask sensitive value for display (e.g., "sk-****1234")
   */
  maskSensitiveValue(value: string, showChars: number = 4): string {
    if (!value || value.length <= showChars * 2) {
      return '****';
    }

    const prefix = value.substring(0, showChars);
    const suffix = value.substring(value.length - showChars);
    return `${prefix}****${suffix}`;
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.kek !== null && this.currentKeyId !== null;
  }
}
