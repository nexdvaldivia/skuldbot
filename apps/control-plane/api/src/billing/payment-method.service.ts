import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PaymentConfig,
  ProductType,
  DEFAULT_PAYMENT_CONFIGS,
} from './entities/payment-config.entity';
import { StripeProvider } from '../integrations/payment/stripe.provider';

/**
 * Payment Method Selection Result
 */
export interface PaymentMethodSelection {
  achAllowed: boolean;
  cardAllowed: boolean;
  preferredMethod: 'ach' | 'card';
  reason?: string;
}

/**
 * Payment Method Service
 *
 * Determines which payment methods are allowed for each product/amount.
 * Skuld controls the configuration - customers choose from available options.
 *
 * Strategy:
 * - High-value B2B subscriptions → ACH preferred (lower fees, better for recurring)
 * - Smaller amounts / marketplace bots → Card OK (faster, easier)
 * - Enterprise → ACH only
 */
@Injectable()
export class PaymentMethodService {
  private readonly logger = new Logger(PaymentMethodService.name);

  constructor(
    @InjectRepository(PaymentConfig)
    private readonly paymentConfigRepository: Repository<PaymentConfig>,
    private readonly stripeProvider: StripeProvider,
  ) {}

  /**
   * Initialize default payment configurations
   * Called on application startup
   */
  async initializeDefaults(): Promise<void> {
    for (const config of DEFAULT_PAYMENT_CONFIGS) {
      const existing = await this.paymentConfigRepository.findOne({
        where: { productType: config.productType },
      });

      if (!existing) {
        await this.paymentConfigRepository.save(config);
        this.logger.log(
          `Created default payment config for ${config.productType}`,
        );
      }
    }
  }

  /**
   * Determine allowed payment methods for a product and amount
   */
  async getAllowedPaymentMethods(
    productType: ProductType,
    amountCents: number,
  ): Promise<PaymentMethodSelection> {
    const config = await this.paymentConfigRepository.findOne({
      where: { productType, isActive: true },
    });

    if (!config) {
      // Default: both methods allowed, ACH preferred
      return {
        achAllowed: true,
        cardAllowed: true,
        preferredMethod: 'ach',
      };
    }

    let achAllowed = config.achEnabled;
    let cardAllowed = config.cardEnabled;
    let reason: string | undefined;

    // Apply amount thresholds
    if (config.cardMaxAmountCents && amountCents > config.cardMaxAmountCents) {
      cardAllowed = false;
      reason = `Card not available for amounts over $${config.cardMaxAmountCents / 100}`;
    }

    if (config.achMinAmountCents && amountCents < config.achMinAmountCents) {
      achAllowed = false;
      reason = `ACH not available for amounts under $${config.achMinAmountCents / 100}`;
    }

    // Ensure at least one method is available
    if (!achAllowed && !cardAllowed) {
      // Fall back to ACH if both get disabled by thresholds
      achAllowed = true;
      reason = 'ACH is required for this amount';
    }

    return {
      achAllowed,
      cardAllowed,
      preferredMethod: config.preferredMethod,
      reason,
    };
  }

  /**
   * Validate that a payment method is allowed for a product/amount
   */
  async validatePaymentMethod(
    productType: ProductType,
    amountCents: number,
    paymentMethodType: 'ach' | 'card',
  ): Promise<{ valid: boolean; error?: string }> {
    const selection = await this.getAllowedPaymentMethods(productType, amountCents);

    if (paymentMethodType === 'ach' && !selection.achAllowed) {
      return {
        valid: false,
        error: `ACH is not available for this product/amount. ${selection.reason || ''}`,
      };
    }

    if (paymentMethodType === 'card' && !selection.cardAllowed) {
      return {
        valid: false,
        error: `Card payment is not available for this product/amount. ${selection.reason || ''}`,
      };
    }

    return { valid: true };
  }

  /**
   * Setup payment method for a customer
   *
   * @returns clientSecret for frontend to complete setup
   */
  async setupPaymentMethod(
    customerId: string,
    methodType: 'ach' | 'card',
    metadata?: Record<string, string>,
  ): Promise<{ clientSecret: string; setupIntentId: string }> {
    if (methodType === 'ach') {
      return this.stripeProvider.createACHSetupIntent(customerId, metadata);
    }

    // For card, create a regular SetupIntent
    // The Stripe provider would need a similar method for cards
    throw new BadRequestException(
      'Card setup not yet implemented - use Stripe Checkout',
    );
  }

  /**
   * Get payment configuration for a product type
   */
  async getPaymentConfig(productType: ProductType): Promise<PaymentConfig | null> {
    return this.paymentConfigRepository.findOne({
      where: { productType },
    });
  }

  /**
   * Update payment configuration for a product type (admin only)
   */
  async updatePaymentConfig(
    productType: ProductType,
    update: {
      achEnabled?: boolean;
      cardEnabled?: boolean;
      preferredMethod?: 'ach' | 'card';
      cardMaxAmountCents?: number;
      achMinAmountCents?: number;
      description?: string;
    },
  ): Promise<PaymentConfig> {
    const config = await this.paymentConfigRepository.findOne({
      where: { productType },
    });

    if (!config) {
      throw new BadRequestException(
        `Payment config not found for ${productType}`,
      );
    }

    // Validate: at least one method must be enabled
    const newAchEnabled = update.achEnabled ?? config.achEnabled;
    const newCardEnabled = update.cardEnabled ?? config.cardEnabled;

    if (!newAchEnabled && !newCardEnabled) {
      throw new BadRequestException(
        'At least one payment method must be enabled',
      );
    }

    Object.assign(config, update);
    return this.paymentConfigRepository.save(config);
  }

  /**
   * Get all payment configurations
   */
  async getAllPaymentConfigs(): Promise<PaymentConfig[]> {
    return this.paymentConfigRepository.find({
      order: { productType: 'ASC' },
    });
  }

  /**
   * Calculate fee comparison for customer
   * Helps customer understand why ACH might be better
   */
  calculateFeeComparison(amountCents: number): {
    achFee: number;
    cardFee: number;
    savings: number;
    achFeePercent: string;
    cardFeePercent: string;
  } {
    // ACH: 0.8% capped at $5
    const achFee = Math.min(amountCents * 0.008, 500);

    // Card: 2.9% + $0.30
    const cardFee = amountCents * 0.029 + 30;

    return {
      achFee: Math.round(achFee),
      cardFee: Math.round(cardFee),
      savings: Math.round(cardFee - achFee),
      achFeePercent: ((achFee / amountCents) * 100).toFixed(2) + '%',
      cardFeePercent: ((cardFee / amountCents) * 100).toFixed(2) + '%',
    };
  }
}
