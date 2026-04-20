import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Product Type
 */
export enum ProductType {
  ORCHESTRATOR = 'orchestrator', // Orchestrator subscription
  RUNNER = 'runner', // Runner license
  MARKETPLACE_BOT = 'marketplace_bot', // Marketplace bot subscription
  USAGE = 'usage', // Usage-based billing
  ENTERPRISE = 'enterprise', // Enterprise custom pricing
}

/**
 * Payment Configuration Entity
 *
 * Defines which payment methods are allowed for each product type.
 * Uses simple boolean flags - Skuld decides what's available.
 *
 * Payment Method Comparison:
 *
 * ACH Direct Debit:
 * - Fees: ~0.8% capped at $5 (much lower than cards)
 * - Processing: 4-5 business days to clear
 * - Best for: High-value B2B recurring payments
 * - Benefit: No card expiration = less churn
 *
 * Credit/Debit Card:
 * - Fees: 2.9% + $0.30 per transaction
 * - Processing: Instant
 * - Best for: Smaller amounts, quick setup
 * - Benefit: Familiar to customers
 */
@Entity('payment_configs')
@Index(['productType'], { unique: true })
export class PaymentConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ProductType,
    unique: true,
  })
  productType: ProductType;

  // Payment method toggles - Skuld controls what's available
  @Column({ default: true })
  achEnabled: boolean; // ACH Direct Debit allowed

  @Column({ default: true })
  cardEnabled: boolean; // Credit/Debit card allowed

  // Which method to show first / recommend in UI
  @Column({ default: 'ach' })
  preferredMethod: 'ach' | 'card';

  // Amount thresholds (in cents)
  // If card is enabled but amount exceeds this, only ACH is shown
  @Column({ type: 'int', nullable: true })
  cardMaxAmountCents?: number;

  // If ACH is enabled but amount is below this, only card is shown
  @Column({ type: 'int', nullable: true })
  achMinAmountCents?: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'varchar', nullable: true })
  description?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * Default Payment Configurations
 *
 * Skuld's recommended defaults for each product type.
 */
export const DEFAULT_PAYMENT_CONFIGS: Array<{
  productType: ProductType;
  achEnabled: boolean;
  cardEnabled: boolean;
  preferredMethod: 'ach' | 'card';
  cardMaxAmountCents?: number;
  achMinAmountCents?: number;
  description: string;
}> = [
  {
    productType: ProductType.ORCHESTRATOR,
    achEnabled: true,
    cardEnabled: true,
    preferredMethod: 'ach',
    cardMaxAmountCents: 50000, // Card only up to $500/month, above that ACH only
    description: 'Orchestrator subscription - Both methods, ACH preferred',
  },
  {
    productType: ProductType.RUNNER,
    achEnabled: true,
    cardEnabled: true,
    preferredMethod: 'ach',
    cardMaxAmountCents: 20000, // Card only up to $200/month
    description: 'Runner license - Both methods, ACH preferred',
  },
  {
    productType: ProductType.MARKETPLACE_BOT,
    achEnabled: true,
    cardEnabled: true,
    preferredMethod: 'card', // Easier for smaller bot subscriptions
    cardMaxAmountCents: 100000, // Card up to $1000/month
    description: 'Marketplace bot - Both methods, card preferred for convenience',
  },
  {
    productType: ProductType.USAGE,
    achEnabled: true,
    cardEnabled: true,
    preferredMethod: 'ach',
    cardMaxAmountCents: 100000, // Card up to $1000/month usage
    description: 'Usage-based billing - Both methods, ACH preferred for high volume',
  },
  {
    productType: ProductType.ENTERPRISE,
    achEnabled: true,
    cardEnabled: false, // Enterprise = ACH only
    preferredMethod: 'ach',
    description: 'Enterprise contracts - ACH only (wire available on request)',
  },
];
