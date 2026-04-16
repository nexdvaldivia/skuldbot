import { ContractRequirementService } from './contract-requirement.service';
import { ContractRequirementAction } from './entities/contract-domain.enums';

describe('ContractRequirementService', () => {
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

    const requirementRepository = {
      createQueryBuilder: jest.fn(() => qb),
      find: jest.fn(),
      delete: jest.fn(),
      save: jest.fn(),
      create: jest.fn((value) => value),
    };

    const service = new ContractRequirementService(requirementRepository as any);

    const result = await service.resolveRequiredContractTypes({
      action: ContractRequirementAction.LICENSE_CREATE,
      planCode: 'enterprise',
      addonCodes: ['eu-data'],
    });

    expect(requirementRepository.createQueryBuilder).toHaveBeenCalledWith('requirement');
    expect(result).toEqual(['dpa']);
  });

  it('returns empty when no requirements match the requested action', async () => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    };

    const requirementRepository = {
      createQueryBuilder: jest.fn(() => qb),
      find: jest.fn(),
      delete: jest.fn(),
      save: jest.fn(),
      create: jest.fn((value) => value),
    };

    const service = new ContractRequirementService(requirementRepository as any);

    const result = await service.resolveRequiredContractTypes({
      action: ContractRequirementAction.PROCESS_PHI,
      planCode: 'starter',
      addonCodes: [],
    });

    expect(result).toEqual([]);
  });
});
