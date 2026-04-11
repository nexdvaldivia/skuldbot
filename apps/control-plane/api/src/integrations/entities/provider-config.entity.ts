import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import * as crypto from 'crypto';
import { IntegrationType } from '../../common/interfaces/integration.interface';

/**
 * ProviderConfig - Stores configuration for integration providers.
 *
 * Credentials are encrypted using AES-256-GCM with PBKDF2 key derivation.
 * This entity supports multi-tenant configurations where each tenant
 * can have their own provider settings.
 *
 * SECURITY NOTES:
 * - Credentials are NEVER returned in plaintext via API
 * - Encryption key should be stored in environment variables
 * - Consider using a dedicated secrets manager in production (HashiCorp Vault, AWS Secrets Manager)
 */
@Entity('provider_configs')
@Index(['type', 'name', 'tenantId'], { unique: true })
export class ProviderConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  type: IntegrationType;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ type: 'text', nullable: true })
  private encryptedCredentials: string | null;

  @Column({ type: 'jsonb', default: {} })
  settings: Record<string, unknown>;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ type: 'uuid', nullable: true })
  updatedBy: string | null;

  // Transient property for plaintext credentials (not persisted)
  private _credentials: Record<string, string> | null = null;

  /**
   * Set credentials (will be encrypted before save).
   * @param credentials Key-value pairs of credentials
   */
  setCredentials(credentials: Record<string, string>): void {
    this._credentials = credentials;
  }

  /**
   * Get decrypted credentials.
   * Requires the encryption key to be set via environment.
   */
  getCredentials(): Record<string, string> {
    if (this._credentials) {
      return this._credentials;
    }

    if (!this.encryptedCredentials) {
      return {};
    }

    try {
      return ProviderConfig.decryptCredentials(this.encryptedCredentials);
    } catch {
      throw new Error('Failed to decrypt credentials. Check encryption key.');
    }
  }

  /**
   * Check if a specific credential key exists.
   */
  hasCredential(key: string): boolean {
    const creds = this.getCredentials();
    return key in creds;
  }

  /**
   * Get a specific credential value.
   */
  getCredential(key: string): string | undefined {
    return this.getCredentials()[key];
  }

  @BeforeInsert()
  @BeforeUpdate()
  encryptCredentialsBeforeSave(): void {
    if (this._credentials) {
      this.encryptedCredentials = ProviderConfig.encryptCredentials(this._credentials);
    }
  }

  /**
   * Encrypt credentials using AES-256-GCM.
   */
  private static encryptCredentials(credentials: Record<string, string>): string {
    const encryptionKey = ProviderConfig.getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(32);

    // Derive key using PBKDF2
    const key = crypto.pbkdf2Sync(encryptionKey, salt, 100000, 32, 'sha256');

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const plaintext = JSON.stringify(credentials);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Format: salt:iv:authTag:encrypted (all base64)
    return [
      salt.toString('base64'),
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted,
    ].join(':');
  }

  /**
   * Decrypt credentials using AES-256-GCM.
   */
  private static decryptCredentials(encryptedData: string): Record<string, string> {
    const encryptionKey = ProviderConfig.getEncryptionKey();
    const parts = encryptedData.split(':');

    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }

    const [saltB64, ivB64, authTagB64, encrypted] = parts;

    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');

    // Derive key using PBKDF2
    const key = crypto.pbkdf2Sync(encryptionKey, salt, 100000, 32, 'sha256');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  /**
   * Get encryption key from environment.
   * Falls back to a default key for development (NOT SECURE for production).
   */
  private static getEncryptionKey(): string {
    const key = process.env.PROVIDER_ENCRYPTION_KEY;

    if (!key) {
      console.warn(
        'SECURITY WARNING: PROVIDER_ENCRYPTION_KEY not set. Using default key. ' +
          'This is NOT SECURE for production.',
      );
      return 'default-dev-key-do-not-use-in-prod';
    }

    return key;
  }

  /**
   * Create a sanitized version of this entity (without credentials).
   * Use this for API responses.
   */
  toSanitized(): SanitizedProviderConfig {
    const creds = this.getCredentials();

    return {
      id: this.id,
      type: this.type,
      name: this.name,
      tenantId: this.tenantId,
      isActive: this.isActive,
      isPrimary: this.isPrimary,
      settings: this.settings,
      description: this.description,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      createdBy: this.createdBy,
      updatedBy: this.updatedBy,
      hasCredentials: Object.keys(creds).length > 0,
      credentialKeys: Object.keys(creds),
    };
  }
}

/**
 * Sanitized version of ProviderConfig for API responses.
 * Does not include encrypted credentials.
 */
export interface SanitizedProviderConfig {
  id: string;
  type: string;
  name: string;
  tenantId: string | null;
  isActive: boolean;
  isPrimary: boolean;
  settings: Record<string, unknown>;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  hasCredentials: boolean;
  credentialKeys: string[];
}
