import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LookupDomain } from './lookup-domain.entity';

@Entity('lookup_values')
@Index('uq_lookup_values_domain_code', ['domainId', 'code'], { unique: true })
@Index(['domainId', 'isActive', 'sortOrder'])
export class LookupValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'domain_id', type: 'uuid' })
  domainId: string;

  @ManyToOne(() => LookupDomain, (domain) => domain.values, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'domain_id' })
  domain: LookupDomain;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 100 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
