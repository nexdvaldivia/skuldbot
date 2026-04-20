import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Unique,
} from 'typeorm';

/**
 * Credential type classification
 */
export enum CredentialType {
  // Authentication credentials
  USERNAME_PASSWORD = 'username_password',
  API_KEY = 'api_key',
  OAUTH2_CLIENT = 'oauth2_client',
  OAUTH2_TOKEN = 'oauth2_token',
  BEARER_TOKEN = 'bearer_token',
  BASIC_AUTH = 'basic_auth',
  JWT = 'jwt',
  SAML = 'saml',
  CERTIFICATE = 'certificate',
  SSH_KEY = 'ssh_key',
  PGP_KEY = 'pgp_key',

  // Database credentials
  DATABASE_CONNECTION = 'database_connection',

  // Cloud provider credentials
  AWS_CREDENTIALS = 'aws_credentials',
  AZURE_SERVICE_PRINCIPAL = 'azure_service_principal',
  GCP_SERVICE_ACCOUNT = 'gcp_service_account',

  // Service-specific
  SMTP_CREDENTIALS = 'smtp_credentials',
  SFTP_CREDENTIALS = 'sftp_credentials',
  FTP_CREDENTIALS = 'ftp_credentials',

  // Generic key-value
  GENERIC_SECRET = 'generic_secret',
  KEY_VALUE_PAIRS = 'key_value_pairs',

  // Custom
  CUSTOM = 'custom',
}

/**
 * Credential status
 */
export enum CredentialStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  PENDING_ROTATION = 'pending_rotation',
  ROTATION_FAILED = 'rotation_failed',
}

/**
 * Vault provider type (for BYO Vault)
 */
export enum VaultProvider {
  INTERNAL = 'internal', // Built-in encrypted storage
  HASHICORP_VAULT = 'hashicorp_vault',
  AWS_SECRETS_MANAGER = 'aws_secrets_manager',
  AZURE_KEY_VAULT = 'azure_key_vault',
  GCP_SECRET_MANAGER = 'gcp_secret_manager',
  CYBERARK = 'cyberark',
  CUSTOM = 'custom',
}

/**
 * Credential access scope
 */
export enum CredentialScope {
  GLOBAL = 'global', // Available to all bots in tenant
  BOT_SPECIFIC = 'bot_specific', // Only specific bots
  ENVIRONMENT = 'environment', // Environment-specific (dev/staging/prod)
  USER_SPECIFIC = 'user_specific', // Specific user's credentials
}

/**
 * Credential entity.
 *
 * Stores encrypted credentials for bot execution.
 * Supports multiple vault providers for BYO vault integration.
 *
 * Security features:
 * - AES-256-GCM encryption for internal storage
 * - External vault integration (HashiCorp, AWS, Azure, GCP)
 * - Automatic rotation policies
 * - Access audit trail
 * - Expiration tracking
 * - Fine-grained access control
 */
