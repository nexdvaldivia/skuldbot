import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SecurityAuditEvent } from '../common/audit/entities/security-audit-event.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { RbacService } from './rbac.service';
import { CpPermission } from './entities/cp-permission.entity';
import { CpRole, CpRoleScopeType } from './entities/cp-role.entity';

type RepoMock = {
  findOne: jest.Mock;
  find: jest.Mock;
  save: jest.Mock;
  remove: jest.Mock;
  create: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function createRepoMock(): RepoMock {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(async (payload) => payload),
    remove: jest.fn(),
    create: jest.fn((payload) => payload),
    createQueryBuilder: jest.fn(),
  };
}

describe('RbacService', () => {
  let service: RbacService;
  let roleRepository: RepoMock;
  let permissionRepository: RepoMock;
  let userRepository: RepoMock;
  let clientRepository: RepoMock;
  let securityAuditRepository: RepoMock;
  const actor = { id: 'admin-1', email: 'admin@skuld.local' } as User;
  const requestIp = '127.0.0.1';

  beforeEach(() => {
    roleRepository = createRepoMock();
    permissionRepository = createRepoMock();
    userRepository = createRepoMock();
    clientRepository = createRepoMock();
    securityAuditRepository = createRepoMock();

    service = new RbacService(
      roleRepository as unknown as Repository<CpRole>,
      permissionRepository as unknown as Repository<CpPermission>,
      userRepository as unknown as Repository<User>,
      clientRepository as unknown as Repository<Client>,
      securityAuditRepository as unknown as Repository<SecurityAuditEvent>,
    );
  });

  it('adds a permission to custom role', async () => {
    roleRepository.findOne.mockResolvedValue({
      id: 'role-1',
      name: 'custom_role',
      isSystem: false,
      scopeType: CpRoleScopeType.PLATFORM,
      permissions: [],
      clientId: null,
    });
    permissionRepository.findOne.mockResolvedValue({
      id: 'perm-1',
      code: 'users:read',
      label: 'Users Read',
      category: 'users',
      description: null,
    });

    const result = await service.addRolePermission('role-1', 'perm-1', actor, requestIp);

    expect(result.id).toBe('perm-1');
    expect(roleRepository.save).toHaveBeenCalled();
    expect(securityAuditRepository.save).toHaveBeenCalled();
  });

  it('rejects duplicate permission assignment', async () => {
    roleRepository.findOne.mockResolvedValue({
      id: 'role-1',
      name: 'custom_role',
      isSystem: false,
      scopeType: CpRoleScopeType.PLATFORM,
      permissions: [{ id: 'perm-1' }],
      clientId: null,
    });
    permissionRepository.findOne.mockResolvedValue({
      id: 'perm-1',
      code: 'users:read',
      label: 'Users Read',
      category: 'users',
      description: null,
    });

    await expect(
      service.addRolePermission('role-1', 'perm-1', actor, requestIp),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails when removing non-existing permission on role', async () => {
    roleRepository.findOne.mockResolvedValue({
      id: 'role-1',
      name: 'custom_role',
      isSystem: false,
      scopeType: CpRoleScopeType.PLATFORM,
      permissions: [{ id: 'perm-1' }],
      clientId: null,
    });

    await expect(
      service.removeRolePermission('role-1', 'perm-2', actor, requestIp),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
