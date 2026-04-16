import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Contract } from './contract.entity';
import { ContractEnvelopeStatus } from './contract-domain.enums';
import { ContractEnvelopeEvent } from './contract-envelope-event.entity';
import { ContractEnvelopeRecipient } from './contract-envelope-recipient.entity';
import { ContractTemplate } from './contract-template.entity';
import { ContractTemplateVersion } from './contract-template-version.entity';

@Entity('cp_contract_envelopes')
export class ContractEnvelope {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contract_id', type: 'uuid', nullable: true })
  contractId: string | null;

  @ManyToOne(() => Contract, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contract_id' })
  contract: Contract | null;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId: string | null;

  @ManyToOne(() => ContractTemplate, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'template_id' })
  template: ContractTemplate | null;

  @Column({ name: 'template_version_id', type: 'uuid', nullable: true })
  templateVersionId: string | null;

  @ManyToOne(() => ContractTemplateVersion, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'template_version_id' })
  templateVersion: ContractTemplateVersion | null;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => Client, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @ManyToOne(() => Tenant, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @Column({ type: 'varchar', length: 220 })
  subject: string;

  @Column({
    type: 'enum',
    enum: ContractEnvelopeStatus,
    default: ContractEnvelopeStatus.DRAFT,
  })
  status: ContractEnvelopeStatus;

  @Column({ name: 'external_provider', type: 'varchar', length: 80, nullable: true })
  externalProvider: string | null;

  @Column({ name: 'external_envelope_id', type: 'varchar', length: 180, nullable: true })
  externalEnvelopeId: string | null;

  @Column({ name: 'expires_at', type: 'timestamp with time zone', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'sent_at', type: 'timestamp with time zone', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'declined_at', type: 'timestamp with time zone', nullable: true })
  declinedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamp with time zone', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @OneToMany(() => ContractEnvelopeRecipient, (recipient) => recipient.envelope, {
    cascade: false,
  })
  recipients: ContractEnvelopeRecipient[];

  @OneToMany(() => ContractEnvelopeEvent, (event) => event.envelope, {
    cascade: false,
  })
  events: ContractEnvelopeEvent[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
