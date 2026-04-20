import { NotFoundException } from '@nestjs/common';
import { ContractRequirementService } from './contract-requirement.service';
import {
  ContractRequirementAction,
  ContractTemplateStatus,
} from './entities/contract-domain.enums';
import { ContractStatus } from './entities/contract.entity';

describe('ContractRequirementService', () => {
  const createService = (overrides?: {
    requirementRepository?: Record<string, unknown>;
    contractRepository?: Record<string, unknown>;
    templateRepository?: Record<string, unknown>;
    contractTypeLookupRepository?: Record<string, unknown>;
    clientRepository?: Record<string, unknown>;
    clientContactRepository?: Record<string, unknown>;
    templateService?: Record<string, unknown>;
  }) => {
    const requirementRepository = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => []),
      })),
      find: jest.fn(async () => []),
      delete: jest.fn(),
      save: jest.fn(),
      create: jest.fn((value) => value),
      ...(overrides?.requirementRepository ?? {}),
    };

    const contractRepository = {
      find: jest.fn(async () => []),
      ...(overrides?.contractRepository ?? {}),
    };

    const templateRepository = {
      find: jest.fn(async () => []),
      ...(overrides?.templateRepository ?? {}),
    };

    const contractTypeLookupRepository = {
      find: jest.fn(async () => []),
      ...(overrides?.contractTypeLookupRepository ?? {}),
    };

    const clientRepository = {
      findOne: jest.fn(async () => ({ id: 'client-1', name: 'ACME', plan: 'enterprise' })),
      ...(overrides?.clientRepository ?? {}),
    };

    const clientContactRepository = {
      findOne: jest.fn(async () => null),
      ...(overrides?.clientContactRepository ?? {}),
    };

    const templateService = {
      getTemplateById: jest.fn(),
      resolveTemplateVariables: jest.fn(),
      ...(overrides?.templateService ?? {}),
    };

    const service = new ContractRequirementService(
      requirementRepository as any,
      contractRepository as any,
      templateRepository as any,
      contractTypeLookupRepository as any,
      clientRepository as any,
      clientContactRepository as any,
      templateService as any,
    );

    return {
      service,
      requirementRepository,
      contractRepository,
      templateRepository,
      contractTypeLookupRepository,
      clientRepository,
      clientContactRepository,
      templateService,
    };
  };

  it('prioritizes most specific requirement by plan/addon scope', async () => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [
        {
          contractTypeCode: 'msa',
          isRequired: true,
          planCode: null,
          addonCode: null,
        },
        {
          contractTypeCode: 'msa',
          isRequired: false,
          planCode: 'enterprise',
          addonCode: null,
        },
        {
          contractTypeCode: 'dpa',
          isRequired: true,
          planCode: 'enterprise',
          addonCode: 'eu-data',
        },
      ]),
    };

    const { service, requirementRepository } = createService({
      requirementRepository: {
        createQueryBuilder: jest.fn(() => qb),
      },
    });

    const result = await service.resolveRequiredContractTypes({
      action: ContractRequirementAction.LICENSE_CREATE,
      planCode: 'enterprise',
      addonCodes: ['eu-data'],
    });

    expect(requirementRepository.createQueryBuilder).toHaveBeenCalledWith('requirement');
    expect(result).toEqual(['DPA']);
  });

  it('returns validation result with missing contract types and templates', async () => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [
        {
          contractTypeCode: 'msa',
          isRequired: true,
          planCode: 'enterprise',
          addonCode: null,
        },
      ]),
    };

    const { service } = createService({
      requirementRepository: {
        createQueryBuilder: jest.fn(() => qb),
      },
      contractTypeLookupRepository: {
        find: jest.fn(async () => [{ code: 'msa', isActive: true }]),
      },
      templateRepository: {
        find: jest.fn(async () => [
          {
            id: 'tpl-1',
            templateKey: 'msa.v1',
            title: 'Master Service Agreement',
            status: ContractTemplateStatus.PUBLISHED,
            activeVersionId: 'tv-1',
            versions: [{ id: 'tv-1', versionNumber: 1 }],
            metadata: { contractTypeCode: 'msa' },
            updatedAt: new Date('2026-04-17T00:00:00.000Z'),
          },
        ]),
      },
      contractRepository: {
        find: jest.fn(async () => []),
      },
      clientRepository: {
        findOne: jest.fn(async () => ({ id: 'client-1', name: 'ACME', plan: 'enterprise' })),
      },
    });

    const result = await service.validateSubscriptionContracts(
      {
        planTier: 'enterprise',
      },
      'client-1',
    );

    expect(result.valid).toBe(false);
    expect(result.missingContractTypes).toEqual(['MSA']);
    expect(result.requiredContracts).toHaveLength(1);
    expect(result.requiredContracts[0].templateId).toBe('tpl-1');
  });

  it('uses vertical slug as addon scope when resolving required contracts for vertical', async () => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    };

    const { service } = createService({
      requirementRepository: {
        createQueryBuilder: jest.fn(() => qb),
      },
    });

    await service.getRequiredContractsForVertical('healthcare', {
      planTier: 'enterprise',
      action: ContractRequirementAction.DEPLOY_ORCHESTRATOR,
    });

    expect(qb.andWhere).toHaveBeenCalledWith(
      '(requirement.addonCode IS NULL OR requirement.addonCode IN (:...addonCodes))',
      { addonCodes: ['healthcare'] },
    );
  });

  it('renders template for client with resolved variables', async () => {
    const { service, templateService } = createService({
      templateService: {
        getTemplateById: jest.fn(async () => ({
          id: 'tpl-1',
          templateKey: 'msa.v1',
          title: 'Master Service Agreement',
          activeVersionId: 'tv-1',
          versions: [
            {
              id: 'tv-1',
              versionNumber: 1,
              renderedHtml: '<p>{{client_name}}</p>',
            },
          ],
        })),
        resolveTemplateVariables: jest.fn(async () => ({
          resolved: { client_name: 'ACME Corp' },
          missingRequired: [],
          unresolved: [],
        })),
      },
      clientRepository: {
        findOne: jest.fn(async () => ({
          id: 'client-1',
          name: 'ACME Corp',
          slug: 'acme',
          billingEmail: 'billing@acme.com',
          plan: 'enterprise',
        })),
      },
      clientContactRepository: {
        findOne: jest.fn(async () => ({
          fullName: 'Jane Doe',
          email: 'jane@acme.com',
        })),
      },
    });

    const response = await service.renderTemplateForClient('tpl-1', 'client-1');

    expect(templateService.resolveTemplateVariables).toHaveBeenCalledWith('tpl-1', {
      context: expect.objectContaining({
        client_name: 'ACME Corp',
        signer_full_name: 'Jane Doe',
      }),
    });
    expect(response.renderedHtml).toBe('<p>ACME Corp</p>');
  });

  it('throws not found when rendering with unknown client', async () => {
    const { service } = createService({
      clientRepository: {
        findOne: jest.fn(async () => null),
      },
    });

    await expect(service.renderTemplateForClient('tpl-1', 'missing-client')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('detects signed contract types from contract metadata', async () => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [
        {
          contractTypeCode: 'msa',
          isRequired: true,
          planCode: 'enterprise',
          addonCode: null,
        },
      ]),
    };

    const { service } = createService({
      requirementRepository: {
        createQueryBuilder: jest.fn(() => qb),
      },
      contractTypeLookupRepository: {
        find: jest.fn(async () => [{ code: 'msa', isActive: true }]),
      },
      contractRepository: {
        find: jest.fn(async () => [
          {
            status: ContractStatus.SIGNED,
            templateKey: 'msa-enterprise',
            title: 'Master Service Agreement',
            metadata: { contractTypeCode: 'msa' },
            signedAt: new Date('2026-04-17T00:00:00.000Z'),
          },
        ]),
      },
      templateRepository: {
        find: jest.fn(async () => [
          {
            id: 'tpl-1',
            templateKey: 'msa.v1',
            title: 'Master Service Agreement',
            status: ContractTemplateStatus.PUBLISHED,
            activeVersionId: 'tv-1',
            versions: [{ id: 'tv-1', versionNumber: 1 }],
            metadata: { contractTypeCode: 'msa' },
            updatedAt: new Date('2026-04-17T00:00:00.000Z'),
          },
        ]),
      },
      clientRepository: {
        findOne: jest.fn(async () => ({ id: 'client-1', name: 'ACME', plan: 'enterprise' })),
      },
    });

    const result = await service.validateSubscriptionContracts(
      { planTier: 'enterprise' },
      'client-1',
    );
    expect(result.valid).toBe(true);
    expect(result.presentContractTypes).toEqual(['MSA']);
  });
});