@Entity('credentials')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'type'])
@Index(['tenantId', 'scope'])
@Unique(['tenantId', 'name'])
export class Credential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant ID from license */
  @Column('uuid')
  @Index()
  tenantId: string;

  /**
   * Human-readable name for the credential
   */
  @Column({ length: 255 })
  name: string;

  /**
   * Unique key for referencing in bot configurations
   * Format: snake_case, e.g., 'salesforce_api_key'
   */
  @Column({ length: 128 })
  @Index()
  key: string;

  /**
   * Optional description
   */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * Credential type classification
   */
  @Column({
    type: 'enum',
    enum: CredentialType,
    default: CredentialType.GENERIC_SECRET,
  })
  type: CredentialType;

  /**
   * Credential status
   */
  @Column({
    type: 'enum',
    enum: CredentialStatus,
    default: CredentialStatus.ACTIVE,
  })
  status: CredentialStatus;

  /**
   * Access scope
   */
  @Column({
    type: 'enum',
    enum: CredentialScope,
    default: CredentialScope.GLOBAL,
  })
  scope: CredentialScope;

  /**
   * Vault provider for storage
   */
  @Column({
    type: 'enum',
    enum: VaultProvider,
    default: VaultProvider.INTERNAL,
  })
  vaultProvider: VaultProvider;

  /**
   * External vault reference (path/ARN/URI for external vaults)
   * Used when vaultProvider is not INTERNAL
   */
  @Column({ type: 'text', nullable: true })
  vaultReference: string | null;

  /**
   * Vault configuration (connection params for external vault)
   * Stored encrypted
   */
  @Column({ type: 'text', nullable: true })
  vaultConfig: string | null;

  /**
   * Encrypted credential data (for INTERNAL vault)
   * Uses AES-256-GCM with per-credential unique IV
   * Format: base64(iv):base64(authTag):base64(ciphertext)
   */
  @Column({ type: 'text', nullable: true })
  encryptedData: string | null;

  /**
   * Data encryption key ID (for key rotation support)
   */
  @Column({ nullable: true })
  encryptionKeyId: string | null;

  /**
   * Version number for optimistic concurrency
   */
  @Column({ default: 1 })
  version: number;

  /**
   * Labels for categorization and filtering
   */
  @Column({ type: 'jsonb', default: {} })
  labels: Record<string, string>;

  /**
   * Metadata (non-sensitive additional info)
   */
  @Column({ type: 'jsonb', default: {} })
  metadata: {
    url?: string;
    host?: string;
    port?: number;
    database?: string;
    region?: string;
    environment?: string;
    service?: string;
    custom?: Record<string, any>;
  };

  /**
   * Allowed bot IDs (for BOT_SPECIFIC scope)
   */
  @Column({ type: 'uuid', array: true, default: [] })
  allowedBotIds: string[];

  /**
   * Allowed environment names (for ENVIRONMENT scope)
   */
  @Column({ type: 'text', array: true, default: [] })
  allowedEnvironments: string[];

  /**
   * Owner user ID (for USER_SPECIFIC scope)
   */
  @Column({ type: 'uuid', nullable: true })
  ownerUserId: string | null;

  /**
   * Expiration date (optional)
   */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  /**
   * Auto-rotation configuration
   */
  @Column({ type: 'jsonb', nullable: true })
  rotationConfig: {
    enabled: boolean;
    intervalDays: number;
    notifyDaysBefore?: number;
    rotationStrategy?: 'manual' | 'automatic' | 'external';
    rotationScript?: string;
    lastRotatedAt?: Date;
    nextRotationAt?: Date;
    consecutiveFailures?: number;
    maxFailures?: number;
  } | null;

  /**
   * Audit configuration
   */
  @Column({ type: 'jsonb', default: {} })
  auditConfig: {
    logAccess: boolean;
    logDecryption: boolean;
    alertOnUnauthorized: boolean;
    retentionDays?: number;
  };

  /**
   * Access statistics
   */
  @Column({ default: 0 })
  accessCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastAccessedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  lastAccessedBy: string | null;

  @Column({ nullable: true })
  lastAccessedFrom: string | null;

  /**
   * Created by user ID
   */
  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  /**
   * Updated by user ID
   */
  @Column({ type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  /**
   * Access logs relation
   */
  @OneToMany(() => CredentialAccessLog, (log) => log.credential)
  accessLogs: CredentialAccessLog[];
}

/**
 * Credential access log entry.
 *
 * Records every access to credentials for compliance and security.
 */
@Entity('credential_access_logs')
@Index(['credentialId', 'accessedAt'])
@Index(['tenantId', 'accessedAt'])
@Index(['userId', 'accessedAt'])
export class CredentialAccessLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  credentialId: string;

  @ManyToOne(() => Credential, (cred) => cred.accessLogs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'credentialId' })
  credential: Credential;

  @Column('uuid')
  @Index()
  tenantId: string;

  /**
   * User who accessed the credential (null for system/bot access)
   */
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  /**
   * Runner ID (for bot execution access)
   */
  @Column({ type: 'uuid', nullable: true })
  runnerId: string | null;

  /**
   * Run ID (for bot execution access)
   */
  @Column({ type: 'uuid', nullable: true })
  runId: string | null;

  /**
   * Bot ID (for bot execution access)
   */
  @Column({ type: 'uuid', nullable: true })
  botId: string | null;

  /**
   * Access action type
   */
  @Column({
    type: 'enum',
    enum: ['read', 'decrypt', 'update', 'delete', 'rotate', 'revoke'],
  })
  action: 'read' | 'decrypt' | 'update' | 'delete' | 'rotate' | 'revoke';

  /**
   * Whether access was successful
   */
  @Column({ default: true })
  success: boolean;

  /**
   * Denial reason (if access was denied)
   */
  @Column({ type: 'text', nullable: true })
  denialReason: string | null;

  /**
   * IP address of the accessor
   */
  @Column({ nullable: true })
  ipAddress: string | null;

  /**
   * User agent or client info
   */
  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  /**
   * Access context (why was it accessed)
   */
  @Column({ type: 'jsonb', default: {} })
  context: {
    purpose?: string;
    nodeName?: string;
    nodeId?: string;
    environment?: string;
  };

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  @Index()
  accessedAt: Date;
}

