import { Test, TestingModule } from '@nestjs/testing';
import { LicensingServer } from './licensing.server';

describe('LicensingServer', () => {
  let server: LicensingServer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LicensingServer],
    }).compile();

    server = module.get<LicensingServer>(LicensingServer);
  });

  describe('getTools', () => {
    it('should return all licensing tools', () => {
      const tools = server.getTools();
      
      expect(tools).toHaveLength(6);
      expect(tools.map(t => t.name)).toContain('validate_license_feature');
      expect(tools.map(t => t.name)).toContain('check_entitlement');
      expect(tools.map(t => t.name)).toContain('get_license_expiry');
    });

    it('should have correct tool schemas', () => {
      const tools = server.getTools();
      const validateFeature = tools.find(t => t.name === 'validate_license_feature');
      
      expect(validateFeature).toBeDefined();
      expect(validateFeature.inputSchema.required).toContain('tenantId');
      expect(validateFeature.inputSchema.required).toContain('feature');
      expect(validateFeature.requiresApproval).toBe(false);
    });
  });

  describe('getResources', () => {
    it('should return all licensing resources', () => {
      const resources = server.getResources();
      
      expect(resources).toHaveLength(4);
      expect(resources.map(r => r.uri)).toContain('licenses://tenant/{tenantId}/current');
      expect(resources.map(r => r.uri)).toContain('licenses://tenant/{tenantId}/features');
    });
  });

  describe('executeTool - validate_license_feature', () => {
    it('should allow access to enabled feature', async () => {
      const result = await server.executeTool({
        name: 'validate_license_feature',
        arguments: {
          tenantId: 'test-tenant',
          feature: 'ai_planner_v2',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.allowed).toBe(true);
      expect(result.result.feature).toBe('ai_planner_v2');
    });

    it('should deny access to disabled feature', async () => {
      const result = await server.executeTool({
        name: 'validate_license_feature',
        arguments: {
          tenantId: 'test-tenant',
          feature: 'advanced_analytics',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.allowed).toBe(false);
      expect(result.result.reason).toContain('not available');
      expect(result.result.upgradeUrl).toBeDefined();
    });

    it('should validate license expiry', async () => {
      const result = await server.executeTool({
        name: 'validate_license_feature',
        arguments: {
          tenantId: 'test-tenant',
          feature: 'studio_editor',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.expiresAt).toBeDefined();
    });
  });

  describe('executeTool - check_entitlement', () => {
    it('should allow resource within limits', async () => {
      const result = await server.executeTool({
        name: 'check_entitlement',
        arguments: {
          tenantId: 'test-tenant',
          resourceType: 'runners',
          requestedCount: 5,
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.allowed).toBe(true);
      expect(result.result.limit).toBe(10);
      expect(result.result.current).toBe(5);
    });

    it('should deny resource over limits', async () => {
      const result = await server.executeTool({
        name: 'check_entitlement',
        arguments: {
          tenantId: 'test-tenant',
          resourceType: 'runners',
          requestedCount: 15,
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.allowed).toBe(false);
      expect(result.result.reason).toContain('limit');
    });

    it('should handle unlimited entitlement', async () => {
      const result = await server.executeTool({
        name: 'check_entitlement',
        arguments: {
          tenantId: 'enterprise-tenant',
          resourceType: 'api_calls',
          requestedCount: 1000000,
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.allowed).toBe(true);
      expect(result.result.limit).toBe(-1); // Unlimited
    });
  });

  describe('executeTool - get_license_expiry', () => {
    it('should return license expiry info', async () => {
      const result = await server.executeTool({
        name: 'get_license_expiry',
        arguments: {
          tenantId: 'test-tenant',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.expiresAt).toBeDefined();
      expect(result.result.daysRemaining).toBeGreaterThan(0);
      expect(result.result.isExpired).toBe(false);
    });

    it('should warn when license is expiring soon', async () => {
      const result = await server.executeTool({
        name: 'get_license_expiry',
        arguments: {
          tenantId: 'expiring-tenant',
        },
      });

      expect(result.success).toBe(true);
      if (result.result.daysRemaining < 30) {
        expect(result.result.warning).toBeDefined();
      }
    });
  });

  describe('executeTool - check_available_seats', () => {
    it('should return available seats', async () => {
      const result = await server.executeTool({
        name: 'check_available_seats',
        arguments: {
          tenantId: 'test-tenant',
        },
      });

      expect(result.success).toBe(true);
      expect(result.result.total).toBeDefined();
      expect(result.result.used).toBeDefined();
      expect(result.result.available).toBe(result.result.total - result.result.used);
    });

    it('should indicate when no seats are available', async () => {
      const result = await server.executeTool({
        name: 'check_available_seats',
        arguments: {
          tenantId: 'full-tenant',
        },
      });

      expect(result.success).toBe(true);
      if (result.result.available === 0) {
        expect(result.result.canAddUser).toBe(false);
      }
    });
  });

  describe('readResource', () => {
    it('should read current license', async () => {
      const resource = await server.readResource('licenses://tenant/test-tenant/current');

      expect(resource.uri).toBe('licenses://tenant/test-tenant/current');
      expect(resource.mimeType).toBe('application/json');
      
      const content = JSON.parse(resource.content);
      expect(content.tenantId).toBe('test-tenant');
      expect(content.sku).toBeDefined();
      expect(content.features).toBeDefined();
    });

    it('should read enabled features', async () => {
      const resource = await server.readResource('licenses://tenant/test-tenant/features');

      const content = JSON.parse(resource.content);
      expect(Array.isArray(content)).toBe(true);
      expect(content.length).toBeGreaterThan(0);
    });

    it('should throw error for invalid URI', async () => {
      await expect(
        server.readResource('invalid://uri')
      ).rejects.toThrow('Unknown resource URI');
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
        name: 'validate_license_feature',
        arguments: {
          tenantId: 'test-tenant',
          // Missing 'feature'
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

