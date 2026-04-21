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
import { ContractEvent } from './contract-event.entity';
import { ContractSigner } from './contract-signer.entity';

export enum ContractStatus {
  DRAFT = 'draft',
  PENDING_SIGNATURE = 'pending_signature',
  SIGNED = 'signed',
  DECLINED = 'declined',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

@Entity('cp_contracts')
export class Contract {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ name: 'template_key', type: 'varchar', length: 120 })
  templateKey: string;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({
    type: 'varchar',
    length: 40,
    default: ContractStatus.DRAFT,
  })
  status: ContractStatus;

  @Column({ type: 'jsonb', default: '{}' })
  variables: Record<string, unknown>;

  @Column({ name: 'document_json', type: 'jsonb', default: '{}' })
  documentJson: Record<string, unknown>;

  @Column({ name: 'rendered_html', type: 'text', nullable: true })
  renderedHtml: string | null;

  @Column({ name: 'pdf_path', type: 'varchar', length: 512, nullable: true })
  pdfPath: string | null;

  @Column({ name: 'envelope_provider', type: 'varchar', length: 80, nullable: true })
  envelopeProvider: string | null;

  @Column({ name: 'envelope_id', type: 'varchar', length: 180, nullable: true })
  envelopeId: string | null;

  @Column({ name: 'signed_at', type: 'timestamp with time zone', nullable: true })
  signedAt: Date | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @OneToMany(() => ContractSigner, (signer) => signer.contract, {
    cascade: false,
  })
  signers: ContractSigner[];

  @OneToMany(() => ContractEvent, (event) => event.contract, {
    cascade: false,
  })
  events: ContractEvent[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