/**
 * Credential rotation history.
 *
 * Tracks credential rotation events for compliance and troubleshooting.
 */
@Entity('credential_rotation_history')
@Index(['credentialId', 'rotatedAt'])
@Index(['tenantId', 'rotatedAt'])
export class CredentialRotationHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  credentialId: string;

  @ManyToOne(() => Credential, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'credentialId' })
  credential: Credential;

  @Column('uuid')
  tenantId: string;

  /**
   * Rotation trigger type
   */
  @Column({
    type: 'enum',
    enum: ['manual', 'scheduled', 'forced', 'expiration'],
  })
  triggerType: 'manual' | 'scheduled' | 'forced' | 'expiration';

  /**
   * User who initiated (for manual rotation)
   */
  @Column({ type: 'uuid', nullable: true })
  initiatedBy: string | null;

  /**
   * Previous version number
   */
  @Column()
  previousVersion: number;

  /**
   * New version number
   */
  @Column()
  newVersion: number;

  /**
   * Whether rotation was successful
   */
  @Column({ default: true })
  success: boolean;

  /**
   * Error message if rotation failed
   */
  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  /**
   * Rotation duration in milliseconds
   */
  @Column({ nullable: true })
  durationMs: number | null;

  /**
   * Rotation metadata
   */
  @Column({ type: 'jsonb', default: {} })
  metadata: {
    strategy?: string;
    rollbackAvailable?: boolean;
    affectedBots?: string[];
    affectedRuns?: string[];
  };

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  @Index()
  rotatedAt: Date;
}

/**
 * Credential folder for organization.
 *
 * Allows hierarchical organization of credentials.
 */
@Entity('credential_folders')
@Unique(['tenantId', 'path'])
export class CredentialFolder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant ID from license */
  @Column('uuid')
  @Index()
  tenantId: string;

  /**
   * Folder name
   */
  @Column({ length: 255 })
  name: string;

  /**
   * Full path (e.g., '/production/databases')
   */
  @Column({ length: 1024 })
  @Index()
  path: string;

  /**
   * Parent folder ID (null for root)
   */
  @Column({ type: 'uuid', nullable: true })
  parentId: string | null;

  @ManyToOne(() => CredentialFolder, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'parentId' })
  parent: CredentialFolder | null;

  /**
   * Description
   */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * Icon for UI
   */
  @Column({ length: 64, nullable: true })
  icon: string | null;

  /**
   * Access permissions (inheritable)
   */
  @Column({ type: 'jsonb', default: {} })
  permissions: {
    inheritFromParent: boolean;
    allowedRoles?: string[];
    allowedUsers?: string[];
    denyUsers?: string[];
  };

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/**
 * External vault connection configuration.
 *
 * Stores connection details for external vault providers.
 */
@Entity('vault_connections')
@Unique(['tenantId', 'name'])
export class VaultConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant ID from license */
  @Column('uuid')
  @Index()
  tenantId: string;

  /**
   * Connection name
   */
  @Column({ length: 255 })
  name: string;

  /**
   * Vault provider type
   */
  @Column({
    type: 'enum',
    enum: VaultProvider,
  })
  provider: VaultProvider;

  /**
   * Connection is active/enabled
   */
  @Column({ default: true })
  isActive: boolean;

  /**
   * Connection configuration (encrypted)
   * Contains provider-specific connection details
   */
  @Column({ type: 'text' })
  encryptedConfig: string;

  /**
   * Last successful connection timestamp
   */
  @Column({ type: 'timestamptz', nullable: true })
  lastConnectedAt: Date | null;

  /**
   * Last connection error
   */
  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  /**
   * Health check configuration
   */
  @Column({ type: 'jsonb', default: {} })
  healthCheck: {
    enabled: boolean;
    intervalMinutes?: number;
    lastCheckAt?: Date;
    lastCheckSuccess?: boolean;
  };

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
