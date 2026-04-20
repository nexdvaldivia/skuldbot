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
import { Client } from './client.entity';

@Entity('cp_client_contacts')
@Unique('uq_cp_client_contacts_client_email', ['clientId', 'email'])
export class ClientContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => Client, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'full_name', type: 'varchar', length: 180 })
  fullName: string;

  @Column({ type: 'varchar', length: 180 })
  email: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  department: string | null;

  @Column({ name: 'role_codes', type: 'jsonb', default: '[]' })
  roleCodes: string[];

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

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
