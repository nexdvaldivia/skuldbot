import { Repository } from 'typeorm';
import { IntegrationProvider, IntegrationType } from '../common/interfaces/integration.interface';
import { ProviderConfig } from './entities/provider-config.entity';
import { ProviderFactoryService } from './provider-factory.service';
import { ProviderRegistry } from './provider-registry.service';

function buildProvider(
  name: string,
  type: IntegrationType,
  configured = true,
): IntegrationProvider {
  return {
    name,
    type,
    isConfigured: () => configured,
    healthCheck: async () => true,
  };
}

describe('ProviderFactoryService', () => {
  let service: ProviderFactoryService;
  let providerConfigRepository: Pick<Repository<ProviderConfig>, 'find'> & {
    find: jest.Mock;
  };
  let providerRegistry: Pick<ProviderRegistry, 'getAllByType'> & {
    getAllByType: jest.Mock;
  };

  beforeEach(() => {
    providerConfigRepository = {
      find: jest.fn(),
    };

    providerRegistry = {
      getAllByType: jest.fn(),
    };

    service = new ProviderFactoryService(
      providerConfigRepository as unknown as Repository<ProviderConfig>,
      providerRegistry as unknown as ProviderRegistry,
    );
  });

  it('prioritizes tenant active providers, then global providers', async () => {
    providerConfigRepository.find
      .mockResolvedValueOnce([{ name: 'azure-blob', isPrimary: true }])
      .mockResolvedValueOnce([{ name: 's3', isPrimary: true }]);

    const s3 = buildProvider('s3', IntegrationType.STORAGE);
    const azureBlob = buildProvider('azure-blob', IntegrationType.STORAGE);
    providerRegistry.getAllByType.mockReturnValue([s3, azureBlob]);

    const chain = await service.resolveChain(IntegrationType.STORAGE, {
      tenantId: 'tenant-123',
    });

    expect(chain.map((provider) => provider.name)).toEqual(['azure-blob', 's3']);
  });

  it('filters out unconfigured providers by default', async () => {
    providerConfigRepository.find.mockResolvedValue([]);

    const unavailable = buildProvider('azure-blob', IntegrationType.STORAGE, false);
    const configured = buildProvider('s3', IntegrationType.STORAGE, true);
    providerRegistry.getAllByType.mockReturnValue([unavailable, configured]);

    const chain = await service.resolveChain(IntegrationType.STORAGE);

    expect(chain.map((provider) => provider.name)).toEqual(['s3']);
  });

  it('executes fallback chain when primary provider fails', async () => {
    providerConfigRepository.find.mockResolvedValue([]);

    const primary = buildProvider('sendgrid', IntegrationType.EMAIL, true);
    const fallback = buildProvider('smtp', IntegrationType.EMAIL, true);
    providerRegistry.getAllByType.mockReturnValue([primary, fallback]);

    const result = await service.executeWithFallback(
      IntegrationType.EMAIL,
      'send',
      async (provider) => {
        if (provider.name === 'sendgrid') {
          throw new Error('provider_down');
        }
        return 'ok';
      },
    );

    expect(result.provider).toBe('smtp');
    expect(result.result).toBe('ok');
    expect(result.attemptedProviders).toEqual(['sendgrid', 'smtp']);
  });

  it('respects preferred provider before tenant/global config chain', async () => {
    providerConfigRepository.find
      .mockResolvedValueOnce([{ name: 'twilio', isPrimary: true }])
      .mockResolvedValueOnce([{ name: 'noop-sms', isPrimary: true }]);

    const twilio = buildProvider('twilio', IntegrationType.SMS, true);
    const noop = buildProvider('noop-sms', IntegrationType.SMS, true);
    providerRegistry.getAllByType.mockReturnValue([twilio, noop]);

    const chain = await service.resolveChain(IntegrationType.SMS, {
      tenantId: 'tenant-123',
      preferredProvider: 'noop-sms',
    });

    expect(chain.map((provider) => provider.name)).toEqual(['noop-sms', 'twilio']);
  });
});
