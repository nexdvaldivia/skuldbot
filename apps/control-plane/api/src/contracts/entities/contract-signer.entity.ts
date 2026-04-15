import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Contract } from './contract.entity';

export enum ContractSignerStatus {
  PENDING = 'pending',
  SENT = 'sent',
  VIEWED = 'viewed',
  SIGNED = 'signed',
  DECLINED = 'declined',
}

@Entity('cp_contract_signers')
@Unique('uq_cp_contract_signers_contract_email', ['contractId', 'email'])
export class ContractSigner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId: string;

  @ManyToOne(() => Contract, (contract) => contract.signers, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'contract_id' })
  contract: Contract;

  @Column({ type: 'varchar', length: 180 })
  email: string;

  @Column({ name: 'full_name', type: 'varchar', length: 180 })
  fullName: string;

  @Column({ name: 'role_label', type: 'varchar', length: 120 })
  roleLabel: string;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @Column({
    type: 'enum',
    enum: ContractSignerStatus,
    default: ContractSignerStatus.PENDING,
  })
  status: ContractSignerStatus;

  @Column({ name: 'sent_at', type: 'timestamp with time zone', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'viewed_at', type: 'timestamp with time zone', nullable: true })
  viewedAt: Date | null;

  @Column({ name: 'signed_at', type: 'timestamp with time zone', nullable: true })
  signedAt: Date | null;

  @Column({ name: 'declined_at', type: 'timestamp with time zone', nullable: true })
  declinedAt: Date | null;

  @Column({ name: 'external_recipient_id', type: 'varchar', length: 180, nullable: true })
  externalRecipientId: string | null;

  @Column({ name: 'signature_audit', type: 'jsonb', default: '{}' })
  signatureAudit: Record<string, unknown>;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
