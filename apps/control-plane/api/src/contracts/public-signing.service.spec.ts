import { BadRequestException } from '@nestjs/common';
import { PublicSigningService } from './public-signing.service';
import {
  ContractEnvelopeRecipientStatus,
  ContractEnvelopeStatus,
} from './entities/contract-domain.enums';

function createRepositoryMock() {
  return {
    findOne: jest.fn(),
    save: jest.fn(async (value) => value),
    createQueryBuilder: jest.fn(),
  };
}

function createService() {
  const envelopeRecipientRepository = createRepositoryMock();
  const envelopeRepository = createRepositoryMock();
  const acceptanceRepository = createRepositoryMock();
  const envelopeEventRepository = createRepositoryMock();
  const clientRepository = createRepositoryMock();

  const contractSigningService = {
    resendEnvelope: jest.fn(),
    verifyEnvelopeRecipientOtp: jest.fn(),
    signEnvelopeRecipient: jest.fn(),
    declineEnvelopeRecipient: jest.fn(),
  };

  const providerFactory = {
    executeWithFallback: jest.fn(),
  };

  const pdfService = {
    downloadContractPdf: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'STORAGE_PROVIDER_CHAIN') return 's3,azure-blob';
      if (key === 'STORAGE_PROVIDER') return 's3';
      if (key === 'SMS_PROVIDER_CHAIN') return 'noop-sms';
      if (key === 'SMS_PROVIDER') return 'noop-sms';
      if (key === 'CONTRACT_SIGNING_OTP_SECRET') return 'secret-pepper';
      if (key === 'CONTRACT_SIGNING_OTP_EXPIRY_MINUTES') return '15';
      return undefined;
    }),
  };

  const service = new PublicSigningService(
    envelopeRecipientRepository as unknown as never,
    envelopeRepository as unknown as never,
    acceptanceRepository as unknown as never,
    envelopeEventRepository as unknown as never,
    clientRepository as unknown as never,
    contractSigningService as unknown as never,
    providerFactory as unknown as never,
    pdfService as unknown as never,
    configService as unknown as never,
  );

  return {
    service,
    mocks: {
      envelopeRecipientRepository,
      envelopeRepository,
      acceptanceRepository,
      envelopeEventRepository,
      clientRepository,
      contractSigningService,
      providerFactory,
      pdfService,
    },
  };
}

function mockTokenLookup(
  envelopeRecipientRepository: ReturnType<typeof createRepositoryMock>,
  recipient: Record<string, unknown>,
) {
  const builder = {
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(recipient),
  };
  envelopeRecipientRepository.createQueryBuilder.mockReturnValue(builder);
}

