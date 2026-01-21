import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
  Index,
} from 'typeorm';
import { Role } from '../../roles/entities/role.entity';

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING_VERIFICATION = 'pending_verification',
  LOCKED = 'locked',
  DEACTIVATED = 'deactivated',
}

export enum AuthProvider {
  LOCAL = 'local',
  SAML = 'saml',
  OIDC = 'oidc',
  LDAP = 'ldap',
}

@Entity('users')
@Index(['tenantId', 'email'], { unique: true })
@Index(['tenantId', 'status'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Tenant ID from license - identifies which tenant this user belongs to.
   */
  @Column()
  @Index()
  tenantId: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  passwordHash: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true })
  department: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ default: 'UTC' })
  timezone: string;

  @Column({ default: 'en' })
  locale: string;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING_VERIFICATION })
  status: UserStatus;

  @Column({ type: 'enum', enum: AuthProvider, default: AuthProvider.LOCAL })
  authProvider: AuthProvider;

  @Column({ nullable: true })
  externalId: string; // ID from SSO provider (SAML/OIDC)

  @ManyToMany(() => Role, (role) => role.users, { eager: true })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'userId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'roleId', referencedColumnName: 'id' },
  })
  roles: Role[];

  // MFA Configuration
  @Column({ default: false })
  mfaEnabled: boolean;

  @Column({ nullable: true })
  mfaSecret: string; // Encrypted TOTP secret

  @Column({ type: 'simple-array', nullable: true })
  mfaBackupCodes: string[]; // Encrypted backup codes

  @Column({ type: 'timestamp', nullable: true })
  mfaEnabledAt: Date; // When MFA was enabled

  @Column({ nullable: true })
  webAuthnCredentials: string; // JSON array of WebAuthn credentials (encrypted)

  // Security tracking
  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  lockoutUntil: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @Column({ nullable: true })
  lastLoginIp: string;

  @Column({ type: 'timestamp', nullable: true })
  passwordChangedAt: Date;

  @Column({ default: false })
  forcePasswordChange: boolean;

  // Email verification
  @Column({ nullable: true })
  emailVerificationToken: string;

  @Column({ type: 'timestamp', nullable: true })
  emailVerificationExpires: Date; // When verification token expires

  @Column({ default: false })
  emailVerified: boolean; // Boolean flag for verification status

  @Column({ type: 'timestamp', nullable: true })
  emailVerifiedAt: Date;

  // Password reset
  @Column({ nullable: true })
  passwordResetToken: string;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpiresAt: Date;

  // Alias for backwards compatibility
  get passwordResetExpires(): Date | null {
    return this.passwordResetExpiresAt;
  }

  set passwordResetExpires(value: Date | null) {
    this.passwordResetExpiresAt = value;
  }

  // Password history (for preventing reuse)
  @Column({ type: 'simple-array', nullable: true })
  passwordHistory: string[]; // Hashes of last N passwords

  // Metadata
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt: Date; // Soft delete for audit compliance

  // Helper methods
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  get isLocked(): boolean {
    return this.lockoutUntil && this.lockoutUntil > new Date();
  }

  get isEmailVerified(): boolean {
    return !!this.emailVerifiedAt;
  }

  hasPermission(permission: string): boolean {
    return this.roles?.some((role) =>
      role.permissions?.some((p) => p.name === permission)
    );
  }

  hasRole(roleName: string): boolean {
    return this.roles?.some((role) => role.name === roleName);
  }
}
