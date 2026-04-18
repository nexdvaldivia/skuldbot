import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TicketStatus = string;
export const TicketStatus = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
} as const;

export type TicketPriority = string;
export const TicketPriority = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

@Entity('tickets')
@Index(['tenantId', 'status', 'createdAt'])
@Index(['tenantId', 'normalizedEmail'])
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId: string | null;

  @Column({ name: 'normalized_email' })
  normalizedEmail: string;

  @Column({ name: 'requester_email' })
  requesterEmail: string;

  @Column({ name: 'requester_name', type: 'varchar', nullable: true })
  requesterName: string | null;

  @Column({ type: 'varchar', nullable: true })
  company: string | null;

  @Column({ name: 'source' })
  source: string;

  @Column({ name: 'category' })
  category: string;

  @Column({ name: 'subject' })
  subject: string;

  @Column({ name: 'message', type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'varchar', length: 50, default: TicketStatus.OPEN })
  status: string;

  @Column({ type: 'varchar', length: 50, default: TicketPriority.NORMAL })
  priority: string;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
