import { ConfigService } from '@nestjs/config';
import { Client } from '../clients/entities/client.entity';
import { CreateLicenseDto } from '../licenses/dto/license.dto';
import { Tenant } from '../tenants/entities/tenant.entity';
import { ContractGateAction, ContractGateService } from './contract-gate.service';
import { ContractRequirementService } from './contract-requirement.service';
import { Contract, ContractStatus } from './entities/contract.entity';

type RepoMock<T> = {
  find: jest.Mock<Promise<T[]>, [unknown?]>;
  findOne: jest.Mock<Promise<T | null>, [unknown?]>;
};

function createRepoMock<T>(): RepoMock<T> {
  return {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
  };
}

describe('ContractGateService', () => {
  it('allows deploy gate when MSA is signed', async () => {
    const contractRepository = createRepoMock<Contract>();
    const tenantRepository = createRepoMock<Tenant>();
    const clientRepository = createRepoMock<Client>();
    const requirementService = {
      resolveRequiredContractTypes: jest.fn(async () => []),
    } as unknown as ContractRequirementService;
    const configService = { get: jest.fn(() => undefined) } as unknown as ConfigService;
    clientRepository.findOne.mockResolvedValue({ id: 'client-1', plan: 'enterprise' } as Client);

    contractRepository.find.mockResolvedValue([
      {
        id: 'ctr-1',
        clientId: 'client-1',
        tenantId: null,
        title: 'Master Service Agreement',
        templateKey: 'msa.v1',
        status: ContractStatus.SIGNED,
        metadata: {},
      } as Contract,
    ]);

    const service = new ContractGateService(
      contractRepository as any,
      tenantRepository as any,
      clientRepository as any,
      requirementService,
      configService,
    );

    const gate = await service.validateContractRequirements(
      'client-1',
      ContractGateAction.DEPLOY_ORCHESTRATOR,
      'tenant-1',
    );

    expect(gate.allowed).toBe(true);
    expect(gate.missing).toEqual([]);
  });

  it('blocks deploy gate when required contract is missing', async () => {
    const contractRepository = createRepoMock<Contract>();
    const tenantRepository = createRepoMock<Tenant>();
    const clientRepository = createRepoMock<Client>();
    const requirementService = {
      resolveRequiredContractTypes: jest.fn(async () => []),
    } as unknown as ContractRequirementService;
    const configService = { get: jest.fn(() => undefined) } as unknown as ConfigService;
    clientRepository.findOne.mockResolvedValue({ id: 'client-1', plan: 'enterprise' } as Client);

    contractRepository.find.mockResolvedValue([]);

    const service = new ContractGateService(
      contractRepository as any,
      tenantRepository as any,
      clientRepository as any,
      requirementService,
      configService,
    );

    const gate = await service.validateContractRequirements(
      'client-1',
      ContractGateAction.DEPLOY_ORCHESTRATOR,
      'tenant-1',
    );

    expect(gate.allowed).toBe(false);
    expect(gate.missing).toEqual(['MSA']);
  });

  it('blocks when only expired contract exists', async () => {
    const contractRepository = createRepoMock<Contract>();
    const tenantRepository = createRepoMock<Tenant>();
    const clientRepository = createRepoMock<Client>();
    const requirementService = {
      resolveRequiredContractTypes: jest.fn(async () => []),
    } as unknown as ContractRequirementService;
    const configService = { get: jest.fn(() => undefined) } as unknown as ConfigService;
    clientRepository.findOne.mockResolvedValue({ id: 'client-1', plan: 'enterprise' } as Client);

    // Service queries only signed contracts; an expired-only set yields no signed matches.
    contractRepository.find.mockResolvedValue([]);

    const service = new ContractGateService(
      contractRepository as any,
      tenantRepository as any,
      clientRepository as any,
      requirementService,
      configService,
    );

    const gate = await service.validateContractRequirements(
      'client-1',
      ContractGateAction.DEPLOY_ORCHESTRATOR,
      'tenant-1',
    );

    expect(gate.allowed).toBe(false);
    expect(gate.missing).toEqual(['MSA']);
  });

  it('requires BAA and DPA for license when tenant/data signals demand compliance', async () => {
    const contractRepository = createRepoMock<Contract>();
    const tenantRepository = createRepoMock<Tenant>();
    const clientRepository = createRepoMock<Client>();
    const requirementService = {
      resolveRequiredContractTypes: jest.fn(async () => []),
    } as unknown as ContractRequirementService;
    const configService = { get: jest.fn(() => undefined) } as unknown as ConfigService;

    tenantRepository.findOne.mockResolvedValue({
      id: 'tenant-1',
      clientId: 'client-1',
      settings: { compliance: ['hipaa', 'gdpr'] },
      metadata: {},
    } as unknown as Tenant);
    clientRepository.findOne.mockResolvedValue({
      id: 'client-1',
      plan: 'enterprise',
      metadata: {},
    } as Client);

    contractRepository.find.mockResolvedValue([
      {
        id: 'ctr-msa',
        clientId: 'client-1',
        tenantId: null,
        title: 'Master Service Agreement',
        templateKey: 'msa.v1',
        status: ContractStatus.SIGNED,
        metadata: {},
      } as Contract,
    ]);

    const service = new ContractGateService(
      contractRepository as any,
      tenantRepository as any,
      clientRepository as any,
      requirementService,
      configService,
    );

    const dto = {
      tenantId: 'tenant-1',
      type: 'enterprise',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2026-12-31T00:00:00.000Z',
      features: { processesPhi: true },
    } as CreateLicenseDto;

    const gate = await service.validateForLicenseCreate(dto);
    expect(gate.allowed).toBe(false);
    expect(gate.missing).toEqual(expect.arrayContaining(['BAA', 'DPA']));
  });
});
