import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContractTemplateStatus } from './contract-domain.enums';
import { ContractTemplateVersion } from './contract-template-version.entity';

@Entity('cp_contract_templates')
export class ContractTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'template_key', type: 'varchar', length: 120, unique: true })
  templateKey: string;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: ContractTemplateStatus,
    default: ContractTemplateStatus.DRAFT,
  })
  status: ContractTemplateStatus;

  @Column({ name: 'active_version_id', type: 'uuid', nullable: true })
  activeVersionId: string | null;

  @OneToOne(() => ContractTemplateVersion, { nullable: true })
  @JoinColumn({ name: 'active_version_id' })
  activeVersion: ContractTemplateVersion | null;

  @Column({ name: 'latest_version_number', type: 'integer', default: 1 })
  latestVersionNumber: number;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @OneToMany(() => ContractTemplateVersion, (version) => version.template, {
    cascade: false,
  })
  versions: ContractTemplateVersion[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
