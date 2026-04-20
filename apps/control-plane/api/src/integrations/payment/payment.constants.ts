/**
 * Injection token for the payment provider.
 * Separated from payment.module.ts to avoid circular imports
 * (WebhooksController imports this token, and PaymentModule imports WebhooksController).
 */
export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
