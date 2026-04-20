import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { MarketplaceBot } from './marketplace-bot.entity';

export type MarketplaceSubscriptionStatus = string;
export const MarketplaceSubscriptionStatus = {
  ACTIVE: 'active',
  CANCELED: 'canceled',
} as const;

export type MarketplaceSubscriptionPlan = string;
export const MarketplaceSubscriptionPlan = {
  USAGE: 'usage',
  PER_CALL: 'per_call',
  MONTHLY: 'monthly',
  HYBRID: 'hybrid',
} as const;

@Entity('marketplace_subscriptions')
@Index(['tenantId', 'marketplaceBotId'], { unique: true })
@Index(['tenantId', 'status'])
export class MarketplaceSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  marketplaceBotId: string;

  @ManyToOne(() => MarketplaceBot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'marketplaceBotId' })
  marketplaceBot: MarketplaceBot;

  @Column({
    type: 'varchar',
    length: 32,
    default: MarketplaceSubscriptionPlan.MONTHLY,
  })
  pricingPlan: string;

  @Column({
    type: 'varchar',
    length: 32,
    default: MarketplaceSubscriptionStatus.ACTIVE,
  })
  status: string;

  @Column({ type: 'timestamptz', nullable: true })
  subscribedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  canceledAt?: Date;

  @Column({ default: 0 })
  downloadCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastDownloadedAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
