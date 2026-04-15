import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { CpRole } from '../../rbac/entities/cp-role.entity';

export enum UserRole {
  SKULD_ADMIN = 'skuld_admin',
  SKULD_SUPPORT = 'skuld_support',
  CLIENT_ADMIN = 'client_admin',
  CLIENT_USER = 'client_user',
}

export enum UserStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  SUSPENDED = 'suspended',
  DEACTIVATED = 'deactivated',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash: string | null;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CLIENT_USER })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING })
  status: UserStatus;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  @ManyToOne(() => Client, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'client_id' })
  client: Client | null;

  @ManyToMany(() => CpRole, (role) => role.users, { cascade: false })
  @JoinTable({
    name: 'cp_user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles: CpRole[];

  @Column({ name: 'last_login_at', type: 'timestamp with time zone', nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: 'last_login_ip', type: 'varchar', length: 64, nullable: true })
  lastLoginIp: string | null;

  @Column({ name: 'login_count', type: 'integer', default: 0 })
  loginCount: number;

  @Column({ name: 'password_changed_at', type: 'timestamp with time zone', nullable: true })
  passwordChangedAt: Date | null;

  @Column({ name: 'failed_login_attempts', type: 'integer', default: 0 })
  failedLoginAttempts: number;

  @Column({ name: 'locked_until', type: 'timestamp with time zone', nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean;

  @Column({ name: 'mfa_enabled', default: false })
  mfaEnabled: boolean;

  @Column({ name: 'mfa_secret', type: 'varchar', nullable: true })
  mfaSecret: string | null;

  @Column({ name: 'mfa_backup_codes', type: 'jsonb', nullable: true })
  mfaBackupCodes: string[] | null;

  @Column({ type: 'jsonb', default: '{}' })
  settings: Record<string, unknown>;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  isSkuld(): boolean {
    return this.role === UserRole.SKULD_ADMIN || this.role === UserRole.SKULD_SUPPORT;
  }

  isClientAdmin(): boolean {
    return this.role === UserRole.CLIENT_ADMIN;
  }
}
