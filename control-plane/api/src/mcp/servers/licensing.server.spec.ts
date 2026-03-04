import { LicensingServer } from './licensing.server';

describe('LicensingServer', () => {
  let server: LicensingServer;

  const licensesService = {
    getTenantStatus: jest.fn(),
    getLicenseTemplate: jest.fn(),
  };
  const usersService = {
    findOne: jest.fn(),
  };
  const tenantsService = {
    findAll: jest.fn(),
  };
  const marketplaceService = {
    getBotById: jest.fn(),
  };
  const lookupsService = {
    listValuesByDomainCode: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    server = new LicensingServer(
      licensesService as never,
      usersService as never,
      tenantsService as never,
      marketplaceService as never,
      lookupsService as never,
    );
  });

  it('exposes licensing tools expected by MCP clients', () => {
    const tools = server.getTools();
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'validate_orchestrator_license',
        'validate_studio_license',
        'check_bot_access',
        'get_license_limits',
        'check_feature_access',
      ]),
    );
  });

  it('resolves check_feature_access from tenant license features', async () => {
    licensesService.getTenantStatus.mockResolvedValue({
      tenantId: 'tenant-1',
      hasLicense: true,
      licenseId: 'lic-1',
      type: 'professional',
      status: 'active',
      isActive: true,
      validFrom: new Date('2026-01-01T00:00:00Z'),
      validUntil: new Date('2026-12-31T23:59:59Z'),
      daysRemaining: 300,
      quotaState: 'normal',
      features: {
        customNodes: true,
        aiAssistant: true,
      },
    });

    const result = await server.executeTool({
      name: 'check_feature_access',
      arguments: {
        tenantId: 'tenant-1',
        feature: 'custom_nodes',
      },
    });

    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({
      hasAccess: true,
      allowed: true,
      feature: 'custom_nodes',
      currentTier: 'professional',
    });
  });

  it('resolves validate_studio_license by user -> client -> tenant mapping', async () => {
    usersService.findOne.mockResolvedValue({
      id: 'user-1',
      clientId: 'client-1',
    });
    tenantsService.findAll.mockResolvedValue([
      {
        id: 'tenant-1',
        status: 'active',
      },
    ]);
    licensesService.getTenantStatus.mockResolvedValue({
      tenantId: 'tenant-1',
      hasLicense: true,
      licenseId: 'lic-1',
      type: 'enterprise',
      status: 'active',
      isActive: true,
      validFrom: new Date('2026-01-01T00:00:00Z'),
      validUntil: new Date('2026-12-31T23:59:59Z'),
      daysRemaining: 300,
      quotaState: 'normal',
      features: {
        apiAccess: true,
      },
    });

    const result = await server.executeTool({
      name: 'validate_studio_license',
      arguments: {
        userId: 'user-1',
        studioId: 'studio-1',
      },
    });

    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({
      valid: true,
      userId: 'user-1',
      studioId: 'studio-1',
      tenantId: 'tenant-1',
      tier: 'enterprise',
    });
  });

  it('returns license limits mapped from features', async () => {
    licensesService.getTenantStatus.mockResolvedValue({
      tenantId: 'tenant-1',
      hasLicense: true,
      licenseId: 'lic-1',
      type: 'professional',
      status: 'active',
      isActive: true,
      validFrom: new Date('2026-01-01T00:00:00Z'),
      validUntil: new Date('2026-12-31T23:59:59Z'),
      daysRemaining: 300,
      quotaState: 'normal',
      features: {
        maxBots: 100,
        maxRunsPerMonth: 10000,
        maxRunners: 8,
        aiAssistant: true,
      },
    });

    const result = await server.executeTool({
      name: 'get_license_limits',
      arguments: {
        tenantId: 'tenant-1',
      },
    });

    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({
      maxNodes: 100,
      maxWorkflows: 100,
      maxExecutionsPerMonth: 10000,
      maxRunners: 8,
      allowAIPlanner: true,
    });
  });

  it('builds licenses://features resource from lookup + templates', async () => {
    lookupsService.listValuesByDomainCode.mockResolvedValue([
      { code: 'professional', isActive: true },
      { code: 'enterprise', isActive: true },
    ]);
    licensesService.getLicenseTemplate.mockImplementation(async (licenseType: string) => {
      if (licenseType === 'professional') {
        return {
          licenseType,
          features: {
            aiAssistant: true,
            customNodes: false,
          },
        };
      }
      return {
        licenseType,
        features: {
          aiAssistant: true,
          customNodes: true,
          apiAccess: true,
        },
      };
    });

    const resource = await server.readResource('licenses://features');
    const payload = JSON.parse(resource.content);

    expect(resource.uri).toBe('licenses://features');
    expect(resource.mimeType).toBe('application/json');
    expect(payload.professional).toEqual(expect.arrayContaining(['aiAssistant']));
    expect(payload.enterprise).toEqual(
      expect.arrayContaining(['aiAssistant', 'customNodes', 'apiAccess']),
    );
  });

  it('returns unknown tool error for unsupported tool names', async () => {
    const result = await server.executeTool({
      name: 'unknown_tool',
      arguments: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });

  it('throws for invalid resource URI', async () => {
    await expect(server.readResource('invalid://uri')).rejects.toThrow(
      'Invalid URI format',
    );
  });
});
