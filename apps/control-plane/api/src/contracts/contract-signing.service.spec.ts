import { createHash } from 'crypto';
import { ContractSigningService } from './contract-signing.service';
import {
  ContractEnvelopeStatus,
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
    delete: jest.fn(),
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
  const signingDocumentRepository = createRepositoryMock();
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

  const contractSignatoryPolicyService = {
    resolvePreview: jest.fn(async () => ({
      signatoryId: 'sig-1',
      signatoryName: 'Skuld Signatory',
      signatoryTitle: 'Legal',
      signatoryEmail: 'legal@skuld.ai',
      signatureHash: 'a'.repeat(64),
      resolutionSource: 'default',
      resolvedAt: new Date(),
      ready: true,
      message: 'ok',
    })),
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
    signingDocumentRepository as any,
    acceptanceRepository as any,
    clientRepository as any,
    tenantRepository as any,
    templateService as any,
    contractLegalService as any,
    contractSignatoryPolicyService as any,
    providerFactory as any,
    configService as any,
  );

  return {
    service,
    mocks: {
      contractRepository,
      signerRepository,
      envelopeRepository,
      envelopeRecipientRepository,
      envelopeEventRepository,
      signingDocumentRepository,
      acceptanceRepository,
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

  it('creates acceptance with legal evidence hashes', async () => {
    const { service, mocks } = createService();
    const now = new Date('2026-04-17T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    mocks.contractRepository.findOne.mockResolvedValue({
      id: 'contract-1',
      clientId: 'client-1',
      tenantId: null,
      title: 'MSA Contract',
      templateKey: 'msa',
      version: 3,
      status: 'signed',
      envelopeId: 'env-1',
      renderedHtml: '<p>Rendered MSA</p>',
      documentJson: { type: 'doc', content: [] },
      variables: { client_name: 'ACME' },
      metadata: { templateId: 'tpl-1', templateVersionId: 'tv-3' },
    });
    mocks.acceptanceRepository.findOne.mockResolvedValue(null);
    mocks.acceptanceRepository.save.mockImplementation(async (value: any) => ({
      id: 'acc-1',
      createdAt: now,
      ...value,
    }));

    const response = await service.acceptContract(
      {
        contractId: 'contract-1',
        acceptedByName: 'Jane Client',
        acceptedByEmail: 'jane@example.com',
        signatureData: 'Jane Signature',
      },
      currentUser,
    );

    expect(response.id).toBe('acc-1');
    expect(response.contentSnapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(response.signatureHash).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.acceptanceRepository.save).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('countersigns acceptance using policy resolution', async () => {
    const { service, mocks } = createService();

    const acceptance = {
      id: 'acc-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      revokedAt: null,
      metadata: {},
    };
    mocks.acceptanceRepository.findOne.mockResolvedValue(acceptance);
    mocks.contractRepository.findOne.mockResolvedValue({
      id: 'contract-1',
      templateKey: 'msa',
    });
    mocks.acceptanceRepository.save.mockImplementation(async (value: any) => value);

    const response = await service.countersignAcceptance('acc-1', {}, currentUser);
    expect(response.skuldSignatoryId).toBe('sig-1');
    expect(response.skuldResolutionSource).toBe('default');
    expect(response.countersignedAt).toBeTruthy();
  });

  it('revokes acceptance with reason', async () => {
    const { service, mocks } = createService();
    const acceptance = {
      id: 'acc-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      revokedAt: null,
      revocationReason: null,
      metadata: {},
    };
    mocks.acceptanceRepository.findOne.mockResolvedValue(acceptance);
    mocks.acceptanceRepository.save.mockImplementation(async (value: any) => value);

    const response = await service.revokeAcceptance(
      'acc-1',
      { reason: 'Client request' },
      currentUser,
    );
    expect(response.revocationReason).toBe('Client request');
    expect(response.revokedAt).toBeTruthy();
  });

  it('verifies acceptance evidence integrity', async () => {
    const { service, mocks } = createService();
    const contentSnapshot = '<p>Signed snapshot</p>';
    const hash = createHash('sha256').update(contentSnapshot).digest('hex');
    const signatureData = 'Jane Signature';
    const signatureHash = createHash('sha256').update(signatureData).digest('hex');

    mocks.acceptanceRepository.findOne.mockResolvedValue({
      id: 'acc-1',
      clientId: 'client-1',
      contentSnapshot,
      contentSnapshotHash: hash,
      signatureHash,
      signedPdfUrl: null,
      signedPdfHash: null,
      evidence: { signatureData },
    });

    const response = await service.verifyAcceptanceEvidence('acc-1', currentUser);
    expect(response.verified).toBe(true);
    expect(response.issues).toHaveLength(0);
  });

  it('returns client contract status grouped by template key', async () => {
    const { service, mocks } = createService();
    const now = new Date();
    mocks.acceptanceRepository.find.mockResolvedValue([
      {
        id: 'acc-1',
        clientId: 'client-1',
        templateId: 'tpl-1',
        templateVersionId: 'tv-1',
        acceptedAt: now,
        acceptedByName: 'Jane',
        expirationDate: null,
        revokedAt: null,
        contract: { templateKey: 'msa', title: 'MSA', version: 1 },
      },
    ]);

    const response = await service.getClientContractStatus('client-1', currentUser);
    expect(response.totalActiveAcceptances).toBe(1);
    expect(response.acceptedContracts.msa).toHaveLength(1);
  });

  it('returns rendered acceptance content snapshot', async () => {
    const { service, mocks } = createService();
    const acceptedAt = new Date();
    mocks.acceptanceRepository.findOne.mockResolvedValue({
      id: 'acc-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      templateId: 'tpl-1',
      templateVersionId: 'tv-1',
      acceptedAt,
      acceptedByName: 'Jane',
      acceptedByEmail: 'jane@example.com',
      acceptedByTitle: 'CEO',
      contentSnapshot: '<p>Signed MSA</p>',
      contentSnapshotHash: 'abc',
      variablesUsed: { client_name: 'ACME' },
      revokedAt: null,
      revocationReason: null,
    });
    mocks.contractRepository.findOne.mockResolvedValue({
      id: 'contract-1',
      title: 'MSA',
      version: 1,
    });

    const response = await service.getRenderedAcceptance('acc-1', currentUser);
    expect(response.acceptanceId).toBe('acc-1');
    expect(response.contentSnapshot).toBe('<p>Signed MSA</p>');
  });

  it('creates envelope status summary counts', async () => {
    const { service, mocks } = createService();
    mocks.envelopeRepository.findOne.mockResolvedValue({
      id: 'env-1',
      clientId: 'client-1',
      status: 'sent',
      updatedAt: new Date(),
      recipients: [
        { status: ContractEnvelopeRecipientStatus.SIGNED },
        { status: ContractEnvelopeRecipientStatus.SENT },
      ],
    });

    const summary = await service.getEnvelopeStatusSummary('env-1', currentUser);
    expect(summary.totalRecipients).toBe(2);
    expect(summary.completedRecipients).toBe(1);
    expect(summary.pendingRecipients).toBe(1);
  });

  it('adds envelope document with content hash', async () => {
    const { service, mocks } = createService();
    mocks.envelopeRepository.findOne.mockResolvedValue({
      id: 'env-1',
      clientId: 'client-1',
    });
    mocks.signingDocumentRepository.save.mockImplementation(async (value: any) => ({
      id: 'doc-1',
      envelopeId: 'env-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...value,
    }));

    const response = await service.addEnvelopeDocument(
      'env-1',
      { name: 'Main document', content: '<p>x</p>' },
      currentUser,
    );

    expect(response.id).toBe('doc-1');
    expect(response.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reassigns recipient and resets OTP challenge', async () => {
    const { service, mocks } = createService();
    mocks.envelopeRepository.findOne.mockResolvedValue({
      id: 'env-1',
      clientId: 'client-1',
    });
    mocks.envelopeRecipientRepository.findOne.mockResolvedValue({
      id: 'rec-1',
      envelopeId: 'env-1',
      email: 'old@example.com',
      fullName: 'Old Signer',
      roleLabel: 'Signer',
      status: ContractEnvelopeRecipientStatus.SENT,
      metadata: {},
    });

    jest.spyOn(service as any, 'sendEnvelopeEmail').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'loadEnvelopeResponse').mockResolvedValue({ id: 'env-1' });

    await service.reassignEnvelopeRecipient(
      'env-1',
      {
        recipientId: 'rec-1',
        email: 'new@example.com',
        fullName: 'New Signer',
      },
      currentUser,
    );

    const updatedRecipient = mocks.envelopeRecipientRepository.save.mock.calls[0][0];
    expect(updatedRecipient.email).toBe('new@example.com');
    expect(updatedRecipient.otpCodeHash).toBeTruthy();
    expect(updatedRecipient.otpVerifiedAt).toBeNull();
  });

  it('rejects invalid status transition when suspending a non-sent envelope', async () => {
    const { service } = createService();
    jest.spyOn(service as any, 'requireEnvelope').mockResolvedValue({
      id: 'env-1',
      status: ContractEnvelopeStatus.CANCELLED,
      metadata: { lifecycleState: 'voided' },
    });

    await expect(service.suspendEnvelope('env-1', currentUser)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CONTRACT_ENVELOPE_STATUS_TRANSITION_INVALID',
      }),
    });
  });

  it('rejects resume when envelope lifecycle is not suspended', async () => {
    const { service } = createService();
    jest.spyOn(service as any, 'requireEnvelope').mockResolvedValue({
      id: 'env-1',
      status: ContractEnvelopeStatus.SENT,
      metadata: { lifecycleState: 'sent' },
    });

    await expect(service.resumeEnvelope('env-1', currentUser)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CONTRACT_ENVELOPE_STATUS_TRANSITION_INVALID',
      }),
    });
  });

  it('rejects offline evidence upload when content type is not whitelisted', async () => {
    const { service } = createService();
    jest.spyOn(service as any, 'requireEnvelope').mockResolvedValue({
      id: 'env-1',
      status: ContractEnvelopeStatus.SENT,
      metadata: {},
    });

    await expect(
      service.uploadEnvelopeOfflineEvidence(
        'env-1',
        {
          contentBase64: Buffer.from('x').toString('base64'),
          contentType: 'text/plain',
        },
        currentUser,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CONTRACT_OFFLINE_EVIDENCE_CONTENT_TYPE_INVALID',
      }),
    });
  });

  it('rejects offline evidence upload when payload exceeds size limit', async () => {
    const { service } = createService();
    jest.spyOn(service as any, 'requireEnvelope').mockResolvedValue({
      id: 'env-1',
      status: ContractEnvelopeStatus.SENT,
      metadata: {},
    });
    jest
      .spyOn(service as any, 'decodeBase64File')
      .mockReturnValue(Buffer.alloc(50 * 1024 * 1024 + 1, 1));

    await expect(
      service.uploadEnvelopeOfflineEvidence(
        'env-1',
        {
          contentBase64: Buffer.from('x').toString('base64'),
          contentType: 'application/pdf',
        },
        currentUser,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CONTRACT_OFFLINE_EVIDENCE_TOO_LARGE',
      }),
    });
  });
});
