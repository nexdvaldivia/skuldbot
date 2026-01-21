import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';

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

  @Column({ name: 'client_id', type: 'varchar', nullable: true })
  clientId: string | null;

  @ManyToOne(() => Client, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'client_id' })
  client: Client | null;

  @Column({ name: 'last_login_at', type: 'timestamp with time zone', nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean;

  @Column({ name: 'mfa_enabled', default: false })
  mfaEnabled: boolean;

  @Column({ name: 'mfa_secret', type: 'varchar', nullable: true })
  mfaSecret: string | null;

  @Column({ type: 'jsonb', default: {} })
  settings: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
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
