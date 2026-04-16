import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Contract } from './contract.entity';
import { ContractAcceptanceMethod } from './contract-domain.enums';
import { ContractEnvelope } from './contract-envelope.entity';
import { ContractTemplate } from './contract-template.entity';
import { ContractTemplateVersion } from './contract-template-version.entity';

@Entity('cp_contract_acceptances')
export class ContractAcceptance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId: string;

  @ManyToOne(() => Contract, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contract_id' })
  contract: Contract;

  @Column({ name: 'envelope_id', type: 'uuid', nullable: true })
  envelopeId: string | null;

  @ManyToOne(() => ContractEnvelope, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'envelope_id' })
  envelope: ContractEnvelope | null;

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

  @Column({ name: 'accepted_by_name', type: 'varchar', length: 180 })
  acceptedByName: string;

  @Column({ name: 'accepted_by_email', type: 'varchar', length: 180 })
  acceptedByEmail: string;

  @Column({
    name: 'acceptance_method',
    type: 'enum',
    enum: ContractAcceptanceMethod,
    default: ContractAcceptanceMethod.ESIGN,
  })
  acceptanceMethod: ContractAcceptanceMethod;

  @Column({ name: 'ip_address', type: 'varchar', length: 45 })
  ipAddress: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ name: 'accepted_at', type: 'timestamp with time zone', default: () => 'now()' })
  acceptedAt: Date;

  @Column({ type: 'jsonb', default: '{}' })
  evidence: Record<string, unknown>;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
