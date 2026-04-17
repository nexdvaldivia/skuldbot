import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cp_contract_signatories')
export class ContractSignatory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'full_name', type: 'varchar', length: 180 })
  fullName: string;

  @Column({ type: 'varchar', length: 180 })
  email: string;

  @Column({ type: 'varchar', length: 180, nullable: true })
  title: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  policies: Record<string, unknown>;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @Column({ name: 'signature_storage_key', type: 'varchar', length: 500, nullable: true })
  signatureStorageKey: string | null;

  @Column({ name: 'signature_content_type', type: 'varchar', length: 120, nullable: true })
  signatureContentType: string | null;

  @Column({ name: 'signature_sha256', type: 'varchar', length: 128, nullable: true })
  signatureSha256: string | null;

  @Column({ name: 'signature_uploaded_at', type: 'timestamptz', nullable: true })
  signatureUploadedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
