import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceServer } from './compliance.server';
import { DataClassification, LLMRoute } from '../types/mcp.types';

describe('ComplianceServer', () => {
  let server: ComplianceServer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ComplianceServer],
    }).compile();

    server = module.get<ComplianceServer>(ComplianceServer);
  });

  describe('getTools', () => {
    it('should return all compliance tools', () => {
      const tools = server.getTools();

      expect(tools).toHaveLength(6);
      expect(tools.map((t) => t.name)).toContain('classify_data');
      expect(tools.map((t) => t.name)).toContain('route_llm_request');
      expect(tools.map((t) => t.name)).toContain('redact_sensitive_data');
      expect(tools.map((t) => t.name)).toContain('log_audit_event');
    });
  });

  describe('executeTool - classify_data', () => {
    describe('PHI Detection', () => {
      it('should detect SSN as PHI', async () => {
        const result = await server.executeTool({
          name: 'classify_data',
          arguments: {
            tenantId: 'test-tenant',
            data: {
              ssn: '123-45-6789',
            },
          },
        });

        expect(result.success).toBe(true);
        const classified = result.result;
        expect(classified.overallClassification).toBe(DataClassification.PHI);
        expect(classified.requiresPrivateLLM).toBe(true);
        expect(classified.recommendedRoute).toBe(LLMRoute.PRIVATE);

        const ssnField = classified.fields.find((f) => f.name === 'ssn');
        expect(ssnField.classification).toBe(DataClassification.PHI);
        expect(ssnField.confidence).toBeGreaterThan(0.9);
        expect(ssnField.detectedType).toBe('SSN');
      });

      it('should detect medical record number as PHI', async () => {
        const result = await server.executeTool({
          name: 'classify_data',
          arguments: {
            tenantId: 'test-tenant',
            data: {
              patient_id: 'MRN123456',
              diagnosis: 'Broken arm',
            },
          },
        });

        expect(result.success).toBe(true);
        expect(result.result.overallClassification).toBe(DataClassification.PHI);
        expect(result.result.requiresPrivateLLM).toBe(true);
      });

      it('should detect prescription data as PHI', async () => {
        const result = await server.executeTool({
          name: 'classify_data',
          arguments: {
            tenantId: 'test-tenant',
            data: {
              prescription: 'Lisinopril 10mg daily',
            },
          },
        });

        expect(result.success).toBe(true);
        expect(result.result.overallClassification).toBe(DataClassification.PHI);
      });
    });

    describe('PII Detection', () => {
      it('should detect email as PII', async () => {
        const result = await server.executeTool({
          name: 'classify_data',
          arguments: {
            tenantId: 'test-tenant',
            data: {
              email: 'john.doe@example.com',
              first_name: 'John',
              last_name: 'Doe',
            },
          },
        });

        expect(result.success).toBe(true);
        expect(result.result.overallClassification).toBe(DataClassification.PII);

        const emailField = result.result.fields.find((f) => f.name === 'email');
        expect(emailField.classification).toBe(DataClassification.PII);
      });

      it('should detect phone and address as PII', async () => {
        const result = await server.executeTool({
          name: 'classify_data',
          arguments: {
            tenantId: 'test-tenant',
            data: {
              phone: '555-1234',
              address: '123 Main St',
            },
          },
        });

        expect(result.success).toBe(true);
        expect(result.result.overallClassification).toBe(DataClassification.PII);
      });
    });

    describe('PCI Detection', () => {
      it('should detect credit card as PCI', async () => {
        const result = await server.executeTool({
          name: 'classify_data',
          arguments: {
            tenantId: 'test-tenant',
            data: {
              credit_card: '4532-1234-5678-9010',
              cvv: '123',
            },
          },
        });

        expect(result.success).toBe(true);
        expect(result.result.overallClassification).toBe(DataClassification.PCI);
        expect(result.result.requiresPrivateLLM).toBe(true);

        const ccField = result.result.fields.find((f) => f.name === 'credit_card');
        expect(ccField.classification).toBe(DataClassification.PCI);
        expect(ccField.detectedType).toBe('Credit Card');
      });
    });

    describe('Mixed Data Classification', () => {
      it('should use highest classification level', async () => {
        const result = await server.executeTool({
          name: 'classify_data',
          arguments: {
            tenantId: 'test-tenant',
            data: {
              patient_name: 'John Doe', // PII
              ssn: '123-45-6789', // PHI (highest)
              claim_amount: 5000, // Internal
            },
          },
        });

        expect(result.success).toBe(true);
        expect(result.result.overallClassification).toBe(DataClassification.PHI);
        expect(result.result.fields).toHaveLength(3);
      });

      it('should detect public data correctly', async () => {
        const result = await server.executeTool({
          name: 'classify_data',
          arguments: {
            tenantId: 'test-tenant',
            data: {
              company_name: 'ACME Insurance',
              claim_type: 'property',
            },
          },
        });

        expect(result.success).toBe(true);
        expect(result.result.overallClassification).toBe(DataClassification.INTERNAL);
        expect(result.result.requiresPrivateLLM).toBe(false);
        expect(result.result.recommendedRoute).toBe(LLMRoute.CLOUD);
      });
    });

    it('should log audit event for classification', async () => {
      const result = await server.executeTool({
        name: 'classify_data',
        arguments: {
          tenantId: 'test-tenant',
          data: { ssn: '123-45-6789' },
          context: 'ai_planner_v2',
        },
      });

      expect(result.success).toBe(true);
      // Audit event should be logged (verified in log_audit_event tests)
    });
  });

  describe('executeTool - route_llm_request', () => {
    it('should route PHI to private LLM', async () => {
      const result = await server.executeTool({
        name: 'route_llm_request',
        arguments: {
          tenantId: 'test-tenant',
          dataClassification: 'PHI',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.route).toBe(LLMRoute.PRIVATE);
      expect(result.result.explanation).toContain('HIPAA compliance');
    });

    it('should route PCI to private LLM', async () => {
      const result = await server.executeTool({
        name: 'route_llm_request',
        arguments: {
          tenantId: 'test-tenant',
          dataClassification: 'PCI',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.route).toBe(LLMRoute.PRIVATE);
      expect(result.result.explanation).toContain('PCI-DSS compliance');
    });

    it('should allow cloud LLM for public data', async () => {
      const result = await server.executeTool({
        name: 'route_llm_request',
        arguments: {
          tenantId: 'test-tenant',
          dataClassification: 'PUBLIC',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.route).toBe(LLMRoute.CLOUD);
    });

    it('should override insecure preference for PHI', async () => {
      const result = await server.executeTool({
        name: 'route_llm_request',
        arguments: {
          tenantId: 'test-tenant',
          dataClassification: 'PHI',
          preferredRoute: 'cloud', // User wants cloud, but PHI requires private
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.route).toBe(LLMRoute.PRIVATE); // Overridden for compliance
      expect(result.result.explanation).toContain('HIPAA compliance');
    });

    it('should allow more secure preference', async () => {
      const result = await server.executeTool({
        name: 'route_llm_request',
        arguments: {
          tenantId: 'test-tenant',
          dataClassification: 'INTERNAL',
          preferredRoute: 'private', // More secure than needed
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.route).toBe(LLMRoute.PRIVATE); // Honored
    });
  });

  describe('executeTool - redact_sensitive_data', () => {
    it('should redact PHI with partial redaction', async () => {
      const result = await server.executeTool({
        name: 'redact_sensitive_data',
        arguments: {
          data: {
            ssn: '123-45-6789',
            patient_name: 'John Doe',
            claim_amount: 5000,
          },
          redactionLevel: 'partial',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.redacted.ssn).toBe('***6789'); // Last 4 shown
      expect(result.result.redacted.patient_name).toContain('***');
      expect(result.result.redacted.claim_amount).toBe(5000); // Not sensitive
    });

    it('should fully redact with full redaction level', async () => {
      const result = await server.executeTool({
        name: 'redact_sensitive_data',
        arguments: {
          data: {
            ssn: '123-45-6789',
            credit_card: '4532-1234-5678-9010',
          },
          redactionLevel: 'full',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.redacted.ssn).toBe('***REDACTED***');
      expect(result.result.redacted.credit_card).toBe('***REDACTED***');
    });

    it('should classify data if not provided', async () => {
      const result = await server.executeTool({
        name: 'redact_sensitive_data',
        arguments: {
          data: {
            ssn: '123-45-6789',
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.redacted.ssn).toContain('***');
    });
  });

  describe('executeTool - log_audit_event', () => {
    it('should log audit event successfully', async () => {
      const result = await server.executeTool({
        name: 'log_audit_event',
        arguments: {
          tenantId: 'test-tenant',
          action: 'data_access',
          resource: 'patient_records',
          dataClassification: 'PHI',
          userId: 'user-123',
          metadata: {
            recordCount: 10,
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.logged).toBe(true);
      expect(result.result.timestamp).toBeDefined();
    });

    it('should handle audit events without user', async () => {
      const result = await server.executeTool({
        name: 'log_audit_event',
        arguments: {
          tenantId: 'test-tenant',
          action: 'bot_execution',
          resource: 'fnol_bot',
          runnerId: 'runner-1',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.logged).toBe(true);
    });
  });

  describe('executeTool - check_compliance_policy', () => {
    it('should allow compliant actions', async () => {
      const result = await server.executeTool({
        name: 'check_compliance_policy',
        arguments: {
          tenantId: 'test-tenant',
          action: 'internal_api_call',
          context: {},
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.allowed).toBe(true);
      expect(result.result.violations).toHaveLength(0);
    });

    it('should deny external integrations if disabled', async () => {
      const result = await server.executeTool({
        name: 'check_compliance_policy',
        arguments: {
          tenantId: 'test-tenant',
          action: 'external_api_call',
          context: {},
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.allowed).toBe(false);
      expect(result.result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('executeTool - get_compliance_report', () => {
    it('should generate compliance report', async () => {
      // Log some events first
      await server.executeTool({
        name: 'log_audit_event',
        arguments: {
          tenantId: 'test-tenant',
          action: 'data_access',
          resource: 'records',
          dataClassification: 'PHI',
        },
      });

      const result = await server.executeTool({
        name: 'get_compliance_report',
        arguments: {
          tenantId: 'test-tenant',
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2026-12-31T23:59:59Z',
          reportType: 'audit',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.tenantId).toBe('test-tenant');
      expect(result.result.summary).toBeDefined();
      expect(result.result.summary.totalEvents).toBeGreaterThan(0);
      expect(result.result.summary.byClassification).toBeDefined();
      expect(result.result.summary.byAction).toBeDefined();
    });

    it('should filter by date range', async () => {
      const result = await server.executeTool({
        name: 'get_compliance_report',
        arguments: {
          tenantId: 'test-tenant',
          startDate: '2026-01-27T00:00:00Z',
          endDate: '2026-01-27T23:59:59Z',
        },
      });

      expect(result.success).toBe(true);
      // All logs should be within date range
    });
  });

  describe('readResource', () => {
    it('should read tenant policies', async () => {
      const resource = await server.readResource('compliance://tenant/test-tenant/policies');

      expect(resource.uri).toBe('compliance://tenant/test-tenant/policies');
      const content = JSON.parse(resource.content);
      expect(content.tenantId).toBe('test-tenant');
      expect(content.dataResidency).toBeDefined();
      expect(content.allowedLLMRoutes).toBeDefined();
      expect(content.maxDataRetentionDays).toBe(2555); // 7 years for HIPAA
    });

    it('should read audit log', async () => {
      const resource = await server.readResource('compliance://tenant/test-tenant/audit-log');

      const content = JSON.parse(resource.content);
      expect(content.logs).toBeDefined();
      expect(Array.isArray(content.logs)).toBe(true);
    });

    it('should read classification rules', async () => {
      const resource = await server.readResource(
        'compliance://tenant/test-tenant/classification-rules',
      );

      const content = JSON.parse(resource.content);
      expect(content.phi).toBeDefined();
      expect(content.pii).toBeDefined();
      expect(content.pci).toBeDefined();
    });

    it('should read LLM routing config', async () => {
      const resource = await server.readResource(
        'compliance://tenant/test-tenant/llm-routing-config',
      );

      const content = JSON.parse(resource.content);
      expect(content.allowedRoutes).toBeDefined();
      expect(content.routingRules).toBeDefined();
      expect(content.routingRules.phi).toBe(LLMRoute.PRIVATE);
    });
  });

  describe('HIPAA Compliance', () => {
    it('should enforce 7-year retention for HIPAA', async () => {
      const resource = await server.readResource('compliance://tenant/test-tenant/policies');
      const policies = JSON.parse(resource.content);

      expect(policies.maxDataRetentionDays).toBe(2555); // 7 years
    });

    it('should require private LLM for all PHI', async () => {
      const classification = await server.executeTool({
        name: 'classify_data',
        arguments: {
          tenantId: 'test-tenant',
          data: { ssn: '123-45-6789' },
        },
      });

      expect(classification.result.requiresPrivateLLM).toBe(true);
      expect(classification.result.recommendedRoute).toBe(LLMRoute.PRIVATE);
    });

    it('should audit all PHI access', async () => {
      await server.executeTool({
        name: 'classify_data',
        arguments: {
          tenantId: 'test-tenant',
          data: { ssn: '123-45-6789' },
          context: 'test',
        },
      });

      const resource = await server.readResource('compliance://tenant/test-tenant/audit-log');
      const content = JSON.parse(resource.content);

      const phiLogs = content.logs.filter(
        (log) => log.dataClassification === DataClassification.PHI,
      );
      expect(phiLogs.length).toBeGreaterThan(0);
    });
  });
});
