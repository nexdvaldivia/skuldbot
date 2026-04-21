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
import { ContractSignatory } from './contract-signatory.entity';
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

  @Column({ name: 'accepted_by_title', type: 'varchar', length: 180, nullable: true })
  acceptedByTitle: string | null;

  @Column({
    name: 'acceptance_method',
    type: 'varchar',
    length: 40,
    default: ContractAcceptanceMethod.ESIGN,
  })
  acceptanceMethod: ContractAcceptanceMethod;

  @Column({ name: 'ip_address', type: 'varchar', length: 45 })
  ipAddress: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ name: 'accepted_at', type: 'timestamp with time zone', default: () => 'now()' })
  acceptedAt: Date;

  @Column({ name: 'content_snapshot_hash', type: 'varchar', length: 64, nullable: true })
  contentSnapshotHash: string | null;

  @Column({ name: 'content_snapshot', type: 'text', nullable: true })
  contentSnapshot: string | null;

  @Column({ name: 'signature_hash', type: 'varchar', length: 64, nullable: true })
  signatureHash: string | null;

  @Column({ name: 'countersigned_at', type: 'timestamptz', nullable: true })
  countersignedAt: Date | null;

  @Column({ name: 'countersigned_by', type: 'varchar', length: 255, nullable: true })
  countersignedBy: string | null;

  @Column({ name: 'skuld_signatory_id', type: 'uuid', nullable: true })
  skuldSignatoryId: string | null;

  @ManyToOne(() => ContractSignatory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'skuld_signatory_id' })
  skuldSignatory: ContractSignatory | null;

  @Column({ name: 'skuld_signatory_name', type: 'varchar', length: 255, nullable: true })
  skuldSignatoryName: string | null;

  @Column({ name: 'skuld_signatory_title', type: 'varchar', length: 255, nullable: true })
  skuldSignatoryTitle: string | null;

  @Column({ name: 'skuld_signatory_email', type: 'varchar', length: 255, nullable: true })
  skuldSignatoryEmail: string | null;

  @Column({ name: 'skuld_signature_hash', type: 'varchar', length: 64, nullable: true })
  skuldSignatureHash: string | null;

  @Column({ name: 'skuld_resolution_source', type: 'varchar', length: 20, nullable: true })
  skuldResolutionSource: string | null;

  @Column({ name: 'skuld_resolved_at', type: 'timestamptz', nullable: true })
  skuldResolvedAt: Date | null;

  @Column({ name: 'signed_pdf_url', type: 'varchar', length: 500, nullable: true })
  signedPdfUrl: string | null;

  @Column({ name: 'signed_pdf_hash', type: 'varchar', length: 64, nullable: true })
  signedPdfHash: string | null;

  @Column({ name: 'variables_used', type: 'jsonb', nullable: true })
  variablesUsed: Record<string, unknown> | null;

  @Column({ name: 'effective_date', type: 'timestamptz', default: () => 'now()' })
  effectiveDate: Date;

  @Column({ name: 'expiration_date', type: 'timestamptz', nullable: true })
  expirationDate: Date | null;

  @Column({ name: 'superseded_by_id', type: 'uuid', nullable: true })
  supersededById: string | null;

  @ManyToOne(() => ContractAcceptance, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'superseded_by_id' })
  supersededBy: ContractAcceptance | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revocation_reason', type: 'text', nullable: true })
  revocationReason: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  evidence: Record<string, unknown>;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
