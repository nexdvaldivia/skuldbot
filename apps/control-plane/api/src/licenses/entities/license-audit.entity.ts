import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { License } from './license.entity';

export type LicenseAuditAction =
  | 'issued'
  | 'validated'
  | 'validation_failed'
  | 'signature_invalid'
  | 'revoked'
  | 'renewed'
  | 'features_updated'
  | 'grace_started'
  | 'grace_ended';

@Entity('license_audit')
@Index(['licenseId', 'createdAt'])
@Index(['tenantId', 'createdAt'])
export class LicenseAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'license_id', type: 'uuid' })
  licenseId: string;

  @ManyToOne(() => License, (license) => license.auditTrail, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'license_id' })
  license: License;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 80 })
  action: LicenseAuditAction;

  @Column({ name: 'ip_address', type: 'varchar', length: 120, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  details: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
