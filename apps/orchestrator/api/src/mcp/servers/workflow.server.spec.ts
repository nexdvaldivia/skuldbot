import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowServer } from './workflow.server';

describe('WorkflowServer', () => {
  let server: WorkflowServer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkflowServer],
    }).compile();

    server = module.get<WorkflowServer>(WorkflowServer);
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(server).toBeDefined();
    });

    it('should seed example templates on startup', async () => {
      const result = await server.executeTool({
        name: 'list_workflow_templates',
        arguments: {
          tenantId: 'test-tenant',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.templates.length).toBeGreaterThan(0);
    });
  });

  describe('listTools', () => {
    it('should return all available tools', () => {
      const tools = server.getTools();

      expect(tools.length).toBeGreaterThan(0);
      expect(tools.every((tool) => tool.name && tool.description)).toBe(true);
    });

    it('should include workflow template CRUD tools', () => {
      const tools = server.getTools();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('create_workflow_template');
      expect(toolNames).toContain('get_workflow_template');
      expect(toolNames).toContain('list_workflow_templates');
      expect(toolNames).toContain('update_workflow_template');
      expect(toolNames).toContain('delete_workflow_template');
    });

    it('should include template instantiation tool', () => {
      const tools = server.getTools();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('instantiate_template');
    });

    it('should include marketplace bot cloning tool', () => {
      const tools = server.getTools();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('clone_marketplace_bot');
    });

    it('should have proper input schemas', () => {
      const tools = server.getTools();

      tools.forEach((tool) => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });

    it('should have workflow tags', () => {
      const tools = server.getTools();

      tools.forEach((tool) => {
        expect(tool.tags).toContain('workflow');
      });
    });
  });

  describe('listResources', () => {
    it('should return all available resources', () => {
      const resources = server.getResources();

      expect(resources.length).toBeGreaterThan(0);
      expect(resources.every((r) => r.uri && r.name)).toBe(true);
    });

    it('should include tenant templates resource', () => {
      const resources = server.getResources();
      const uris = resources.map((r) => r.uri);

      expect(uris.some((uri) => uri.includes('workflow://tenant/'))).toBe(true);
    });

    it('should include specific template resource', () => {
      const resources = server.getResources();
      const uris = resources.map((r) => r.uri);

      expect(uris.some((uri) => uri.includes('workflow://templates/'))).toBe(true);
    });

    it('should use application/json mime type', () => {
      const resources = server.getResources();

      resources.forEach((resource) => {
        expect(resource.mimeType).toBe('application/json');
      });
    });
  });

  describe('executeTool - create_workflow_template', () => {
    it('should create a new workflow template', async () => {
      const result = await server.executeTool({
        name: 'create_workflow_template',
        arguments: {
          tenantId: 'test-tenant',
          name: 'Claims Processing Workflow',
          description: 'Process insurance claims end-to-end',
          category: 'claims',
          industry: 'insurance',
          dsl: {
            nodes: [
              { id: 'start', type: 'start' },
              { id: 'end', type: 'end' },
            ],
            edges: [{ source: 'start', target: 'end' }],
          },
          variables: [
            {
              name: 'claimThreshold',
              type: 'number',
              description: 'Auto-approve threshold',
              defaultValue: 5000,
            },
          ],
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.templateId).toBeDefined();
      expect(result.result.template.name).toBe('Claims Processing Workflow');
      expect(result.result.template.tenantId).toBe('test-tenant');
      expect(result.result.template.category).toBe('claims');
      expect(result.result.template.industry).toBe('insurance');
    });

    it('should validate required fields', async () => {
      const result = await server.executeTool({
        name: 'create_workflow_template',
        arguments: {
          // Missing required fields
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should assign unique IDs', async () => {
      const result1 = await server.executeTool({
        name: 'create_workflow_template',
        arguments: {
          tenantId: 'test-tenant',
          name: 'Template 1',
          description: 'Test',
          category: 'general',
          dsl: {},
        },
      });

      const result2 = await server.executeTool({
        name: 'create_workflow_template',
        arguments: {
          tenantId: 'test-tenant',
          name: 'Template 2',
          description: 'Test',
          category: 'general',
          dsl: {},
        },
      });

      expect(result1.result.templateId).not.toBe(result2.result.templateId);
    });

    it('should set createdAt and updatedAt timestamps', async () => {
      const result = await server.executeTool({
        name: 'create_workflow_template',
        arguments: {
          tenantId: 'test-tenant',
          name: 'Test Template',
          description: 'Test',
          category: 'general',
          dsl: {},
        },
      });

      expect(result.result.template.createdAt).toBeDefined();
      expect(result.result.template.updatedAt).toBeDefined();
      expect(new Date(result.result.template.createdAt).getTime()).toBeLessThanOrEqual(
        new Date().getTime(),
      );
    });
  });

  describe('executeTool - get_workflow_template', () => {
    it('should retrieve a template by ID', async () => {
      // First create a template
      const createResult = await server.executeTool({
        name: 'create_workflow_template',
        arguments: {
          tenantId: 'test-tenant',
          name: 'Test Template',
          description: 'Test',
          category: 'general',
          dsl: {},
        },
      });

      const templateId = createResult.result.templateId;

      // Then retrieve it
      const getResult = await server.executeTool({
        name: 'get_workflow_template',
        arguments: {
          templateId,
        },
      });

      expect(getResult.success).toBe(true);
      expect(getResult.result.template.id).toBe(templateId);
      expect(getResult.result.template.name).toBe('Test Template');
    });

    it('should return error for non-existent template', async () => {
      const result = await server.executeTool({
        name: 'get_workflow_template',
        arguments: {
          templateId: 'non-existent-id',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('executeTool - list_workflow_templates', () => {
    it('should list all templates for a tenant', async () => {
      const result = await server.executeTool({
        name: 'list_workflow_templates',
        arguments: {
          tenantId: 'test-tenant',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.templates).toBeDefined();
      expect(Array.isArray(result.result.templates)).toBe(true);
    });

    it('should filter by category', async () => {
      const result = await server.executeTool({
        name: 'list_workflow_templates',
        arguments: {
          tenantId: 'test-tenant',
          category: 'claims',
        },
      });

      expect(result.success).toBe(true);
      result.result.templates.forEach((template) => {
        expect(template.category).toBe('claims');
      });
    });

    it('should filter by industry', async () => {
      const result = await server.executeTool({
        name: 'list_workflow_templates',
        arguments: {
          tenantId: 'test-tenant',
          industry: 'insurance',
        },
      });

      expect(result.success).toBe(true);
      result.result.templates.forEach((template) => {
        expect(template.industry).toBe('insurance');
      });
    });

    it('should return count of templates', async () => {
      const result = await server.executeTool({
        name: 'list_workflow_templates',
        arguments: {
          tenantId: 'test-tenant',
        },
      });

      expect(result.result.total).toBe(result.result.templates.length);
    });
  });

  describe('executeTool - update_workflow_template', () => {
    it('should update template fields', async () => {
      // Create a template
      const createResult = await server.executeTool({
        name: 'create_workflow_template',
        arguments: {
          tenantId: 'test-tenant',
          name: 'Original Name',
          description: 'Original description',
          category: 'general',
          dsl: {},
        },
      });

      const templateId = createResult.result.templateId;

      // Update it
      const updateResult = await server.executeTool({
        name: 'update_workflow_template',
        arguments: {
          templateId,
          updates: {
            name: 'Updated Name',
            description: 'Updated description',
          },
        },
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.result.template.name).toBe('Updated Name');
      expect(updateResult.result.template.description).toBe('Updated description');
    });

    it('should update updatedAt timestamp', async () => {
      const createResult = await server.executeTool({
        name: 'create_workflow_template',
        arguments: {
          tenantId: 'test-tenant',
          name: 'Test',
          description: 'Test',
          category: 'general',
          dsl: {},
        },
      });

      const templateId = createResult.result.templateId;
      const originalUpdatedAt = createResult.result.template.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updateResult = await server.executeTool({
        name: 'update_workflow_template',
        arguments: {
          templateId,
          updates: { name: 'Updated' },
        },
      });

      expect(updateResult.result.template.updatedAt).not.toBe(originalUpdatedAt);
      expect(new Date(updateResult.result.template.updatedAt).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime(),
      );
    });

    it('should return error for non-existent template', async () => {
      const result = await server.executeTool({
        name: 'update_workflow_template',
        arguments: {
          templateId: 'non-existent',
          updates: { name: 'Test' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('executeTool - delete_workflow_template', () => {
    it('should delete a template', async () => {
      // Create a template
      const createResult = await server.executeTool({
        name: 'create_workflow_template',
        arguments: {
          tenantId: 'test-tenant',
          name: 'To Delete',
          description: 'Test',
          category: 'general',
          dsl: {},
        },
      });

      const templateId = createResult.result.templateId;

      // Delete it
      const deleteResult = await server.executeTool({
        name: 'delete_workflow_template',
        arguments: {
          templateId,
        },
      });

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.result.message).toContain('deleted');

      // Verify it's gone
      const getResult = await server.executeTool({
        name: 'get_workflow_template',
        arguments: {
          templateId,
        },
      });

      expect(getResult.success).toBe(false);
    });

    it('should return error for non-existent template', async () => {
      const result = await server.executeTool({
        name: 'delete_workflow_template',
        arguments: {
          templateId: 'non-existent',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('executeTool - instantiate_template', () => {
    it('should instantiate a template with variable values', async () => {
      // Create a template with variables
      const createResult = await server.executeTool({
        name: 'create_workflow_template',
        arguments: {
          tenantId: 'test-tenant',
          name: 'Test Template',
          description: 'Test',
          category: 'general',
          dsl: {
            nodes: [
              {
                id: 'node1',
                config: {
                  threshold: '{{threshold}}',
                  recipient: '{{email}}',
                },
              },
            ],
          },
          variables: [
            {
              name: 'threshold',
              type: 'number',
              description: 'Threshold value',
              defaultValue: 100,
            },
            {
              name: 'email',
              type: 'string',
              description: 'Email address',
              required: true,
            },
          ],
        },
      });

      const templateId = createResult.result.templateId;

      // Instantiate it
      const instantiateResult = await server.executeTool({
        name: 'instantiate_template',
        arguments: {
          templateId,
          name: 'My Claims Workflow',
          variableValues: {
            threshold: 5000,
            email: 'claims@acme.com',
          },
        },
      });

      expect(instantiateResult.success).toBe(true);
      expect(instantiateResult.result.workflowId).toBeDefined();
      expect(instantiateResult.result.workflow.name).toBe('My Claims Workflow');
      expect(instantiateResult.result.workflow.dsl.nodes[0].config.threshold).toBe(5000);
      expect(instantiateResult.result.workflow.dsl.nodes[0].config.recipient).toBe(
        'claims@acme.com',
      );
    });

    it('should use default values for missing variables', async () => {
      const createResult = await server.executeTool({
        name: 'create_workflow_template',
        arguments: {
          tenantId: 'test-tenant',
          name: 'Test Template',
          description: 'Test',
          category: 'general',
          dsl: {
            nodes: [{ id: 'node1', config: { value: '{{varWithDefault}}' } }],
          },
          variables: [
            {
              name: 'varWithDefault',
              type: 'number',
              description: 'Test',
              defaultValue: 999,
            },
          ],
        },
      });

      const templateId = createResult.result.templateId;

      const instantiateResult = await server.executeTool({
        name: 'instantiate_template',
        arguments: {
          templateId,
          name: 'Test Workflow',
          variableValues: {},
        },
      });

      expect(instantiateResult.success).toBe(true);
      expect(instantiateResult.result.workflow.dsl.nodes[0].config.value).toBe(999);
    });

    it('should validate required variables', async () => {
      const createResult = await server.executeTool({
        name: 'create_workflow_template',
        arguments: {
          tenantId: 'test-tenant',
          name: 'Test Template',
          description: 'Test',
          category: 'general',
          dsl: {},
          variables: [
            {
              name: 'requiredVar',
              type: 'string',
              description: 'Required',
              required: true,
            },
          ],
        },
      });

      const templateId = createResult.result.templateId;

      const instantiateResult = await server.executeTool({
        name: 'instantiate_template',
        arguments: {
          templateId,
          name: 'Test',
          variableValues: {},
        },
      });

      expect(instantiateResult.success).toBe(false);
      expect(instantiateResult.error).toContain('required');
    });
  });

  describe('executeTool - clone_marketplace_bot', () => {
    it('should clone a marketplace bot for tenant', async () => {
      const result = await server.executeTool({
        name: 'clone_marketplace_bot',
        arguments: {
          tenantId: 'test-tenant',
          botId: 'fnol-bot-v1',
          customizations: {
            name: 'ACME FNOL Bot',
            variables: {
              claimThreshold: 10000,
              apiEndpoint: 'https://acme-api.example.com',
            },
            branding: {
              logoUrl: 'https://acme.com/logo.png',
              primaryColor: '#35D399',
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.templateId).toBeDefined();
      expect(result.result.template.name).toBe('ACME FNOL Bot');
      expect(result.result.template.tenantId).toBe('test-tenant');
      expect(result.result.template.sourceBot).toBe('fnol-bot-v1');
    });

    it('should preserve original bot metadata', async () => {
      const result = await server.executeTool({
        name: 'clone_marketplace_bot',
        arguments: {
          tenantId: 'test-tenant',
          botId: 'fnol-bot-v1',
          customizations: {
            name: 'Custom FNOL',
          },
        },
      });

      expect(result.result.template.metadata).toBeDefined();
      expect(result.result.template.metadata.sourceBot).toBe('fnol-bot-v1');
      expect(result.result.template.metadata.clonedAt).toBeDefined();
    });
  });

  describe('readResource', () => {
    it('should read tenant templates resource', async () => {
      const resource = await server.readResource('workflow://tenant/test-tenant/templates');

      expect(resource.uri).toBe('workflow://tenant/test-tenant/templates');
      expect(resource.mimeType).toBe('application/json');

      const content = JSON.parse(resource.content);
      expect(content.templates).toBeDefined();
      expect(Array.isArray(content.templates)).toBe(true);
    });

    it('should read specific template resource', async () => {
      // Create a template
      const createResult = await server.executeTool({
        name: 'create_workflow_template',
        arguments: {
          tenantId: 'test-tenant',
          name: 'Test',
          description: 'Test',
          category: 'general',
          dsl: {},
        },
      });

      const templateId = createResult.result.templateId;

      // Read it as a resource
      const resource = await server.readResource(`workflow://templates/${templateId}`);

      const content = JSON.parse(resource.content);
      expect(content.template).toBeDefined();
      expect(content.template.id).toBe(templateId);
    });

    it('should read template categories resource', async () => {
      const resource = await server.readResource('workflow://categories');

      const content = JSON.parse(resource.content);
      expect(content.categories).toBeDefined();
      expect(Array.isArray(content.categories)).toBe(true);
      expect(content.categories.length).toBeGreaterThan(0);
    });

    it('should throw error for invalid URI', async () => {
      await expect(server.readResource('invalid://uri')).rejects.toThrow('Unknown resource URI');
    });
  });

  describe('Template Variables', () => {
    it('should support number variables', async () => {
      const result = await server.executeTool({
        name: 'create_workflow_template',
        arguments: {
          tenantId: 'test-tenant',
          name: 'Test',
          description: 'Test',
          category: 'general',
          dsl: {},
          variables: [
            {
              name: 'count',
              type: 'number',
              description: 'Count',
              defaultValue: 10,
            },
          ],
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.template.variables[0].type).toBe('number');
    });

    it('should support string variables', async () => {
      const result = await server.executeTool({
        name: 'create_workflow_template',
        arguments: {
          tenantId: 'test-tenant',
          name: 'Test',
          description: 'Test',
          category: 'general',
          dsl: {},
          variables: [
            {
              name: 'message',
              type: 'string',
              description: 'Message',
              defaultValue: 'Hello',
            },
          ],
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.template.variables[0].type).toBe('string');
    });

    it('should support boolean variables', async () => {
      const result = await server.executeTool({
        name: 'create_workflow_template',
        arguments: {
          tenantId: 'test-tenant',
          name: 'Test',
          description: 'Test',
          category: 'general',
          dsl: {},
          variables: [
            {
              name: 'enabled',
              type: 'boolean',
              description: 'Enabled',
              defaultValue: true,
            },
          ],
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.template.variables[0].type).toBe('boolean');
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

    it('should handle exceptions gracefully', async () => {
      const result = await server.executeTool({
        name: 'get_workflow_template',
        arguments: {
          // Missing required templateId
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
