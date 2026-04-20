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
import { ContractEnvelope } from './contract-envelope.entity';
import { ContractTemplate } from './contract-template.entity';
import { ContractTemplateVersion } from './contract-template-version.entity';

@Entity('cp_signing_documents')
@Index('IDX_cp_signing_documents_envelope_id', ['envelopeId'])
@Index('IDX_cp_signing_documents_order', ['envelopeId', 'sortOrder'])
export class SigningDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'envelope_id', type: 'uuid' })
  envelopeId: string;

  @ManyToOne(() => ContractEnvelope, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'envelope_id' })
  envelope: ContractEnvelope;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'content_type', type: 'varchar', length: 40, default: 'pdf' })
  contentType: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash: string;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

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

  @Column({ type: 'jsonb', nullable: true })
  variables: Record<string, unknown> | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
