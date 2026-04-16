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
});
