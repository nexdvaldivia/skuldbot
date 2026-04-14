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

export enum LeadStatus {
  NEW = 'new',
  WORKING = 'working',
  QUALIFIED = 'qualified',
  DISQUALIFIED = 'disqualified',
}

@Entity('leads')
@Unique('uq_leads_tenant_email', ['tenantId', 'normalizedEmail'])
@Index(['tenantId', 'status'])
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  @Index()
  tenantId: string;

  @Column({ name: 'normalized_email' })
  @Index()
  normalizedEmail: string;

  @Column()
  email: string;

  @Column({ name: 'full_name', type: 'varchar', nullable: true })
  fullName: string | null;

  @Column({ type: 'varchar', nullable: true })
  company: string | null;

  @Column({ type: 'varchar', nullable: true })
  employees: string | null;

  @Column({ name: 'latest_inquiry_type', type: 'varchar', nullable: true })
  latestInquiryType: string | null;

  @Column({ name: 'latest_message', type: 'text', nullable: true })
  latestMessage: string | null;

  @Column({ name: 'first_source' })
  firstSource: string;

  @Column({ name: 'last_source' })
  lastSource: string;

  @Column({ name: 'first_source_timestamp', type: 'timestamptz', nullable: true })
  firstSourceTimestamp: Date | null;

  @Column({ name: 'last_source_timestamp', type: 'timestamptz', nullable: true })
  lastSourceTimestamp: Date | null;

  @Column({ name: 'first_seen_at', type: 'timestamptz' })
  firstSeenAt: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date;

  @Column({ name: 'intake_count', type: 'integer', default: 1 })
  intakeCount: number;

  @Column({
    type: 'enum',
    enum: LeadStatus,
    default: LeadStatus.NEW,
  })
  status: LeadStatus;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('lead_intake_events')
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'normalizedEmail'])
export class LeadIntakeEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId: string | null;

  @ManyToOne(() => Lead, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead | null;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'normalized_email' })
  normalizedEmail: string;

  @Column()
  source: string;

  @Column({ name: 'inquiry_type', type: 'varchar', nullable: true })
  inquiryType: string | null;

  @Column({ name: 'source_timestamp', type: 'timestamptz', nullable: true })
  sourceTimestamp: Date | null;

  @Column({ name: 'gateway_id' })
  gatewayId: string;

  @Column({ name: 'request_id', type: 'varchar', nullable: true })
  requestId: string | null;

  @Column({ name: 'source_ip', type: 'varchar', nullable: true })
  sourceIp: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'deduplicated', default: false })
  deduplicated: boolean;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
