import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { LookupValue } from './lookup-value.entity';

export type LookupPortalOwner = 'control_plane' | 'orchestrator';

@Entity('lookup_domains')
@Unique('uq_lookup_domains_code', ['code'])
@Index(['managedByPortal', 'isActive'])
export class LookupDomain {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ name: 'managed_by_portal', type: 'varchar', length: 40 })
  managedByPortal: LookupPortalOwner;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_editable', type: 'boolean', default: true })
  isEditable: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => LookupValue, (value) => value.domain)
  values: LookupValue[];
}
