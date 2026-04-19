import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { StorageProvider } from '../common/interfaces/integration.interface';
import { Client } from '../clients/entities/client.entity';
import { CpRole } from '../rbac/entities/cp-role.entity';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { UsersService } from './users.service';

type RepoMock = {
  findOne: jest.Mock;
  save: jest.Mock;
  remove: jest.Mock;
  find: jest.Mock;
  count: jest.Mock;
  create: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function createRepoMock(): RepoMock {
  return {
    findOne: jest.fn(),
    save: jest.fn(async (payload) => payload),
    remove: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    create: jest.fn((payload) => payload),
    createQueryBuilder: jest.fn(),
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: RepoMock;
  let clientRepository: RepoMock;
  let roleRepository: RepoMock;
  let storageProvider: jest.Mocked<StorageProvider>;

  beforeEach(() => {
    userRepository = createRepoMock();
    clientRepository = createRepoMock();
    roleRepository = createRepoMock();
    storageProvider = {
      name: 'storage-test',
      type: 'storage' as never,
      isConfigured: jest.fn().mockReturnValue(true),
      healthCheck: jest.fn(),
      upload: jest.fn(),
      download: jest.fn(),
      delete: jest.fn(),
      getSignedUrl: jest.fn().mockResolvedValue('https://signed-url/avatar.png'),
      list: jest.fn(),
    } as unknown as jest.Mocked<StorageProvider>;

    service = new UsersService(
      userRepository as unknown as Repository<User>,
      clientRepository as unknown as Repository<Client>,
      roleRepository as unknown as Repository<CpRole>,
      storageProvider,
    );
  });

  it('returns aggregate user stats', async () => {
    userRepository.count.mockResolvedValueOnce(5).mockResolvedValueOnce(3);
    userRepository.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { role: UserRole.SKULD_ADMIN, count: '1' },
        { role: UserRole.CLIENT_USER, count: '4' },
      ]),
    });

    const result = await service.getStats();

    expect(result.totalUsers).toBe(5);
    expect(result.activeUsers).toBe(3);
    expect(result.inactiveUsers).toBe(2);
    expect(result.byRole.client_user).toBe(4);
  });

  it('toggles user status between active and suspended', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      status: UserStatus.ACTIVE,
      roles: [],
      clientId: null,
    });

    const result = await service.toggleActive('user-1', { id: 'admin-1' } as User);

    expect(result.status).toBe(UserStatus.SUSPENDED);
    expect(userRepository.save).toHaveBeenCalled();
  });

  it('prevents toggling own status', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'self-user',
      status: UserStatus.ACTIVE,
      roles: [],
      clientId: null,
    });

    await expect(
      service.toggleActive('self-user', { id: 'self-user' } as User),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects invalid avatar content type', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-avatar',
      status: UserStatus.ACTIVE,
      roles: [],
      clientId: null,
    });

    await expect(
      service.uploadAvatar('user-avatar', {
        contentType: 'application/pdf',
        contentBase64: Buffer.from('sample').toString('base64'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
