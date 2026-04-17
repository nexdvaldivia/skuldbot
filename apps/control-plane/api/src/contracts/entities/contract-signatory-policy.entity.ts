import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContractSignatory } from './contract-signatory.entity';
import { ContractTypeLookup } from './contract-type-lookup.entity';

@Entity('cp_contract_signatory_policies')
@Check(
  'ck_cp_contract_signatory_policy_valid_window',
  '"valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"',
)
@Index('IDX_cp_contract_signatory_policies_contract_type', ['contractType'])
@Index('IDX_cp_contract_signatory_policies_signatory_id', ['signatoryId'])
@Index('IDX_cp_contract_signatory_policies_is_active', ['isActive'])
@Index('IDX_cp_contract_signatory_policy_contract_priority', [
  'contractType',
  'priority',
  'isActive',
])
export class ContractSignatoryPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contract_type', type: 'varchar', length: 80 })
  contractType: string;

  @Column({ name: 'signatory_id', type: 'uuid' })
  signatoryId: string;

  @Column({ type: 'integer', default: 100 })
  priority: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'valid_from', type: 'timestamptz', nullable: true })
  validFrom: Date | null;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => ContractSignatory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'signatory_id' })
  signatory?: ContractSignatory;

  @ManyToOne(() => ContractTypeLookup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contract_type', referencedColumnName: 'code' })
  contractTypeLookup?: ContractTypeLookup;
}
