import { Test, TestingModule } from '@nestjs/testing';
import { BillingServer } from './billing.server';
import { BillingService } from '../../billing/billing.service';
import { PAYMENT_PROVIDER } from '../../integrations/payment/payment.module';
import { PaymentProvider } from '../../common/interfaces/integration.interface';

describe('BillingServer', () => {
  let server: BillingServer;
  let billingService: jest.Mocked<BillingService>;
  let paymentProvider: jest.Mocked<PaymentProvider>;

  beforeEach(async () => {
    const mockBillingService = {
      getTenantUsageSummary: jest.fn(),
      ingestUsageBatch: jest.fn(),
    };

    const mockPaymentProvider = {
      createCustomer: jest.fn(),
      createPaymentIntent: jest.fn(),
      createSubscription: jest.fn(),
      getInvoice: jest.fn(),
      listInvoices: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingServer,
        {
          provide: BillingService,
          useValue: mockBillingService,
        },
        {
          provide: PAYMENT_PROVIDER,
          useValue: mockPaymentProvider,
        },
      ],
    }).compile();

    server = module.get<BillingServer>(BillingServer);
    billingService = module.get(BillingService) as jest.Mocked<BillingService>;
    paymentProvider = module.get(PAYMENT_PROVIDER) as jest.Mocked<PaymentProvider>;
  });

  describe('getTools', () => {
    it('should return all billing tools', () => {
      const tools = server.getTools();
      
      expect(tools).toHaveLength(3);
      expect(tools.map(t => t.name)).toContain('calculate_invoice');
      expect(tools.map(t => t.name)).toContain('get_invoice');
      expect(tools.map(t => t.name)).toContain('list_invoices');
    });
  });

  describe('getResources', () => {
    it('should return all billing resources', () => {
      const resources = server.getResources();
      
      expect(resources).toHaveLength(3);
      expect(resources.map(r => r.uri)).toContain('billing://tenant/{tenantId}/invoices');
      expect(resources.map(r => r.uri)).toContain('billing://tenant/{tenantId}/payment-methods');
      expect(resources.map(r => r.uri)).toContain('billing://invoices/{invoiceId}');
    });
  });

  describe('executeTool - calculate_invoice', () => {
    it('should calculate invoice with all line items', async () => {
      const result = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-01',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.invoiceId).toBeDefined();
      expect(result.result.tenantId).toBe('test-tenant');
      expect(result.result.period).toBe('2026-01');
      expect(result.result.items).toBeDefined();
      expect(result.result.items.length).toBeGreaterThan(0);
    });

    it('should include orchestrator license in invoice', async () => {
      const result = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-01',
        },
      });

      expect(result.success).toBe(true);
      const orchestratorItem = result.result.items.find(
        i => i.category === 'orchestrator_license'
      );
      
      expect(orchestratorItem).toBeDefined();
      expect(orchestratorItem.quantity).toBe(1);
      expect(orchestratorItem.unitPrice).toBeGreaterThan(0);
      expect(orchestratorItem.total).toBeGreaterThan(0);
    });

    it('should include studio licenses in invoice', async () => {
      const result = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-01',
        },
      });

      const studioItem = result.result.items.find(
        i => i.category === 'studio_licenses'
      );
      
      expect(studioItem).toBeDefined();
      expect(studioItem.quantity).toBeGreaterThan(0);
    });

    it('should include runner costs in invoice', async () => {
      const result = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-01',
        },
      });

      const runnerItem = result.result.items.find(
        i => i.category === 'runners'
      );
      
      expect(runnerItem).toBeDefined();
      expect(runnerItem.details).toBeDefined();
      expect(runnerItem.details.attended).toBeDefined();
      expect(runnerItem.details.unattended).toBeDefined();
    });

    it('should include marketplace bots with "whichever is greater" logic', async () => {
      const result = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-01',
        },
      });

      const marketplaceBots = result.result.items.find(
        i => i.category === 'marketplace_bots'
      );
      
      expect(marketplaceBots).toBeDefined();
      expect(marketplaceBots.details).toBeDefined();
      expect(Array.isArray(marketplaceBots.details)).toBe(true);

      // Check FNOL bot (hybrid pricing)
      const fnolBot = marketplaceBots.details.find(
        d => d.botId === 'fnol-bot-v1'
      );
      
      if (fnolBot) {
        expect(fnolBot.costs.usageBased).toBeDefined();
        expect(fnolBot.costs.callBased).toBeDefined();
        expect(fnolBot.costs.monthlyMinimum).toBeDefined();
        expect(fnolBot.costs.charged).toBeDefined();
        expect(fnolBot.explanation).toContain('greater');
        
        // Charged should be max of the three
        const max = Math.max(
          fnolBot.costs.usageBased,
          fnolBot.costs.callBased,
          fnolBot.costs.monthlyMinimum
        );
        expect(fnolBot.costs.charged).toBe(max);
      }
    });

    it('should calculate correct subtotal', async () => {
      const result = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-01',
        },
      });

      const calculatedSubtotal = result.result.items.reduce(
        (sum, item) => sum + item.total,
        0
      );
      
      expect(result.result.subtotal).toBeCloseTo(calculatedSubtotal, 2);
    });

    it('should calculate tax correctly', async () => {
      const result = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-01',
        },
      });

      // Tax should be 10% of subtotal (in the mock implementation)
      const expectedTax = result.result.subtotal * 0.1;
      expect(result.result.tax).toBeCloseTo(expectedTax, 2);
    });

    it('should calculate total correctly', async () => {
      const result = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-01',
        },
      });

      const expectedTotal = result.result.subtotal + result.result.tax;
      expect(result.result.total).toBeCloseTo(expectedTotal, 2);
    });

    it('should generate unique invoice ID', async () => {
      const result1 = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-01',
        },
      });

      const result2 = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-02',
        },
      });

      expect(result1.result.invoiceId).not.toBe(result2.result.invoiceId);
    });

    it('should set due date correctly', async () => {
      const result = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-01',
        },
      });

      // Due date should be 15th of next month
      expect(result.result.dueDate).toBe('2026-02-15');
    });

    it('should set invoice status to pending', async () => {
      const result = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-01',
        },
      });

      expect(result.result.status).toBe('pending');
    });

    it('should include currency', async () => {
      const result = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-01',
        },
      });

      expect(result.result.currency).toBe('USD');
    });
  });

  describe('executeTool - get_invoice', () => {
    it('should retrieve invoice by ID', async () => {
      const result = await server.executeTool({
        name: 'get_invoice',
        arguments: {
          invoiceId: 'inv-2026-01-test',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.invoiceId).toBe('inv-2026-01-test');
    });

    it('should include invoice status', async () => {
      const result = await server.executeTool({
        name: 'get_invoice',
        arguments: {
          invoiceId: 'inv-2026-01-test',
        },
      });

      expect(result.result.status).toBeDefined();
      expect(['paid', 'pending', 'overdue', 'cancelled']).toContain(result.result.status);
    });

    it('should include payment timestamp for paid invoices', async () => {
      const result = await server.executeTool({
        name: 'get_invoice',
        arguments: {
          invoiceId: 'inv-2026-01-test',
        },
      });

      if (result.result.status === 'paid') {
        expect(result.result.paidAt).toBeDefined();
      }
    });
  });

  describe('executeTool - list_invoices', () => {
    it('should list invoices for tenant', async () => {
      const result = await server.executeTool({
        name: 'list_invoices',
        arguments: {
          tenantId: 'test-tenant',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.invoices).toBeDefined();
      expect(Array.isArray(result.result.invoices)).toBe(true);
      expect(result.result.total).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      const result = await server.executeTool({
        name: 'list_invoices',
        arguments: {
          tenantId: 'test-tenant',
          limit: 5,
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.invoices.length).toBeLessThanOrEqual(5);
    });

    it('should use default limit of 12', async () => {
      const result = await server.executeTool({
        name: 'list_invoices',
        arguments: {
          tenantId: 'test-tenant',
        },
      });

      expect(result.success).toBe(true);
      // Should not exceed default limit
      expect(result.result.invoices.length).toBeLessThanOrEqual(12);
    });

    it('should include invoice summary fields', async () => {
      const result = await server.executeTool({
        name: 'list_invoices',
        arguments: {
          tenantId: 'test-tenant',
        },
      });

      if (result.result.invoices.length > 0) {
        const invoice = result.result.invoices[0];
        expect(invoice.invoiceId).toBeDefined();
        expect(invoice.period).toBeDefined();
        expect(invoice.total).toBeDefined();
        expect(invoice.status).toBeDefined();
        expect(invoice.dueDate).toBeDefined();
      }
    });

    it('should sort by most recent first', async () => {
      const result = await server.executeTool({
        name: 'list_invoices',
        arguments: {
          tenantId: 'test-tenant',
        },
      });

      if (result.result.invoices.length > 1) {
        const first = result.result.invoices[0];
        const second = result.result.invoices[1];
        
        // First period should be more recent than second
        expect(first.period >= second.period).toBe(true);
      }
    });
  });

  describe('readResource', () => {
    it('should read tenant invoices', async () => {
      const resource = await server.readResource('billing://tenant/test-tenant/invoices');

      expect(resource.uri).toBe('billing://tenant/test-tenant/invoices');
      const content = JSON.parse(resource.content);
      expect(content.invoices).toBeDefined();
    });

    it('should read payment methods', async () => {
      const resource = await server.readResource('billing://tenant/test-tenant/payment-methods');

      const content = JSON.parse(resource.content);
      expect(Array.isArray(content)).toBe(true);
      
      if (content.length > 0) {
        const method = content[0];
        expect(method.id).toBeDefined();
        expect(method.type).toBeDefined();
        expect(['card', 'bank_account', 'paypal']).toContain(method.type);
      }
    });

    it('should read specific invoice', async () => {
      const resource = await server.readResource('billing://invoices/inv-123');

      const content = JSON.parse(resource.content);
      expect(content.result).toBeDefined();
    });

    it('should throw error for invalid URI', async () => {
      await expect(
        server.readResource('invalid://uri')
      ).rejects.toThrow('Unknown resource URI');
    });
  });

  describe('Due Date Calculation', () => {
    it('should calculate due date for January', () => {
      // calculateDueDate is private, but we can test via calculate_invoice
      const result = server['calculateDueDate']('2026-01');
      expect(result).toBe('2026-02-15');
    });

    it('should calculate due date for December', () => {
      const result = server['calculateDueDate']('2025-12');
      expect(result).toBe('2026-01-15');
    });

    it('should always use 15th as due day', () => {
      const result = server['calculateDueDate']('2026-06');
      expect(result).toContain('-15');
    });
  });

  describe('Invoice Line Items', () => {
    it('should have descriptions for all items', async () => {
      const result = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-01',
        },
      });

      result.result.items.forEach(item => {
        expect(item.description).toBeDefined();
        expect(item.description.length).toBeGreaterThan(0);
      });
    });

    it('should have categories for all items', async () => {
      const result = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-01',
        },
      });

      const validCategories = [
        'orchestrator_license',
        'studio_licenses',
        'runners',
        'marketplace_bots',
        'storage',
        'support',
      ];

      result.result.items.forEach(item => {
        expect(validCategories).toContain(item.category);
      });
    });

    it('should calculate totals correctly for each item', async () => {
      const result = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-01',
        },
      });

      result.result.items.forEach(item => {
        if (item.unitPrice !== null) {
          const expectedTotal = item.quantity * item.unitPrice;
          expect(item.total).toBeCloseTo(expectedTotal, 2);
        } else {
          // For items without unitPrice (like marketplace_bots), just verify total exists
          expect(item.total).toBeGreaterThanOrEqual(0);
        }
      });
    });
  });

  describe('Hybrid Pricing Examples', () => {
    it('should show FNOL bot charges monthly minimum when low usage', async () => {
      const result = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-01',
        },
      });

      const marketplaceBots = result.result.items.find(
        i => i.category === 'marketplace_bots'
      );
      const fnolBot = marketplaceBots.details.find(
        d => d.botId === 'fnol-bot-v1'
      );

      if (fnolBot) {
        // In mock, FNOL has 320 claims ($960) and 4500 calls ($3375)
        // Monthly minimum is $4000, so it should charge $4000
        expect(fnolBot.costs.charged).toBe(4000);
        expect(fnolBot.explanation).toContain('monthly minimum');
        expect(fnolBot.explanation).toContain('greater');
      }
    });

    it('should show claims processor charges usage-based when higher', async () => {
      const result = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          tenantId: 'test-tenant',
          period: '2026-01',
        },
      });

      const marketplaceBots = result.result.items.find(
        i => i.category === 'marketplace_bots'
      );
      const claimsBot = marketplaceBots.details.find(
        d => d.botId === 'claims-processor-v1'
      );

      if (claimsBot) {
        // In mock, 1200 records at $0.50 = $600
        // Monthly minimum is $500, so it should charge $600
        expect(claimsBot.costs.charged).toBe(600);
        expect(claimsBot.explanation).toContain('usage-based');
      }
    });
  });

  describe('Stripe Integration', () => {
    it('should process payment via Stripe', async () => {
      const mockPaymentIntent = {
        id: 'pi_test123',
        status: 'succeeded',
        amount: 500000, // $5000 in cents
        currency: 'usd',
        clientSecret: 'pi_test123_secret',
      };

      paymentProvider.createPaymentIntent.mockResolvedValue(mockPaymentIntent as any);

      const result = await server.executeTool({
        name: 'process_payment',
        arguments: {
          customerId: 'cus_test123',
          amount: 5000,
          description: 'FNOL Bot monthly invoice',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        paymentIntentId: 'pi_test123',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
        clientSecret: 'pi_test123_secret',
      });

      expect(paymentProvider.createPaymentIntent).toHaveBeenCalledWith({
        customerId: 'cus_test123',
        amount: 500000, // Converted to cents
        currency: 'usd',
        description: 'FNOL Bot monthly invoice',
        metadata: {
          source: 'mcp_billing_server',
        },
      });
    });

    it('should create Stripe customer', async () => {
      const mockCustomer = {
        id: 'cus_new123',
        email: 'acme@example.com',
        name: 'ACME Insurance',
        created: new Date('2026-01-27'),
      };

      paymentProvider.createCustomer.mockResolvedValue(mockCustomer as any);

      const result = await server.executeTool({
        name: 'create_stripe_customer',
        arguments: {
          email: 'acme@example.com',
          name: 'ACME Insurance',
          metadata: { tenantId: 'tenant-123' },
        },
      });

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        customerId: 'cus_new123',
        email: 'acme@example.com',
        name: 'ACME Insurance',
      });

      expect(paymentProvider.createCustomer).toHaveBeenCalledWith({
        email: 'acme@example.com',
        name: 'ACME Insurance',
        metadata: { tenantId: 'tenant-123' },
      });
    });

    it('should create subscription', async () => {
      const mockSubscription = {
        id: 'sub_test123',
        status: 'active',
        customerId: 'cus_test123',
        currentPeriodStart: new Date('2026-01-27'),
        currentPeriodEnd: new Date('2026-02-27'),
        trialEnd: new Date('2026-02-10'),
      };

      paymentProvider.createSubscription.mockResolvedValue(mockSubscription as any);

      const result = await server.executeTool({
        name: 'create_subscription',
        arguments: {
          customerId: 'cus_test123',
          priceId: 'price_enterprise',
          trialDays: 14,
        },
      });

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        subscriptionId: 'sub_test123',
        status: 'active',
      });

      expect(paymentProvider.createSubscription).toHaveBeenCalledWith({
        customerId: 'cus_test123',
        items: [{ priceId: 'price_enterprise' }],
        trialPeriodDays: 14,
        metadata: {
          source: 'mcp_billing_server',
        },
      });
    });

    it('should handle Stripe errors gracefully', async () => {
      paymentProvider.createPaymentIntent.mockRejectedValue(
        new Error('Insufficient funds'),
      );

      const result = await server.executeTool({
        name: 'process_payment',
        arguments: {
          customerId: 'cus_test123',
          amount: 5000,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Stripe payment failed');
      expect(result.error).toContain('Insufficient funds');
    });
  });

  describe('error handling', () => {
    it('should handle unknown tool', async () => {
      const result = await server.executeTool({
        name: 'unknown_tool',
        arguments: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });

    it('should handle missing required arguments', async () => {
      const result = await server.executeTool({
        name: 'calculate_invoice',
        arguments: {
          // Missing tenantId and period
        },
      });

      expect(result.success).toBe(false);
    });
  });
});

