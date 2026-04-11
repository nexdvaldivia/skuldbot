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

export enum MarketplaceSubscriptionStatus {
  ACTIVE = 'active',
  CANCELED = 'canceled',
}

export enum MarketplaceSubscriptionPlan {
  USAGE = 'usage',
  PER_CALL = 'per_call',
  MONTHLY = 'monthly',
  HYBRID = 'hybrid',
}

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
  pricingPlan: MarketplaceSubscriptionPlan;

  @Column({
    type: 'varchar',
    length: 32,
    default: MarketplaceSubscriptionStatus.ACTIVE,
  })
  status: MarketplaceSubscriptionStatus;

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
