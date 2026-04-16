import { ContractSigningService } from './contract-signing.service';
import {
  ContractEnvelopeRecipientStatus,
  ContractSignatureType,
} from './entities/contract-domain.enums';
import { ContractSignerStatus } from './entities/contract-signer.entity';

function createRepositoryMock() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(async (value) => value),
    create: jest.fn((value) => value),
    exist: jest.fn(async () => true),
    createQueryBuilder: jest.fn(),
  };
}

function createService() {
  const contractRepository = createRepositoryMock();
  const signerRepository = createRepositoryMock();
  const contractEventRepository = createRepositoryMock();
  const envelopeRepository = createRepositoryMock();
  const envelopeRecipientRepository = createRepositoryMock();
  const envelopeEventRepository = createRepositoryMock();
  const acceptanceRepository = createRepositoryMock();
  const clientRepository = createRepositoryMock();
  const tenantRepository = createRepositoryMock();

  const templateService = {
    getPublishedTemplateVersion: jest.fn(),
  };

  const contractLegalService = {
    buildLegalVariableContext: jest.fn(async () => ({})),
  };

  const providerFactory = {
    executeWithFallback: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'CONTRACT_SIGNING_OTP_SECRET') {
        return 'signing-otp-pepper';
      }
      if (key === 'EMAIL_PROVIDER_CHAIN') {
        return 'sendgrid,smtp';
      }
      if (key === 'EMAIL_PROVIDER') {
        return 'sendgrid';
      }
      return undefined;
    }),
  };

  const service = new ContractSigningService(
    contractRepository as any,
    signerRepository as any,
    contractEventRepository as any,
    envelopeRepository as any,
    envelopeRecipientRepository as any,
    envelopeEventRepository as any,
    acceptanceRepository as any,
    clientRepository as any,
    tenantRepository as any,
    templateService as any,
    contractLegalService as any,
    providerFactory as any,
    configService as any,
  );

  return {
    service,
    mocks: {
      contractRepository,
      signerRepository,
      envelopeRecipientRepository,
    },
  };
}

describe('ContractSigningService blockers', () => {
  const currentUser = { id: 'user-1', clientId: 'client-1', isSkuld: () => true } as any;

  it('locks OTP verification after max failed attempts', async () => {
    const { service, mocks } = createService();

    const recipient = {
      id: 'recipient-1',
      email: 'signer@example.com',
      otpCodeHash: (service as any).hashOtpCode('000000', 'signer@example.com'),
      otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      otpAttempts: 4,
      status: ContractEnvelopeRecipientStatus.SENT,
      metadata: {},
    } as any;

    jest
      .spyOn(service as any, 'requireEnvelopeRecipientContext')
      .mockResolvedValue({ envelope: { id: 'env-1' }, recipient });
    jest.spyOn(service as any, 'recordEnvelopeEvent').mockResolvedValue(undefined);

    await expect(
      service.verifyEnvelopeRecipientOtp('env-1', 'recipient-1', { code: '111111' }, currentUser),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CONTRACT_OTP_LOCKED' }),
    });

    expect(mocks.envelopeRecipientRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'recipient-1',
        otpAttempts: 5,
      }),
    );
  });

  it('stores signed content hash in recipient/signer audit and event payload', async () => {
    const { service, mocks } = createService();

    const recipient = {
      id: 'recipient-1',
      signerId: 'signer-1',
      email: 'signer@example.com',
      status: ContractEnvelopeRecipientStatus.OTP_VERIFIED,
      otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      otpVerifiedAt: new Date(),
      metadata: {},
      ipAddress: null,
      userAgent: null,
    } as any;

    const envelope = {
      id: 'env-1',
      contractId: 'contract-1',
      templateId: 'template-1',
      templateVersionId: 'tv-1',
    } as any;

    mocks.contractRepository.findOne.mockResolvedValue({
      id: 'contract-1',
      templateKey: 'msa.v1',
      version: 1,
      renderedHtml: '<p>contract</p>',
      documentJson: { type: 'doc', content: [] },
      variables: { client_name: 'ACME' },
    });

    mocks.signerRepository.findOne.mockResolvedValue({
      id: 'signer-1',
      status: ContractSignerStatus.SENT,
      signatureAudit: {},
    });

    jest
      .spyOn(service as any, 'requireEnvelopeRecipientContext')
      .mockResolvedValue({ envelope, recipient });
    const recordEventSpy = jest
      .spyOn(service as any, 'recordEnvelopeEvent')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'recalculateEnvelopeAndContractStatus')
      .mockResolvedValue({ id: 'env-1' });

    await service.signEnvelopeRecipient(
      'env-1',
      'recipient-1',
      {
        signatureType: ContractSignatureType.TYPED,
        signatureValue: 'John Doe',
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      },
      currentUser,
    );

    const savedRecipient = mocks.envelopeRecipientRepository.save.mock.calls[0][0];
    expect(savedRecipient.metadata.signedContentHash).toMatch(/^[a-f0-9]{64}$/);

    const savedSigner = mocks.signerRepository.save.mock.calls[0][0];
    expect(savedSigner.signatureAudit.contentHash).toMatch(/^[a-f0-9]{64}$/);

    const signedEventPayload = recordEventSpy.mock.calls.find(
      (call) => call[2] === 'recipient.signed',
    )?.[4] as Record<string, unknown>;
    expect(signedEventPayload.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('captures decline IP and user-agent for legal audit trail', async () => {
    const { service, mocks } = createService();

    const recipient = {
      id: 'recipient-1',
      signerId: 'signer-1',
      status: ContractEnvelopeRecipientStatus.SENT,
      metadata: {},
      ipAddress: null,
      userAgent: null,
    } as any;

    jest
      .spyOn(service as any, 'requireEnvelopeRecipientContext')
      .mockResolvedValue({ envelope: { id: 'env-1' }, recipient });
    const recordEventSpy = jest
      .spyOn(service as any, 'recordEnvelopeEvent')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'recalculateEnvelopeAndContractStatus')
      .mockResolvedValue({ id: 'env-1' });

    mocks.signerRepository.findOne.mockResolvedValue({
      id: 'signer-1',
      status: ContractSignerStatus.SENT,
      signatureAudit: {},
    });

    await service.declineEnvelopeRecipient(
      'env-1',
      'recipient-1',
      {
        reason: 'Not authorized',
        ipAddress: '203.0.113.10',
        userAgent: 'Mozilla/5.0 (X11)',
      },
      currentUser,
    );

    const savedRecipient = mocks.envelopeRecipientRepository.save.mock.calls[0][0];
    expect(savedRecipient.ipAddress).toBe('203.0.113.10');
    expect(savedRecipient.userAgent).toBe('Mozilla/5.0 (X11)');

    const savedSigner = mocks.signerRepository.save.mock.calls[0][0];
    expect(savedSigner.signatureAudit.ipAddress).toBe('203.0.113.10');
    expect(savedSigner.signatureAudit.userAgent).toBe('Mozilla/5.0 (X11)');

    const declinedEventPayload = recordEventSpy.mock.calls.find(
      (call) => call[2] === 'recipient.declined',
    )?.[4] as Record<string, unknown>;
    expect(declinedEventPayload.ipAddress).toBe('203.0.113.10');
    expect(declinedEventPayload.userAgent).toBe('Mozilla/5.0 (X11)');
  });
});
