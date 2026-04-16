import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ContractRequirementAction } from './contract-domain.enums';

@Entity('cp_contract_requirements')
@Unique('uq_cp_contract_requirements_scope', [
  'planCode',
  'addonCode',
  'action',
  'contractTypeCode',
])
export class ContractRequirement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'plan_code', type: 'varchar', length: 80, nullable: true })
  planCode: string | null;

  @Column({ name: 'addon_code', type: 'varchar', length: 80, nullable: true })
  addonCode: string | null;

  @Column({
    type: 'enum',
    enum: ContractRequirementAction,
  })
  action: ContractRequirementAction;

  @Column({ name: 'contract_type_code', type: 'varchar', length: 80 })
  contractTypeCode: string;

  @Column({ name: 'is_required', type: 'boolean', default: true })
  isRequired: boolean;

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
