import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ContractTemplateStatus } from './contract-domain.enums';
import { ContractTemplate } from './contract-template.entity';

@Entity('cp_contract_template_versions')
@Unique('uq_cp_contract_template_version_number', ['templateId', 'versionNumber'])
@Index('IDX_cp_contract_template_versions_template_id', ['templateId'])
export class ContractTemplateVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @ManyToOne(() => ContractTemplate, (template) => template.versions, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'template_id' })
  template: ContractTemplate;

  @Column({ name: 'version_number', type: 'integer' })
  versionNumber: number;

  @Column({ name: 'supersedes_version_id', type: 'uuid', nullable: true })
  supersedesVersionId: string | null;

  @Column({
    type: 'varchar',
    length: 40,
    default: ContractTemplateStatus.DRAFT,
  })
  status: ContractTemplateStatus;

  @Column({ name: 'document_json', type: 'jsonb', default: '{}' })
  documentJson: Record<string, unknown>;

  @Column({ name: 'variable_definitions', type: 'jsonb', default: '{}' })
  variableDefinitions: Record<string, unknown>;

  @Column({ name: 'rendered_html', type: 'text', nullable: true })
  renderedHtml: string | null;

  @Column({ name: 'change_log', type: 'text', nullable: true })
  changeLog: string | null;

  @Column({ name: 'published_at', type: 'timestamp with time zone', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'deprecated_at', type: 'timestamp with time zone', nullable: true })
  deprecatedAt: Date | null;

  @Column({ name: 'archived_at', type: 'timestamp with time zone', nullable: true })
  archivedAt: Date | null;

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
