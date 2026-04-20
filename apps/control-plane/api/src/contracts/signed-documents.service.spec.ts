import { NotFoundException } from '@nestjs/common';
import { ContractEnvelopeStatus } from './entities/contract-domain.enums';
import { SignedDocumentsService } from './signed-documents.service';

describe('SignedDocumentsService', () => {
  const makeRepo = () =>
    ({
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    }) as any;

  const makeService = () => {
    const envelopeRepo = makeRepo();
    const acceptanceRepo = makeRepo();
    const contractRepo = makeRepo();
    const pdfService = {
      downloadContractPdf: jest.fn(),
    } as any;

    const service = new SignedDocumentsService(
      envelopeRepo,
      acceptanceRepo,
      contractRepo,
      pdfService,
    );
    return {
      service,
      envelopeRepo,
      acceptanceRepo,
      contractRepo,
      pdfService,
    };
  };

  it('lists signed documents with pagination metadata', async () => {
    const { service, envelopeRepo } = makeService();
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'env-1',
          clientId: 'client-1',
          subject: 'MSA Agreement',
          status: ContractEnvelopeStatus.COMPLETED,
          metadata: { contractType: 'msa' },
          completedAt: new Date('2026-01-01T00:00:00.000Z'),
          createdAt: new Date('2025-12-31T00:00:00.000Z'),
          documents: [{ id: 'doc-1', sortOrder: 0 }],
          recipients: [
            {
              status: 'signed',
              fullName: 'Signer One',
              email: 'signer@example.com',
              signedAt: new Date('2026-01-01T00:00:00.000Z'),
            },
          ],
        },
      ]),
    };
    envelopeRepo.createQueryBuilder.mockReturnValue(queryBuilder);

    const response = await service.listSignedDocuments(
      { clientId: 'client-1', skip: 0, limit: 20 },
      { clientId: 'client-1', isSkuld: () => false } as any,
    );

    expect(response.total).toBe(1);
    expect(response.items[0]?.documentType).toBe('msa');
    expect(response.pages).toBe(1);
  });

  it('returns redirect result for pdf when signedPdfUrl exists', async () => {
    const { service, envelopeRepo, acceptanceRepo } = makeService();
    envelopeRepo.findOne.mockResolvedValue({
      id: 'env-1',
      clientId: 'client-1',
      subject: 'Signed MSA',
      status: ContractEnvelopeStatus.COMPLETED,
      documents: [],
      recipients: [],
      metadata: {},
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    acceptanceRepo.findOne.mockResolvedValue({
      signedPdfUrl: 'https://cdn.example.com/signed/env-1.pdf',
    });

    const result = await service.downloadSignedDocument('env-1', 'pdf', {
      clientId: 'client-1',
      isSkuld: () => false,
    } as any);

    expect(result.redirectUrl).toBe('https://cdn.example.com/signed/env-1.pdf');
    expect(result.contentType).toBe('application/pdf');
  });

  it('throws when signed document does not exist', async () => {
    const { service, envelopeRepo } = makeService();
    envelopeRepo.findOne.mockResolvedValue(null);

    await expect(
      service.getSignedDocument('missing', { clientId: 'client-1', isSkuld: () => false } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
