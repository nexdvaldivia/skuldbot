import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SubscriptionEntity } from '../../integrations/payment/entities/subscription.entity';
import { Client } from '../../clients/entities/client.entity';
import { ContractAcceptance } from './contract-acceptance.entity';
import { ContractTemplateVersion } from './contract-template-version.entity';
import { ContractRenewalRequirementStatus } from './contract-domain.enums';

@Entity('cp_contract_renewal_requirements')
@Index('IDX_cp_contract_renewal_requirements_client_status', ['clientId', 'status'])
@Index('IDX_cp_contract_renewal_requirements_deadline_status', ['deadline', 'status'])
@Index('IDX_cp_contract_renewal_requirements_template_status', ['newTemplateVersionId', 'status'])
export class ContractRenewalRequirement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => Client, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
  subscriptionId: string | null;

  @ManyToOne(() => SubscriptionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'subscription_id' })
  subscription: SubscriptionEntity | null;

  @Column({ name: 'old_acceptance_id', type: 'uuid', nullable: true })
  oldAcceptanceId: string | null;

  @ManyToOne(() => ContractAcceptance, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'old_acceptance_id' })
  oldAcceptance: ContractAcceptance | null;

  @Column({ name: 'new_template_version_id', type: 'uuid' })
  newTemplateVersionId: string;

  @ManyToOne(() => ContractTemplateVersion, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'new_template_version_id' })
  newTemplateVersion: ContractTemplateVersion;

  @Column({ name: 'notified_at', type: 'timestamptz', nullable: true })
  notifiedAt: Date | null;

  @Column({ name: 'notification_email', type: 'varchar', length: 255, nullable: true })
  notificationEmail: string | null;

  @Column({ name: 'reminder_sent_at', type: 'timestamptz', nullable: true })
  reminderSentAt: Date | null;

  @Column({ name: 'reminder_days_before', type: 'integer', default: 5 })
  reminderDaysBefore: number;

  @Column({ type: 'timestamptz' })
  deadline: Date;

  @Column({
    type: 'enum',
    enum: ContractRenewalRequirementStatus,
    default: ContractRenewalRequirementStatus.PENDING,
  })
  status: ContractRenewalRequirementStatus;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ name: 'new_acceptance_id', type: 'uuid', nullable: true })
  newAcceptanceId: string | null;

  @ManyToOne(() => ContractAcceptance, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'new_acceptance_id' })
  newAcceptance: ContractAcceptance | null;

  @Column({ name: 'renewal_blocked', type: 'boolean', default: false })
  renewalBlocked: boolean;

  @Column({ name: 'blocked_at', type: 'timestamptz', nullable: true })
  blockedAt: Date | null;

  @Column({ name: 'blocked_reason', type: 'varchar', length: 100, nullable: true })
  blockedReason: string | null;

  @Column({ name: 'waived_at', type: 'timestamptz', nullable: true })
  waivedAt: Date | null;

  @Column({ name: 'waived_by_user_id', type: 'uuid', nullable: true })
  waivedByUserId: string | null;

  @Column({ name: 'waiver_reason', type: 'text', nullable: true })
  waiverReason: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
