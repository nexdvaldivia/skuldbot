import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Client } from './client.entity';

@Entity('client_api_key_audit')
@Index('IDX_client_api_key_audit_client_rotated_at', ['clientId', 'rotatedAt'])
export class ClientApiKeyAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => Client, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'old_key_prefix', type: 'varchar', length: 32, nullable: true })
  oldKeyPrefix: string | null;

  @Column({ name: 'new_key_prefix', type: 'varchar', length: 32 })
  newKeyPrefix: string;

  @Column({ name: 'rotated_by', type: 'varchar', length: 255 })
  rotatedBy: string;

  @Column({ name: 'rotated_at', type: 'timestamptz' })
  rotatedAt: Date;

  @Column({ name: 'rotated_from_ip', type: 'varchar', length: 64, nullable: true })
  rotatedFromIp: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
