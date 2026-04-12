import { BillingServer } from './billing.server';

describe('BillingServer', () => {
  let server: BillingServer;

  const billingService = {
    getTenantUsageSummary: jest.fn(),
  };

  const subscriptionService = {
    getSubscription: jest.fn(),
    getPaymentHistory: jest.fn(),
  };

  const paymentProvider = {
    createPaymentIntent: jest.fn(),
    createCustomer: jest.fn(),
    createSubscription: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    server = new BillingServer(
      billingService as never,
      subscriptionService as never,
      paymentProvider as never,
    );
  });

  it('exposes billing tools expected by MCP clients', () => {
    const tools = server.getTools();
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'calculate_invoice',
        'get_invoice',
        'list_invoices',
        'process_payment',
        'create_stripe_customer',
        'create_subscription',
      ]),
    );
  });

  it('calculates invoice from real usage summary and subscription data', async () => {
    billingService.getTenantUsageSummary.mockResolvedValue({
      period: '2026-01',
      metrics: {
        runs: { quantity: 100, amount: 250 },
        tokens: { quantity: 10000, amount: 50 },
      },
      totalAmount: 300,
    });
    subscriptionService.getSubscription.mockResolvedValue({
      id: 'sub-db-1',
      monthlyAmount: 500,
      currency: 'USD',
    });
    subscriptionService.getPaymentHistory.mockResolvedValue([
      {
        status: 'succeeded',
        invoicePeriod: '2026-01',
        stripeInvoiceId: 'in_stripe_1',
        createdAt: new Date('2026-01-20T00:00:00Z'),
        clearedAt: new Date('2026-01-21T00:00:00Z'),
      },
    ]);

    const result = await server.executeTool({
      name: 'calculate_invoice',
      arguments: {
        tenantId: 'tenant-1',
        period: '2026-01',
      },
    });

    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({
      invoiceId: 'inv-2026-01-tenant-1',
      tenantId: 'tenant-1',
      period: '2026-01',
      status: 'paid',
      currency: 'USD',
      stripeInvoiceId: 'in_stripe_1',
    });
    expect(result.result.subtotal).toBeCloseTo(800, 2);
    expect(result.result.total).toBeCloseTo(800, 2);
    expect(result.result.items.length).toBeGreaterThanOrEqual(3);
  });

  it('returns get_invoice from deterministic invoice id', async () => {
    billingService.getTenantUsageSummary.mockResolvedValue({
      period: '2026-02',
      metrics: {},
      totalAmount: 0,
    });
    subscriptionService.getSubscription.mockResolvedValue({
      id: 'sub-db-2',
      monthlyAmount: 0,
      currency: 'USD',
    });
    subscriptionService.getPaymentHistory.mockResolvedValue([]);

    const result = await server.executeTool({
      name: 'get_invoice',
      arguments: {
        invoiceId: 'inv-2026-02-tenant-abc',
      },
    });

    expect(result.success).toBe(true);
    expect(result.result.invoiceId).toBe('inv-2026-02-tenant-abc');
    expect(result.result.tenantId).toBe('tenant-abc');
    expect(result.result.period).toBe('2026-02');
  });

  it('lists invoices from payment history periods', async () => {
    const now = new Date();
    const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const priorPeriod = '2025-12';

    billingService.getTenantUsageSummary.mockResolvedValue({
      period: currentPeriod,
      metrics: {},
      totalAmount: 0,
    });
    subscriptionService.getSubscription.mockResolvedValue({
      id: 'sub-db-3',
      monthlyAmount: 0,
      currency: 'USD',
    });
    subscriptionService.getPaymentHistory.mockResolvedValue([
      {
        status: 'succeeded',
        invoicePeriod: priorPeriod,
        stripeInvoiceId: 'in_prev',
        createdAt: new Date('2026-01-10T00:00:00Z'),
        clearedAt: new Date('2026-01-12T00:00:00Z'),
      },
      {
        status: 'failed',
        invoicePeriod: currentPeriod,
        stripeInvoiceId: 'in_curr',
        createdAt: new Date('2026-02-10T00:00:00Z'),
      },
    ]);

    const result = await server.executeTool({
      name: 'list_invoices',
      arguments: {
        tenantId: 'tenant-2',
        limit: 5,
      },
    });

    expect(result.success).toBe(true);
    expect(result.result.total).toBeGreaterThan(0);
    expect(Array.isArray(result.result.invoices)).toBe(true);
    expect(
      result.result.invoices.some((invoice: { period: string }) => invoice.period === priorPeriod),
    ).toBe(true);
  });

  it('reads payment methods resource from subscription data', async () => {
    subscriptionService.getSubscription.mockResolvedValue({
      id: 'sub-11',
      stripePaymentMethodId: 'pm_1',
      paymentMethodType: 'ach_debit',
      currency: 'USD',
      bankName: 'First Bank',
      bankAccountLast4: '6789',
      bankAccountType: 'checking',
      status: 'active',
    });

    const resource = await server.readResource('billing://tenant/tenant-3/payment-methods');
    const methods = JSON.parse(resource.content);

    expect(resource.uri).toBe('billing://tenant/tenant-3/payment-methods');
    expect(Array.isArray(methods)).toBe(true);
    expect(methods[0]).toMatchObject({
      id: 'pm_1',
      type: 'ach_debit',
      bankAccountLast4: '6789',
      status: 'active',
    });
  });

  it('processes payment through payment provider', async () => {
    paymentProvider.createPaymentIntent.mockResolvedValue({
      id: 'pi_1',
      status: 'succeeded',
      amount: 12345,
      currency: 'usd',
      clientSecret: 'sec',
    });

    const result = await server.executeTool({
      name: 'process_payment',
      arguments: {
        customerId: 'cus_1',
        amount: 123.45,
      },
    });

    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({
      paymentIntentId: 'pi_1',
      amount: 123.45,
    });
    expect(paymentProvider.createPaymentIntent).toHaveBeenCalledWith({
      customerId: 'cus_1',
      amount: 12345,
      currency: 'usd',
      metadata: {
        description: 'SkuldBot payment',
        source: 'mcp_billing_server',
      },
    });
  });

  it('returns error for invalid period format', async () => {
    const result = await server.executeTool({
      name: 'calculate_invoice',
      arguments: {
        tenantId: 'tenant-1',
        period: '2026/01',
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid period format');
  });
});