describe('PublicSigningService', () => {
  it('returns signing page payload from public token context', async () => {
    const { service, mocks } = createService();
    const recipient = {
      id: 'rec-1',
      envelopeId: 'env-1',
      email: 'john@example.com',
      fullName: 'John Doe',
      roleLabel: 'Signer',
      sortOrder: 0,
      status: ContractEnvelopeRecipientStatus.SENT,
      otpVerifiedAt: null,
      metadata: { publicSigningToken: 'token-1' },
    };
    mockTokenLookup(mocks.envelopeRecipientRepository, recipient);
    mocks.envelopeRepository.findOne.mockResolvedValue({
      id: 'env-1',
      clientId: 'client-1',
      tenantId: null,
      subject: 'MSA',
      status: ContractEnvelopeStatus.SENT,
      expiresAt: null,
      sentAt: new Date(),
      metadata: {},
      recipients: [
        recipient,
        {
          ...recipient,
          id: 'rec-2',
          email: 'jane@example.com',
          fullName: 'Jane Doe',
          sortOrder: 1,
        },
      ],
      documents: [
        {
          id: 'doc-1',
          name: 'Contract',
          contentType: 'application/pdf',
          sortOrder: 0,
        },
      ],
      contract: null,
    });
    mocks.clientRepository.findOne.mockResolvedValue({
      id: 'client-1',
      name: 'ACME',
      metadata: {},
    });

    const response = await service.getSigningPage('token-1');
    expect(response.envelopeId).toBe('env-1');
    expect(response.recipient.email).toBe('john@example.com');
    expect(response.otherRecipients[0].email).toContain('***');
    expect(response.documents).toHaveLength(1);
  });

  it('resends email otp through contract signing service', async () => {
    const { service, mocks } = createService();
    const recipient = {
      id: 'rec-1',
      envelopeId: 'env-1',
      email: 'john@example.com',
      fullName: 'John Doe',
      roleLabel: 'Signer',
      sortOrder: 0,
      status: ContractEnvelopeRecipientStatus.SENT,
      otpVerifiedAt: null,
      metadata: { publicSigningToken: 'token-1' },
    };
    mockTokenLookup(mocks.envelopeRecipientRepository, recipient);
    mocks.envelopeRepository.findOne.mockResolvedValue({
      id: 'env-1',
      clientId: 'client-1',
      tenantId: null,
      status: ContractEnvelopeStatus.SENT,
      recipients: [recipient],
      documents: [],
      metadata: {},
      contract: null,
    });
    mocks.envelopeRecipientRepository.findOne.mockResolvedValue(recipient);

    const response = await service.requestEmailOtp('token-1', '127.0.0.1', 'agent');
    expect(response.success).toBe(true);
    expect(mocks.contractSigningService.resendEnvelope).toHaveBeenCalledWith(
      'env-1',
      { recipientId: 'rec-1' },
      expect.objectContaining({ clientId: 'client-1' }),
    );
  });

  it('applies OTP request rate limit per recipient', async () => {
    const { service, mocks } = createService();
    const recipient = {
      id: 'rec-1',
      envelopeId: 'env-1',
      email: 'john@example.com',
      fullName: 'John Doe',
      roleLabel: 'Signer',
      sortOrder: 0,
      status: ContractEnvelopeRecipientStatus.SENT,
      otpVerifiedAt: null,
      metadata: {
        publicSigningToken: 'token-1',
        publicOtpRateLimit: {
          windowStartedAt: new Date().toISOString(),
          count: 5,
          lastRequestedAt: new Date().toISOString(),
        },
      },
    };
    mockTokenLookup(mocks.envelopeRecipientRepository, recipient);
    mocks.envelopeRepository.findOne.mockResolvedValue({
      id: 'env-1',
      clientId: 'client-1',
      tenantId: null,
      status: ContractEnvelopeStatus.SENT,
      recipients: [recipient],
      documents: [],
      metadata: {},
      contract: null,
    });

    await expect(service.requestEmailOtp('token-1', '127.0.0.1', 'agent')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CONTRACT_PUBLIC_OTP_RATE_LIMITED',
      }),
    });
  });

  it('rejects invalid sms otp code', async () => {
    const { service, mocks } = createService();
    const recipient = {
      id: 'rec-1',
      envelopeId: 'env-1',
      email: 'john@example.com',
      fullName: 'John Doe',
      roleLabel: 'Signer',
      sortOrder: 0,
      status: ContractEnvelopeRecipientStatus.SENT,
      otpVerifiedAt: new Date(),
      metadata: {
        publicSigningToken: 'token-1',
        publicSmsOtp: {
          phone: '+14155551234',
          codeHash: 'different-hash',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          attempts: 0,
          verifiedAt: null,
        },
      },
    };
    mockTokenLookup(mocks.envelopeRecipientRepository, recipient);
    mocks.envelopeRepository.findOne.mockResolvedValue({
      id: 'env-1',
      clientId: 'client-1',
      tenantId: null,
      status: ContractEnvelopeStatus.SENT,
      recipients: [recipient],
      documents: [],
      metadata: { requireSmsOtp: true },
      contract: null,
    });

    await expect(
      service.verifySmsOtp('token-1', { code: '123456' }, '127.0.0.1', 'agent'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('locks sms otp after max attempts and blocks future verification', async () => {
    const { service, mocks } = createService();
    const recipient = {
      id: 'rec-1',
      envelopeId: 'env-1',
      email: 'john@example.com',
      fullName: 'John Doe',
      roleLabel: 'Signer',
      sortOrder: 0,
      status: ContractEnvelopeRecipientStatus.SENT,
      otpVerifiedAt: new Date(),
      metadata: {
        publicSigningToken: 'token-1',
        publicSmsOtp: {
          phone: '+14155551234',
          codeHash: 'different-hash',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          attempts: 4,
          verifiedAt: null,
        },
      },
    };
    mockTokenLookup(mocks.envelopeRecipientRepository, recipient);
    mocks.envelopeRepository.findOne.mockResolvedValue({
      id: 'env-1',
      clientId: 'client-1',
      tenantId: null,
      status: ContractEnvelopeStatus.SENT,
      recipients: [recipient],
      documents: [],
      metadata: { requireSmsOtp: true },
      contract: null,
    });

    await expect(
      service.verifySmsOtp('token-1', { code: '123456' }, '127.0.0.1', 'agent'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CONTRACT_PUBLIC_OTP_LOCKED',
      }),
    });

    await expect(
      service.verifySmsOtp('token-1', { code: '123456' }, '127.0.0.1', 'agent'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CONTRACT_PUBLIC_OTP_LOCKED',
      }),
    });
  });

  it('records public audit events for otp requests and page views', async () => {
    const { service, mocks } = createService();
    const recipient = {
      id: 'rec-1',
      envelopeId: 'env-1',
      email: 'john@example.com',
      fullName: 'John Doe',
      roleLabel: 'Signer',
      sortOrder: 0,
      status: ContractEnvelopeRecipientStatus.SENT,
      otpVerifiedAt: null,
      metadata: { publicSigningToken: 'token-1' },
    };
    mockTokenLookup(mocks.envelopeRecipientRepository, recipient);
    mocks.envelopeRepository.findOne.mockResolvedValue({
      id: 'env-1',
      clientId: 'client-1',
      tenantId: null,
      status: ContractEnvelopeStatus.SENT,
      recipients: [recipient],
      documents: [],
      metadata: {},
      contract: null,
    });
    mocks.envelopeRecipientRepository.findOne.mockResolvedValue(recipient);

    await service.markViewed('token-1', '127.0.0.1', 'agent');
    await service.requestEmailOtp('token-1', '127.0.0.1', 'agent');

    expect(mocks.envelopeEventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'public.page_viewed',
      }),
    );
    expect(mocks.envelopeEventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'public.otp_requested',
      }),
    );
  });
});
