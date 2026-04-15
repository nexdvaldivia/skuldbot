import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import { TwilioSmsProvider } from './twilio-sms.provider';

const mockMessageCreate = jest.fn();
const mockAccountFetch = jest.fn();

jest.mock('twilio', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    messages: {
      create: mockMessageCreate,
    },
    api: {
      accounts: () => ({
        fetch: mockAccountFetch,
      }),
    },
  })),
}));

describe('TwilioSmsProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is not configured when required credentials are missing', () => {
    const configService = buildConfigService({});
    const provider = new TwilioSmsProvider(configService as unknown as ConfigService);

    expect(provider.isConfigured()).toBe(false);
  });

  it('sends an SMS using configured from number', async () => {
    mockMessageCreate.mockResolvedValueOnce({ sid: 'SM123' });

    const configService = buildConfigService({
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_FROM_NUMBER: '+12025550000',
    });

    const provider = new TwilioSmsProvider(configService as unknown as ConfigService);

    const result = await provider.send({
      to: '+12025550123',
      body: 'hello',
      tenantId: 'tenant-1',
    });

    expect(result).toEqual({
      messageId: 'SM123',
      success: true,
      provider: 'twilio',
    });
    expect(mockMessageCreate).toHaveBeenCalledWith({
      to: '+12025550123',
      body: 'hello',
      from: '+12025550000',
    });
  });

  it('passes health check when Twilio account is reachable', async () => {
    mockAccountFetch.mockResolvedValueOnce({ sid: 'AC123' });

    const configService = buildConfigService({
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_MESSAGING_SERVICE_SID: 'MG123',
    });

    const provider = new TwilioSmsProvider(configService as unknown as ConfigService);
    const healthy = await provider.healthCheck();

    expect(healthy).toBe(true);
    expect(twilio).toHaveBeenCalledWith('AC123', 'token');
  });
});

function buildConfigService(values: Record<string, string>) {
  return {
    get: (key: string, defaultValue?: string) =>
      Object.prototype.hasOwnProperty.call(values, key) ? values[key] : defaultValue,
  };
}
