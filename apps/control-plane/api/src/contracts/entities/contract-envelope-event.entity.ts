import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ContractEnvelope } from './contract-envelope.entity';
import { ContractEnvelopeRecipient } from './contract-envelope-recipient.entity';

@Entity('cp_contract_envelope_events')
export class ContractEnvelopeEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'envelope_id', type: 'uuid' })
  envelopeId: string;

  @ManyToOne(() => ContractEnvelope, (envelope) => envelope.events, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'envelope_id' })
  envelope: ContractEnvelope;

  @Column({ name: 'recipient_id', type: 'uuid', nullable: true })
  recipientId: string | null;

  @ManyToOne(() => ContractEnvelopeRecipient, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'recipient_id' })
  recipient: ContractEnvelopeRecipient | null;

  @Column({ name: 'event_type', type: 'varchar', length: 120 })
  eventType: string;

  @Column({ name: 'event_source', type: 'varchar', length: 80, nullable: true })
  eventSource: string | null;

  @Column({ name: 'event_payload', type: 'jsonb', default: '{}' })
  eventPayload: Record<string, unknown>;

  @Column({ name: 'occurred_at', type: 'timestamp with time zone', default: () => 'now()' })
  occurredAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
