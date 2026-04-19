import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('pricing_plans')
@Index(['code'], { unique: true })
export class PricingPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ name: 'base_monthly_cents', type: 'int', default: 0 })
  baseMonthlyCents: number;

  @Column({ name: 'base_annual_cents', type: 'int', default: 0 })
  baseAnnualCents: number;

  @Column({ name: 'included_runners', type: 'int', default: 0 })
  includedRunners: number;

  @Column({ name: 'included_bots', type: 'int', default: 0 })
  includedBots: number;

  @Column({ name: 'included_executions', type: 'int', default: 0 })
  includedExecutions: number;

  @Column({ name: 'price_per_extra_runner_cents', type: 'int', default: 0 })
  pricePerExtraRunnerCents: number;

  @Column({ name: 'price_per_extra_bot_cents', type: 'int', default: 0 })
  pricePerExtraBotCents: number;

  @Column({ name: 'price_per_execution_cents', type: 'int', default: 0 })
  pricePerExecutionCents: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'jsonb', default: '[]' })
  features: string[];

  @Column({ name: 'stripe_price_monthly_id', type: 'varchar', length: 255, nullable: true })
  stripePriceMonthlyId: string | null;

  @Column({ name: 'stripe_price_annual_id', type: 'varchar', length: 255, nullable: true })
  stripePriceAnnualId: string | null;

  @Column({ name: 'stripe_meter_id', type: 'varchar', length: 255, nullable: true })
  stripeMeterId: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

export const DEFAULT_PRICING_PLANS: Array<{
  code: string;
  name: string;
  baseMonthlyCents: number;
  baseAnnualCents: number;
  includedRunners: number;
  includedBots: number;
  includedExecutions: number;
  pricePerExtraRunnerCents: number;
  pricePerExtraBotCents: number;
  pricePerExecutionCents: number;
  features: string[];
  sortOrder: number;
}> = [
  {
    code: 'starter',
    name: 'Starter',
    baseMonthlyCents: 4900,
    baseAnnualCents: 49000,
    includedRunners: 1,
    includedBots: 5,
    includedExecutions: 10000,
    pricePerExtraRunnerCents: 1500,
    pricePerExtraBotCents: 300,
    pricePerExecutionCents: 1,
    features: ['studio', 'orchestrator', 'runner'],
    sortOrder: 10,
  },
  {
    code: 'professional',
    name: 'Professional',
    baseMonthlyCents: 14900,
    baseAnnualCents: 149000,
    includedRunners: 5,
    includedBots: 25,
    includedExecutions: 100000,
    pricePerExtraRunnerCents: 1000,
    pricePerExtraBotCents: 200,
    pricePerExecutionCents: 1,
    features: ['studio', 'orchestrator', 'runner', 'ai_planner', 'marketplace'],
    sortOrder: 20,
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    baseMonthlyCents: 39900,
    baseAnnualCents: 399000,
    includedRunners: 20,
    includedBots: 100,
    includedExecutions: 1000000,
    pricePerExtraRunnerCents: 800,
    pricePerExtraBotCents: 150,
    pricePerExecutionCents: 1,
    features: ['studio', 'orchestrator', 'runner', 'ai_planner', 'marketplace', 'evidence_pack'],
    sortOrder: 30,
  },
];
