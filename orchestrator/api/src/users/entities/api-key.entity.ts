import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum ApiKeyStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

/**
 * API Key environment (live or test mode).
 */
export enum ApiKeyEnvironment {
  LIVE = 'live',
  TEST = 'test',
}

/**
 * API Key scopes define what the key can access.
 */
export enum ApiKeyScope {
  BOTS_READ = 'bots:read',
  BOTS_WRITE = 'bots:write',
  BOTS_EXECUTE = 'bots:execute',
  RUNS_READ = 'runs:read',
  RUNS_WRITE = 'runs:write',
  RUNNERS_READ = 'runners:read',
  RUNNERS_WRITE = 'runners:write',
  SCHEDULES_READ = 'schedules:read',
  SCHEDULES_WRITE = 'schedules:write',
  WEBHOOKS = 'webhooks',
  ALL = '*',
}

/**
 * API Key Entity for programmatic access to the API.
 *
 * Features:
 * - Scoped permissions (can be more restrictive than user's roles)
 * - Expiration dates
 * - Usage tracking
 * - IP whitelist (optional)
 * - Rate limiting per key
 *
 * Key format: sk_live_<32 random chars> or sk_test_<32 random chars>
 * Only the hash is stored, the raw key is shown once at creation.
 */
@Entity('api_keys')
@Index(['tenantId', 'status'])
@Index(['keyHash'], { unique: true })
@Index(['userId'])
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant ID from license */
  @Column()
  @Index()
  tenantId: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  name: string; // Human-readable name for the key

  @Column({ nullable: true })
  description: string;

  @Column()
  keyHash: string; // SHA256 hash of the key

  @Column()
  keyPrefix: string; // First 8 chars for identification (e.g., 'sk_live_a')

  @Column({ type: 'enum', enum: ApiKeyStatus, default: ApiKeyStatus.ACTIVE })
  status: ApiKeyStatus;

  @Column({ type: 'simple-array' })
  scopes: ApiKeyScope[]; // Permissions this key has

  @Column({ type: 'enum', enum: ApiKeyEnvironment, default: ApiKeyEnvironment.LIVE })
  environment: ApiKeyEnvironment; // live or test mode

  @Column({ default: true })
  isActive: boolean; // Writeable active flag

  // Security constraints
  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @Column({ type: 'simple-array', nullable: true })
  allowedIps: string[]; // IP whitelist (null = all IPs allowed)

  @Column({ nullable: true })
  rateLimit: number; // Requests per minute (null = default limit)

  // Usage tracking
  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date;

  @Column({ nullable: true })
  lastUsedIp: string;

  @Column({ default: 0 })
  usageCount: number;

  // Metadata
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date;

  @Column({ nullable: true })
  revokedBy: string; // User ID who revoked

  @Column({ nullable: true })
  revokeReason: string;

  // Helper methods
  get isExpired(): boolean {
    return this.expiresAt && this.expiresAt < new Date();
  }

  /**
   * Check if key is currently active (considers status, expiration, and isActive flag).
   */
  get isCurrentlyActive(): boolean {
    return this.isActive && this.status === ApiKeyStatus.ACTIVE && !this.isExpired;
  }

  hasScope(scope: string): boolean {
    if ((this.scopes as string[]).includes('*')) return true;
    return (this.scopes as string[]).includes(scope);
  }

  isIpAllowed(ip: string): boolean {
    if (!this.allowedIps || this.allowedIps.length === 0) return true;
    return this.allowedIps.includes(ip);
  }
}

/**
 * Refresh Token Entity for JWT refresh token rotation.
 *
 * Implements secure refresh token rotation:
 * - Each refresh token can only be used once
 * - Family tracking for detecting token theft
 * - Automatic revocation of entire family on reuse attempt
 */
@Entity('refresh_tokens')
@Index(['tenantId', 'userId'])
@Index(['tokenHash'], { unique: true })
@Index(['familyId'])
@Index(['expiresAt'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant ID from license */
  @Column()
  @Index()
  tenantId: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  tokenHash: string; // SHA256 hash of the token

  @Column()
  familyId: string; // Groups related tokens for rotation

  @Column({ default: false })
  isUsed: boolean; // Token can only be used once

  @Column({ default: false })
  isRevoked: boolean;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ nullable: true })
  userAgent: string;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  deviceId: string; // For device tracking

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date; // When the token was revoked

  get isValid(): boolean {
    return !this.isUsed && !this.isRevoked && this.expiresAt > new Date();
  }
}

/**
 * Session Entity for tracking active user sessions.
 *
 * Used for:
 * - Viewing active sessions
 * - Remote session termination
 * - Concurrent session limits
 */
@Entity('sessions')
@Index(['tenantId', 'userId'])
@Index(['sessionId'], { unique: true })
@Index(['expiresAt'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant ID from license */
  @Column()
  @Index()
  tenantId: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ unique: true })
  sessionId: string; // Random session identifier

  @Column({ nullable: true })
  deviceId: string;

  @Column({ nullable: true })
  deviceName: string; // e.g., "Chrome on MacOS"

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  location: string; // Geo-location (optional)

  @Column({ nullable: true })
  userAgent: string;

  @Column({ default: false })
  isImpersonation: boolean;

  @Column({ nullable: true })
  impersonatorId: string;

  // Alias for backwards compatibility (impersonatedBy = impersonatorId)
  get impersonatedBy(): string | null {
    return this.impersonatorId;
  }

  set impersonatedBy(value: string | null) {
    this.impersonatorId = value;
  }

  @Column({ nullable: true })
  refreshTokenId: string; // Reference to the current refresh token

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastActivityAt: Date;

  // Alias for backwards compatibility
  get lastActiveAt(): Date | null {
    return this.lastActivityAt;
  }

  set lastActiveAt(value: Date | null) {
    this.lastActivityAt = value;
  }

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  terminatedAt: Date;

  @Column({ nullable: true })
  terminationReason: string;

  get isActive(): boolean {
    return !this.terminatedAt && this.expiresAt > new Date();
  }
}
