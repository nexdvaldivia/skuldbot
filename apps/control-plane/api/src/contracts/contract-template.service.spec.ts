import { BadRequestException } from '@nestjs/common';
import { ContractTemplateService } from './contract-template.service';
import { ContractTemplateStatus } from './entities/contract-domain.enums';

describe('ContractTemplateService', () => {
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

    const service = new ContractTemplateService(
      templateRepository as any,
      templateVersionRepository as any,
      pdfService as any,
    );

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

    const service = new ContractTemplateService(
      templateRepository as any,
      templateVersionRepository as any,
      pdfService as any,
    );

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

    const service = new ContractTemplateService(
      templateRepository as any,
      templateVersionRepository as any,
      { convertTipTapJsonToHtml: jest.fn() } as any,
    );

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

    const service = new ContractTemplateService(
      templateRepository as any,
      {
        findOne: jest.fn(),
        save: jest.fn(),
        create: jest.fn((value) => value),
      } as any,
      { convertTipTapJsonToHtml: jest.fn() } as any,
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

    const service = new ContractTemplateService(
      templateRepository as any,
      {
        findOne: jest.fn(async () => null),
        save: jest.fn(),
        create: jest.fn((value) => value),
      } as any,
      { convertTipTapJsonToHtml: jest.fn() } as any,
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

    const service = new ContractTemplateService(
      templateRepository as any,
      {
        findOne: jest.fn(),
        save: jest.fn(),
        create: jest.fn((value) => value),
      } as any,
      { convertTipTapJsonToHtml: jest.fn() } as any,
    );

    const chain = await service.getTemplateVersionChainByTemplateKey('MSA.V1', false);

    expect(chain.templateKey).toBe('msa.v1');
    expect(chain.integrity.hasBrokenLinks).toBe(true);
    expect(chain.integrity.brokenNodeIds).toContain('tv-3');
    expect(chain.integrity.hasVersionGaps).toBe(true);
    expect(chain.integrity.expectedNextVersion).toBe(4);
  });
});
