import { BadRequestException } from '@nestjs/common';
import { ContractTemplateService } from './contract-template.service';
import { ContractTemplateStatus } from './entities/contract-domain.enums';

describe('ContractTemplateService', () => {
  const createService = (
    templateRepository: unknown,
    templateVersionRepository: unknown,
    pdfService: unknown,
    providerFactory: unknown = { executeWithFallback: jest.fn() },
    configService: unknown = { get: jest.fn(() => undefined) },
  ) =>
    new ContractTemplateService(
      templateRepository as any,
      templateVersionRepository as any,
      pdfService as any,
      providerFactory as any,
      configService as any,
    );

  it('rejects duplicate template keys', async () => {
    const templateRepository = {
      findOne: jest.fn(async () => ({ id: 'tpl-existing' })),
      save: jest.fn(),
      create: jest.fn((value) => value),
      find: jest.fn(),
    };

    const templateVersionRepository = {
      save: jest.fn(),
      create: jest.fn((value) => value),
      findOne: jest.fn(),
    };

    const pdfService = {
      convertTipTapJsonToHtml: jest.fn(() => '<p>html</p>'),
    };

    const service = createService(templateRepository, templateVersionRepository, pdfService);

    await expect(
      service.createTemplate(
        {
          templateKey: 'msa.v1',
          title: 'Master Service Agreement',
        },
        { id: 'user-1' } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates template + initial draft version with normalized variables', async () => {
    const templateWithVersion = {
      id: 'tpl-1',
      templateKey: 'msa.v1',
      title: 'Master Service Agreement',
      description: null,
      status: ContractTemplateStatus.DRAFT,
      activeVersionId: null,
      latestVersionNumber: 1,
      metadata: {},
      versions: [
        {
          id: 'tv-1',
          templateId: 'tpl-1',
          versionNumber: 1,
          status: ContractTemplateStatus.DRAFT,
          documentJson: { type: 'doc' },
          variableDefinitions: {
            client_name: {
              key: 'client_name',
              label: 'Client Name',
              required: true,
            },
          },
          renderedHtml: '<p>html</p>',
          changeLog: null,
          supersedesVersionId: null,
          publishedAt: null,
          deprecatedAt: null,
          archivedAt: null,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const templateRepository = {
      find: jest.fn(async () => []),
      findOne: jest.fn(async (params: any) => {
        if (params?.where?.templateKey) {
          return null;
        }
        if (params?.where?.id === 'tpl-1') {
          return templateWithVersion;
        }
        return null;
      }),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        ...value,
        id: 'tpl-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    };

    const templateVersionRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        ...value,
        id: 'tv-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findOne: jest.fn(async () => null),
    };

    const pdfService = {
      convertTipTapJsonToHtml: jest.fn(() => '<p>html</p>'),
    };

    const service = createService(templateRepository, templateVersionRepository, pdfService);

    const result = await service.createTemplate(
      {
        templateKey: 'MSA.V1',
        title: 'Master Service Agreement',
        documentJson: { type: 'doc' },
        variableDefinitions: [{ key: 'client_name', label: 'Client Name', required: true }],
      },
      { id: 'user-1' } as any,
    );

    expect(templateRepository.save).toHaveBeenCalled();
    expect(templateVersionRepository.save).toHaveBeenCalled();
    expect(pdfService.convertTipTapJsonToHtml).toHaveBeenCalledWith({ type: 'doc' });
    expect(result.templateKey).toBe('msa.v1');
    expect(result.versions[0].variableDefinitions).toEqual(
      expect.objectContaining({
        client_name: expect.objectContaining({ key: 'client_name' }),
      }),
    );
  });

  it('creates a new draft template version from the latest active version', async () => {
    const versionOne = {
      id: 'tv-1',
      templateId: 'tpl-1',
      versionNumber: 1,
      status: ContractTemplateStatus.PUBLISHED,
      supersedesVersionId: null,
      documentJson: { type: 'doc', content: [{ type: 'paragraph' }] },
      variableDefinitions: {},
      renderedHtml: '<p>Version 1</p>',
      changeLog: 'Initial',
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      deprecatedAt: null,
      archivedAt: null,
      createdByUserId: 'user-1',
      updatedByUserId: 'user-1',
      metadata: {},
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    const templateState: any = {
      id: 'tpl-1',
      templateKey: 'msa.v1',
      title: 'Master Service Agreement',
      description: null,
      status: ContractTemplateStatus.PUBLISHED,
      activeVersionId: 'tv-1',
      latestVersionNumber: 1,
      metadata: {},
      versions: [versionOne],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    const templateRepository = {
      findOne: jest.fn(async (params: any) => {
        if (params?.where?.id === 'tpl-1') {
          return templateState;
        }
        return null;
      }),
      save: jest.fn(async (value: any) => {
        Object.assign(templateState, value);
        return templateState;
      }),
      find: jest.fn(),
      create: jest.fn((value) => value),
    };

    const templateVersionRepository = {
      findOne: jest.fn(async () => null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value: any) => {
        const saved = {
          ...value,
          id: 'tv-2',
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
          updatedAt: new Date('2026-02-01T00:00:00.000Z'),
        };
        templateState.versions.push(saved);
        return saved;
      }),
    };

    const service = createService(templateRepository, templateVersionRepository, {
      convertTipTapJsonToHtml: jest.fn(),
    });

    const result = await service.createTemplateVersion(
      'tpl-1',
      { changeLog: 'Prepare legal language updates' },
      { id: 'user-2' } as any,
    );

    expect(templateRepository.save).toHaveBeenCalled();
    expect(templateVersionRepository.save).toHaveBeenCalled();
    expect(result.latestVersionNumber).toBe(2);
    expect(result.versions[0]).toEqual(
      expect.objectContaining({
        versionNumber: 2,
        status: ContractTemplateStatus.DRAFT,
        supersedesVersionId: 'tv-1',
        changeLog: 'Prepare legal language updates',
      }),
    );
  });

  it('rejects archiving an active published template', async () => {
    const templateRepository = {
      findOne: jest.fn(async () => ({
        id: 'tpl-1',
        templateKey: 'msa.v1',
        title: 'Master Service Agreement',
        description: null,
        status: ContractTemplateStatus.PUBLISHED,
        activeVersionId: 'tv-1',
        latestVersionNumber: 1,
        metadata: {},
        versions: [
          {
            id: 'tv-1',
            templateId: 'tpl-1',
            versionNumber: 1,
            status: ContractTemplateStatus.PUBLISHED,
          },
        ],
      })),
      save: jest.fn(),
      find: jest.fn(),
      create: jest.fn((value) => value),
    };

    const service = createService(
      templateRepository,
      {
        findOne: jest.fn(),
        save: jest.fn(),
        create: jest.fn((value) => value),
      },
      { convertTipTapJsonToHtml: jest.fn() },
    );

    await expect(service.archiveTemplate('tpl-1', { id: 'user-1' } as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects publishing templates with empty document payload', async () => {
    const templateRepository = {
      findOne: jest.fn(async () => ({
        id: 'tpl-1',
        templateKey: 'msa.v1',
        title: 'Master Service Agreement',
        description: null,
        status: ContractTemplateStatus.DRAFT,
        activeVersionId: null,
        latestVersionNumber: 1,
        metadata: {},
        versions: [
          {
            id: 'tv-1',
            templateId: 'tpl-1',
            versionNumber: 1,
            status: ContractTemplateStatus.DRAFT,
            documentJson: {},
            renderedHtml: null,
          },
        ],
      })),
      save: jest.fn(),
      find: jest.fn(),
      create: jest.fn((value) => value),
    };

    const service = createService(
      templateRepository,
      {
        findOne: jest.fn(async () => null),
        save: jest.fn(),
        create: jest.fn((value) => value),
      },
      { convertTipTapJsonToHtml: jest.fn() },
    );

    await expect(
      service.publishTemplate('tpl-1', {}, { id: 'user-1' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns version chain integrity flags with broken supersedes links and gaps', async () => {
    const templateRepository = {
      findOne: jest.fn(async (params: any) => {
        if (params?.where?.templateKey === 'msa.v1') {
          return {
            id: 'tpl-1',
            templateKey: 'msa.v1',
            title: 'Master Service Agreement',
            versions: [
              {
                id: 'tv-1',
                versionNumber: 1,
                status: ContractTemplateStatus.PUBLISHED,
                supersedesVersionId: null,
                publishedAt: new Date('2026-01-01T00:00:00.000Z'),
                deprecatedAt: null,
                archivedAt: null,
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
              },
              {
                id: 'tv-3',
                versionNumber: 3,
                status: ContractTemplateStatus.DRAFT,
                supersedesVersionId: 'tv-2-missing',
                publishedAt: null,
                deprecatedAt: null,
                archivedAt: null,
                createdAt: new Date('2026-03-01T00:00:00.000Z'),
                updatedAt: new Date('2026-03-01T00:00:00.000Z'),
              },
            ],
          };
        }
        return null;
      }),
      save: jest.fn(),
      find: jest.fn(),
      create: jest.fn((value) => value),
    };

    const service = createService(
      templateRepository,
      {
        findOne: jest.fn(),
        save: jest.fn(),
        create: jest.fn((value) => value),
      },
      { convertTipTapJsonToHtml: jest.fn() },
    );

    const chain = await service.getTemplateVersionChainByTemplateKey('MSA.V1', false);

    expect(chain.templateKey).toBe('msa.v1');
    expect(chain.integrity.hasBrokenLinks).toBe(true);
    expect(chain.integrity.brokenNodeIds).toContain('tv-3');
    expect(chain.integrity.hasVersionGaps).toBe(true);
    expect(chain.integrity.expectedNextVersion).toBe(4);
  });

  it('uploads template PDF to storage and returns preview URL', async () => {
    const draftVersion: any = {
      id: 'tv-1',
      templateId: 'tpl-1',
      versionNumber: 1,
      status: ContractTemplateStatus.DRAFT,
      metadata: {},
      documentJson: { type: 'doc', content: [{ type: 'paragraph' }] },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const templateState: any = {
      id: 'tpl-1',
      templateKey: 'msa.v1',
      title: 'Master Service Agreement',
      status: ContractTemplateStatus.DRAFT,
      activeVersionId: null,
      latestVersionNumber: 1,
      versions: [draftVersion],
    };

    const templateRepository = {
      findOne: jest.fn(async () => templateState),
      save: jest.fn(async (value: any) => value),
      find: jest.fn(),
      create: jest.fn((value) => value),
    };
    const templateVersionRepository = {
      findOne: jest.fn(async () => draftVersion),
      save: jest.fn(async (value: any) => {
        Object.assign(draftVersion, value);
        return value;
      }),
      create: jest.fn((value) => value),
    };
    const providerFactory = {
      executeWithFallback: jest.fn(async (_type: string, operation: string) => {
        if (operation === 'upload') {
          return { result: { key: 'contracts/templates/tpl-1/versions/1/template.pdf', url: '' } };
        }
        if (operation === 'getSignedUrl') {
          return { result: 'https://signed.example/template.pdf' };
        }
        return { result: null };
      }),
    };

    const service = createService(
      templateRepository,
      templateVersionRepository,
      { convertTipTapJsonToHtml: jest.fn() },
      providerFactory,
    );

    const result = await service.uploadTemplatePdf(
      'tpl-1',
      { contentBase64: Buffer.from('%PDF-1.4 test').toString('base64') },
      { id: 'user-1' } as any,
    );

    expect(result.hasPdf).toBe(true);
    expect(result.signedUrl).toBe('https://signed.example/template.pdf');
    expect(providerFactory.executeWithFallback).toHaveBeenCalled();
  });

  it('updates signature fields on draft version', async () => {
    const draftVersion: any = {
      id: 'tv-1',
      templateId: 'tpl-1',
      versionNumber: 1,
      status: ContractTemplateStatus.DRAFT,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const templateState: any = {
      id: 'tpl-1',
      templateKey: 'msa.v1',
      title: 'Master Service Agreement',
      status: ContractTemplateStatus.DRAFT,
      activeVersionId: null,
      latestVersionNumber: 1,
      versions: [draftVersion],
    };
    const service = createService(
      {
        findOne: jest.fn(async () => templateState),
        save: jest.fn(async (value: any) => value),
        find: jest.fn(),
        create: jest.fn((value) => value),
      },
      {
        findOne: jest.fn(async () => draftVersion),
        save: jest.fn(async (value: any) => value),
        create: jest.fn((value) => value),
      },
      { convertTipTapJsonToHtml: jest.fn() },
    );

    const response = await service.updateTemplateSignatureFields(
      'tpl-1',
      {
        fields: [
          {
            id: 'client-signature',
            type: 'signature' as any,
            variableKey: 'signer_full_name',
            required: true,
          },
        ],
      },
      { id: 'user-1' } as any,
    );

    expect(response.fields).toHaveLength(1);
    expect(response.fields[0].id).toBe('client-signature');
  });

  it('resolves variables and reports missing required keys', async () => {
    const template = {
      id: 'tpl-1',
      templateKey: 'msa.v1',
      title: 'Master Service Agreement',
      versions: [
        {
          id: 'tv-1',
          versionNumber: 1,
          status: ContractTemplateStatus.DRAFT,
          variableDefinitions: {
            client_name: { key: 'client_name', required: true },
            contract_term: { key: 'contract_term', required: false, defaultValue: '12 months' },
          },
          metadata: {},
        },
      ],
    };

    const service = createService(
      {
        findOne: jest.fn(async () => template),
        save: jest.fn(),
        find: jest.fn(),
        create: jest.fn((value) => value),
      },
      {
        findOne: jest.fn(),
        save: jest.fn(),
        create: jest.fn((value) => value),
      },
      { convertTipTapJsonToHtml: jest.fn() },
    );

    const response = await service.resolveTemplateVariables('tpl-1', {
      variables: {},
      context: {},
    });

    expect(response.missingRequired).toEqual(['client_name']);
    expect(response.resolved.contract_term).toBe('12 months');
  });
});
