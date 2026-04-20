import { ConflictException, NotFoundException } from '@nestjs/common';
import { ContractLegalService } from './contract-legal.service';

describe('ContractLegalService', () => {
  const makeConfigService = () =>
    ({
      get: jest.fn((key: string) => {
        if (key === 'STORAGE_PROVIDER_CHAIN') return 's3';
        if (key === 'STORAGE_PROVIDER') return 's3';
        return undefined;
      }),
    }) as any;

  const makeProviderFactory = () =>
    ({
      executeWithFallback: jest.fn(async (_type, operation: string, executor) => {
        if (operation === 'upload') {
          return { result: { key: 'contracts/signatories/s-1/signature.png' } };
        }
        if (operation === 'getSignedUrl') {
          return { result: 'https://storage.example/signature.png' };
        }
        await executor({
          upload: jest.fn(),
          getSignedUrl: jest.fn(),
          delete: jest.fn(),
        });
        return { result: undefined };
      }),
    }) as any;

  const makeLegalRepo = () =>
    ({
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((value) => value),
      find: jest.fn(),
      delete: jest.fn(),
    }) as any;

  const makeSignatoryRepo = () =>
    ({
      findOne: jest.fn(),
      save: jest.fn(async (value) => ({
        id: value.id ?? 'signatory-1',
        createdAt: value.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...value,
      })),
      create: jest.fn((value) => value),
      find: jest.fn(async () => []),
      delete: jest.fn(),
    }) as any;

  it('creates signatory with signature fields initialized', async () => {
    const legalRepo = makeLegalRepo();
    const signatoryRepo = makeSignatoryRepo();
    signatoryRepo.findOne.mockResolvedValueOnce(null);
    const service = new ContractLegalService(
      legalRepo,
      signatoryRepo,
      makeProviderFactory(),
      makeConfigService(),
    );

    const result = await service.createSignatory(
      {
        fullName: 'Jane Legal',
        email: 'jane@example.com',
      },
      { id: 'user-1' } as any,
    );

    expect(signatoryRepo.create).toHaveBeenCalled();
    expect(result.hasSignature).toBe(false);
    expect(result.signatureContentType).toBeNull();
  });

  it('fails on duplicated signatory email', async () => {
    const legalRepo = makeLegalRepo();
    const signatoryRepo = makeSignatoryRepo();
    signatoryRepo.findOne.mockResolvedValue({ id: 'existing-1', email: 'jane@example.com' });
    const service = new ContractLegalService(
      legalRepo,
      signatoryRepo,
      makeProviderFactory(),
      makeConfigService(),
    );

    await expect(
      service.createSignatory(
        {
          fullName: 'Jane Legal',
          email: 'jane@example.com',
        },
        { id: 'user-1' } as any,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails when updating non-existing signatory', async () => {
    const legalRepo = makeLegalRepo();
    const signatoryRepo = makeSignatoryRepo();
    signatoryRepo.findOne.mockResolvedValue(null);
    const service = new ContractLegalService(
      legalRepo,
      signatoryRepo,
      makeProviderFactory(),
      makeConfigService(),
    );

    await expect(
      service.updateSignatory('missing', { fullName: 'Updated' }, { id: 'user-1' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uploads signatory signature and returns signed url response', async () => {
    const legalRepo = makeLegalRepo();
    const signatoryRepo = makeSignatoryRepo();
    signatoryRepo.findOne.mockResolvedValue({
      id: 'signatory-1',
      fullName: 'Jane Legal',
      email: 'jane@example.com',
      title: null,
      isActive: true,
      isDefault: true,
      signatureStorageKey: null,
      signatureContentType: null,
      signatureSha256: null,
      signatureUploadedAt: null,
      metadata: {},
      policies: {},
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const providerFactory = makeProviderFactory();
    const service = new ContractLegalService(
      legalRepo,
      signatoryRepo,
      providerFactory,
      makeConfigService(),
    );

    const response = await service.uploadSignatorySignature(
      'signatory-1',
      {
        contentBase64: Buffer.from('signature-content').toString('base64'),
        contentType: 'image/png',
      },
      { id: 'user-1' } as any,
    );

    expect(providerFactory.executeWithFallback).toHaveBeenCalled();
    expect(response.hasSignature).toBe(true);
    expect(response.signatureUrl).toContain('https://storage.example');
  });

  it('removes signatory signature and resets metadata', async () => {
    const legalRepo = makeLegalRepo();
    const signatoryRepo = makeSignatoryRepo();
    signatoryRepo.findOne
      .mockResolvedValueOnce({
        id: 'signatory-1',
        signatureStorageKey: 'contracts/signatories/signatory-1/signature.png',
        signatureContentType: 'image/png',
        signatureSha256: 'abc',
        signatureUploadedAt: new Date('2026-01-01T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'signatory-1',
        signatureStorageKey: null,
        signatureContentType: null,
        signatureUploadedAt: null,
      });

    const providerFactory = makeProviderFactory();
    const service = new ContractLegalService(
      legalRepo,
      signatoryRepo,
      providerFactory,
      makeConfigService(),
    );

    const response = await service.removeSignatorySignature('signatory-1', { id: 'user-1' } as any);

    expect(providerFactory.executeWithFallback).toHaveBeenCalled();
    expect(response.hasSignature).toBe(false);
    expect(response.signatureUrl).toBeNull();
  });
});
