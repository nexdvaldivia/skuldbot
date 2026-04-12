import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Orchestrator MCP Integration Tests (E2E)
 *
 * Tests the complete flow of tenant-specific MCP operations:
 * 1. Compliance: Classify PHI/PII data, route LLM calls, audit
 * 2. Workflows: Create templates, instantiate, customize
 *
 * These tests validate HIPAA compliance requirements and
 * data residency within tenant's VPC.
 */
describe('Orchestrator MCP Integration (E2E)', () => {
  let app: INestApplication;
  const tenantId = `test-tenant-${Date.now()}`;
  let workflowTemplateId: string;
  let auditLogId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('End-to-End HIPAA Compliance Flow', () => {
    it('Step 1: Classify sensitive patient data', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'classify_data',
          arguments: {
            data: {
              patientName: 'John Doe',
              ssn: '123-45-6789',
              diagnosis: 'Type 2 Diabetes',
              claimAmount: 5000,
              provider: 'ACME Medical',
            },
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.classification).toBeDefined();
      expect(response.body.result.classification.level).toBe('PHI');
      expect(response.body.result.fields).toBeDefined();

      // Verify specific fields are detected
      const fieldNames = Object.keys(response.body.result.fields);
      expect(fieldNames).toContain('patientName');
      expect(fieldNames).toContain('ssn');
      expect(response.body.result.fields.ssn.level).toBe('PHI');
      expect(response.body.result.fields.ssn.type).toContain('SSN');
    });

    it('Step 2: Route LLM call based on data sensitivity', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'route_llm',
          arguments: {
            tenantId,
            dataClassification: 'PHI',
            task: 'extract_claim_details',
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.provider).toBeDefined();
      expect(response.body.result.model).toBeDefined();
      expect(response.body.result.endpoint).toBeDefined();

      // PHI data should route to local/HIPAA-compliant LLM
      expect(response.body.result.provider).toBe('local');
      expect(response.body.result.hipaaCompliant).toBe(true);
      expect(response.body.result.requiresBAA).toBe(true);
    });

    it('Step 3: Redact PHI before sending to external system', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'redact_data',
          arguments: {
            data: {
              patientName: 'John Doe',
              ssn: '123-45-6789',
              diagnosis: 'Type 2 Diabetes',
              claimId: 'CLM-2026-001',
            },
            level: 'PHI',
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.redactedData).toBeDefined();

      // Verify PHI is redacted
      expect(response.body.result.redactedData.patientName).toContain('[REDACTED');
      expect(response.body.result.redactedData.ssn).toContain('[REDACTED');

      // Non-PHI fields should remain
      expect(response.body.result.redactedData.claimId).toBe('CLM-2026-001');

      expect(response.body.result.redactedFields).toBeDefined();
      expect(response.body.result.redactedFields.length).toBeGreaterThan(0);
    });

    it('Step 4: Log audit trail for compliance', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'log_audit',
          arguments: {
            tenantId,
            userId: 'user-123',
            action: 'access_phi',
            resourceType: 'claim',
            resourceId: 'CLM-2026-001',
            metadata: {
              dataClassification: 'PHI',
              purpose: 'claims_processing',
              ipAddress: '10.0.1.50',
            },
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.logId).toBeDefined();
      expect(response.body.result.timestamp).toBeDefined();

      auditLogId = response.body.result.logId;
    });

    it('Step 5: Retrieve audit logs for compliance review', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'get_compliance_report',
          arguments: {
            tenantId,
            startDate: new Date(Date.now() - 86400000).toISOString(), // Last 24 hours
            endDate: new Date().toISOString(),
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.report).toBeDefined();
      expect(response.body.result.report.totalEvents).toBeGreaterThan(0);
      expect(response.body.result.report.phiAccess).toBeDefined();
      expect(response.body.result.report.auditLogs).toBeDefined();
      expect(Array.isArray(response.body.result.report.auditLogs)).toBe(true);
    });

    it('Step 6: Check if workflow complies with policies', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'check_compliance_policy',
          arguments: {
            tenantId,
            policyId: 'hipaa-phi-handling',
            context: {
              action: 'process_claim',
              dataClassification: 'PHI',
              destination: 'external_api',
            },
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.allowed).toBeDefined();
      expect(response.body.result.requirements).toBeDefined();

      if (!response.body.result.allowed) {
        expect(response.body.result.violations).toBeDefined();
        expect(response.body.result.recommendations).toBeDefined();
      }
    });
  });

  describe('End-to-End Workflow Template Flow', () => {
    it('Step 1: Create a workflow template', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'create_workflow_template',
          arguments: {
            tenantId,
            name: 'ACME Claims Processing',
            description: 'Process property & casualty claims',
            category: 'claims',
            industry: 'insurance',
            dsl: {
              nodes: [
                {
                  id: 'start',
                  type: 'start',
                  label: 'Start',
                },
                {
                  id: 'classify',
                  type: 'ai_classifier',
                  label: 'Classify Claim',
                  config: {
                    model: '{{llmModel}}',
                    threshold: '{{classificationThreshold}}',
                  },
                },
                {
                  id: 'approve',
                  type: 'decision',
                  label: 'Auto-Approve?',
                  config: {
                    condition: 'claimAmount < {{autoApprovalLimit}}',
                  },
                },
                {
                  id: 'end',
                  type: 'end',
                  label: 'End',
                },
              ],
              edges: [
                { source: 'start', target: 'classify' },
                { source: 'classify', target: 'approve' },
                { source: 'approve', target: 'end' },
              ],
            },
            variables: [
              {
                name: 'llmModel',
                type: 'string',
                description: 'LLM model for classification',
                defaultValue: 'local-llama-3',
                required: true,
              },
              {
                name: 'classificationThreshold',
                type: 'number',
                description: 'Confidence threshold',
                defaultValue: 0.85,
              },
              {
                name: 'autoApprovalLimit',
                type: 'number',
                description: 'Auto-approval amount limit',
                defaultValue: 5000,
                required: true,
              },
            ],
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.templateId).toBeDefined();
      expect(response.body.result.template).toBeDefined();
      expect(response.body.result.template.name).toBe('ACME Claims Processing');

      workflowTemplateId = response.body.result.templateId;
    });

    it('Step 2: List available templates', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'list_workflow_templates',
          arguments: {
            tenantId,
            category: 'claims',
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.templates).toBeDefined();
      expect(Array.isArray(response.body.result.templates)).toBe(true);

      // Verify our template is in the list
      const ourTemplate = response.body.result.templates.find((t) => t.id === workflowTemplateId);
      expect(ourTemplate).toBeDefined();
    });

    it('Step 3: Get template details', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'get_workflow_template',
          arguments: {
            templateId: workflowTemplateId,
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.template).toBeDefined();
      expect(response.body.result.template.id).toBe(workflowTemplateId);
      expect(response.body.result.template.variables).toBeDefined();
      expect(response.body.result.template.variables.length).toBe(3);
    });

    it('Step 4: Update template configuration', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'update_workflow_template',
          arguments: {
            templateId: workflowTemplateId,
            updates: {
              description: 'Updated: Process P&C claims with AI classification',
            },
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.template.description).toContain('Updated');
    });

    it('Step 5: Instantiate template with custom values', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'instantiate_template',
          arguments: {
            templateId: workflowTemplateId,
            name: 'ACME Auto Claims - Production',
            variableValues: {
              llmModel: 'anthropic-claude-sonnet',
              classificationThreshold: 0.9,
              autoApprovalLimit: 10000,
            },
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.workflowId).toBeDefined();
      expect(response.body.result.workflow).toBeDefined();
      expect(response.body.result.workflow.name).toBe('ACME Auto Claims - Production');

      // Verify variable substitution
      const classifyNode = response.body.result.workflow.dsl.nodes.find((n) => n.id === 'classify');
      expect(classifyNode.config.model).toBe('anthropic-claude-sonnet');
      expect(classifyNode.config.threshold).toBe(0.9);

      const approveNode = response.body.result.workflow.dsl.nodes.find((n) => n.id === 'approve');
      expect(approveNode.config.condition).toContain('10000');
    });

    it('Step 6: Clone marketplace bot and customize', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'clone_marketplace_bot',
          arguments: {
            tenantId,
            botId: 'fnol-bot-v1',
            customizations: {
              name: 'ACME FNOL Bot',
              variables: {
                apiEndpoint: 'https://acme-api.example.com/claims',
                claimThreshold: 15000,
                notificationEmail: 'claims@acme.com',
              },
              branding: {
                logoUrl: 'https://acme.com/logo.png',
                primaryColor: '#35D399',
                companyName: 'ACME Insurance Corp',
              },
            },
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.result.templateId).toBeDefined();
      expect(response.body.result.template.name).toBe('ACME FNOL Bot');
      expect(response.body.result.template.tenantId).toBe(tenantId);
      expect(response.body.result.template.sourceBot).toBe('fnol-bot-v1');
      expect(response.body.result.template.metadata).toBeDefined();
      expect(response.body.result.template.metadata.customizations).toBeDefined();
    });
  });

  describe('MCP Resource Access', () => {
    it('should read tenant templates resource', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/mcp/resources/workflow://tenant/${tenantId}/templates`)
        .expect(200);

      expect(response.body.uri).toBeDefined();
      expect(response.body.content).toBeDefined();

      const content = JSON.parse(response.body.content);
      expect(content.templates).toBeDefined();
      expect(Array.isArray(content.templates)).toBe(true);
    });

    it('should read specific template resource', async () => {
      if (!workflowTemplateId) {
        return; // Skip if no template created
      }

      const response = await request(app.getHttpServer())
        .get(`/api/v1/mcp/resources/workflow://templates/${workflowTemplateId}`)
        .expect(200);

      const content = JSON.parse(response.body.content);
      expect(content.template).toBeDefined();
      expect(content.template.id).toBe(workflowTemplateId);
    });

    it('should read compliance audit logs resource', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/mcp/resources/compliance://tenant/${tenantId}/audit-logs`)
        .expect(200);

      const content = JSON.parse(response.body.content);
      expect(content.logs).toBeDefined();
      expect(Array.isArray(content.logs)).toBe(true);
    });
  });

  describe('Cross-Server Compliance Integration', () => {
    it('should classify data before workflow execution', async () => {
      // First classify the data
      const classifyResponse = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'classify_data',
          arguments: {
            data: {
              patientId: 'P-12345',
              diagnosis: 'Hypertension',
            },
          },
        });

      const classification = classifyResponse.body.result.classification.level;

      // Then route LLM based on classification
      const routeResponse = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'route_llm',
          arguments: {
            tenantId,
            dataClassification: classification,
            task: 'extract_data',
          },
        });

      expect(routeResponse.body.success).toBe(true);

      // PHI should route to HIPAA-compliant LLM
      if (classification === 'PHI') {
        expect(routeResponse.body.result.hipaaCompliant).toBe(true);
      }
    });

    it('should audit workflow execution with compliance data', async () => {
      // Execute workflow with PHI data
      const classifyResponse = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'classify_data',
          arguments: {
            data: { ssn: '987-65-4321' },
          },
        });

      // Log audit event
      const auditResponse = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'log_audit',
          arguments: {
            tenantId,
            userId: 'bot-user',
            action: 'execute_workflow',
            resourceType: 'workflow',
            resourceId: workflowTemplateId || 'test-workflow',
            metadata: {
              dataClassification: classifyResponse.body.result.classification.level,
              phiFields: classifyResponse.body.result.fields
                ? Object.keys(classifyResponse.body.result.fields)
                : [],
            },
          },
        });

      expect(auditResponse.body.success).toBe(true);
    });
  });

  describe('Health and Observability', () => {
    it('should have healthy MCP endpoint', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/mcp/health').expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.servers).toBeDefined();
    });

    it('should list all available tools', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/mcp/tools').expect(200);

      expect(response.body.tools).toBeDefined();
      const toolNames = response.body.tools.map((t) => t.name);

      // Compliance tools
      expect(toolNames).toContain('classify_data');
      expect(toolNames).toContain('route_llm');
      expect(toolNames).toContain('redact_data');
      expect(toolNames).toContain('log_audit');

      // Workflow tools
      expect(toolNames).toContain('create_workflow_template');
      expect(toolNames).toContain('instantiate_template');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid data classification', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'classify_data',
          arguments: {
            data: null,
          },
        })
        .expect(201);

      expect(response.body.success).toBe(false);
    });

    it('should handle non-existent template', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'get_workflow_template',
          arguments: {
            templateId: 'non-existent-id',
          },
        })
        .expect(201);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should validate required template variables', async () => {
      if (!workflowTemplateId) {
        return;
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'instantiate_template',
          arguments: {
            templateId: workflowTemplateId,
            name: 'Test',
            variableValues: {
              // Missing required llmModel and autoApprovalLimit
            },
          },
        })
        .expect(201);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });
  });

  describe('HIPAA Compliance Validation', () => {
    it('should detect all PHI types', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'classify_data',
          arguments: {
            data: {
              ssn: '123-45-6789',
              dob: '1980-01-15',
              medicalRecordNumber: 'MRN-123456',
              email: 'patient@example.com',
              phone: '555-123-4567',
            },
          },
        });

      expect(response.body.success).toBe(true);
      const fields = response.body.result.fields;

      expect(fields.ssn.level).toBe('PHI');
      expect(fields.dob.level).toBe('PHI');
      expect(fields.medicalRecordNumber.level).toBe('PHI');
      expect(fields.email.level).toBe('PII');
      expect(fields.phone.level).toBe('PII');
    });

    it('should enforce HIPAA-compliant LLM routing for PHI', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'route_llm',
          arguments: {
            tenantId,
            dataClassification: 'PHI',
            task: 'summarize_medical_record',
          },
        });

      expect(response.body.success).toBe(true);
      expect(response.body.result.hipaaCompliant).toBe(true);
      expect(response.body.result.requiresBAA).toBe(true);
      expect(response.body.result.dataResidency).toBe('us-east-1'); // Tenant VPC

      // Should NOT route to public cloud LLMs
      expect(['openai', 'anthropic']).not.toContain(response.body.result.provider);
    });

    it('should create complete audit trail', async () => {
      // Perform multiple PHI operations
      await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'log_audit',
          arguments: {
            tenantId,
            userId: 'user-456',
            action: 'read_phi',
            resourceType: 'patient_record',
            resourceId: 'PAT-789',
            metadata: { purpose: 'treatment' },
          },
        });

      // Get compliance report
      const reportResponse = await request(app.getHttpServer())
        .post('/api/v1/mcp/tools/call')
        .send({
          name: 'get_compliance_report',
          arguments: {
            tenantId,
            startDate: new Date(Date.now() - 86400000).toISOString(),
            endDate: new Date().toISOString(),
          },
        });

      expect(reportResponse.body.success).toBe(true);
      const report = reportResponse.body.result.report;

      // Verify audit trail completeness
      expect(report.totalEvents).toBeGreaterThan(0);
      expect(report.phiAccess).toBeDefined();
      expect(report.auditLogs).toBeDefined();

      // Each log should have required fields
      report.auditLogs.forEach((log) => {
        expect(log.timestamp).toBeDefined();
        expect(log.userId).toBeDefined();
        expect(log.action).toBeDefined();
        expect(log.resourceType).toBeDefined();
      });
    });
  });
});
