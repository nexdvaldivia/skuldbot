import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('cp_security_audit_events')
@Index('idx_cp_security_audit_target', ['targetType', 'targetId'])
@Index('idx_cp_security_audit_actor_created', ['actorUserId', 'createdAt'])
export class SecurityAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32 })
  category: string;

  @Column({ type: 'varchar', length: 80 })
  action: string;

  @Column({ name: 'target_type', type: 'varchar', length: 80 })
  targetType: string;

  @Column({ name: 'target_id', type: 'varchar', length: 120 })
  targetId: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ name: 'actor_email', type: 'varchar', length: 180, nullable: true })
  actorEmail: string | null;

  @Column({ name: 'request_ip', type: 'varchar', length: 64, nullable: true })
  requestIp: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  details: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;
}
