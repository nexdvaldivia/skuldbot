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
import { ContractSigner } from './contract-signer.entity';
import { ContractEnvelopeRecipientStatus, ContractSignatureType } from './contract-domain.enums';
import { ContractEnvelope } from './contract-envelope.entity';

@Entity('cp_contract_envelope_recipients')
@Unique('uq_cp_contract_envelope_recipient_email', ['envelopeId', 'email'])
export class ContractEnvelopeRecipient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'envelope_id', type: 'uuid' })
  envelopeId: string;

  @ManyToOne(() => ContractEnvelope, (envelope) => envelope.recipients, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'envelope_id' })
  envelope: ContractEnvelope;

  @Column({ name: 'signer_id', type: 'uuid', nullable: true })
  signerId: string | null;

  @ManyToOne(() => ContractSigner, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'signer_id' })
  signer: ContractSigner | null;

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
    enum: ContractEnvelopeRecipientStatus,
    default: ContractEnvelopeRecipientStatus.PENDING,
  })
  status: ContractEnvelopeRecipientStatus;

  @Column({ name: 'otp_code_hash', type: 'varchar', length: 128, nullable: true })
  otpCodeHash: string | null;

  @Column({ name: 'otp_expires_at', type: 'timestamp with time zone', nullable: true })
  otpExpiresAt: Date | null;

  @Column({ name: 'otp_verified_at', type: 'timestamp with time zone', nullable: true })
  otpVerifiedAt: Date | null;

  @Column({ name: 'otp_attempts', type: 'integer', default: 0 })
  otpAttempts: number;

  @Column({ name: 'viewed_at', type: 'timestamp with time zone', nullable: true })
  viewedAt: Date | null;

  @Column({ name: 'signed_at', type: 'timestamp with time zone', nullable: true })
  signedAt: Date | null;

  @Column({ name: 'declined_at', type: 'timestamp with time zone', nullable: true })
  declinedAt: Date | null;

  @Column({
    name: 'signature_type',
    type: 'enum',
    enum: ContractSignatureType,
    nullable: true,
  })
  signatureType: ContractSignatureType | null;

  @Column({ name: 'signature_value', type: 'text', nullable: true })
  signatureValue: string | null;

  @Column({ name: 'signature_asset_path', type: 'varchar', length: 512, nullable: true })
  signatureAssetPath: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
