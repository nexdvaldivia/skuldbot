import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('locks account after 5 failed attempts and blocks subsequent login', async () => {
    const passwordHash = await argon2.hash('ValidP@ssword123');
    const user = {
      id: 'user-lock',
      email: 'owner@client.com',
      passwordHash,
      role: 'client_admin',
      clientId: 'client-1',
      firstName: 'Owner',
      lastName: 'One',
      roles: [],
      status: 'active',
      failedLoginAttempts: 0,
      lockedUntil: null,
      loginCount: 0,
      isSkuld: () => false,
    } as any;

    const userRepository = {
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn(async (payload: any) => {
        Object.assign(user, payload);
        return user;
      }),
    };

    const loginHistoryRepository = {
      create: jest.fn((payload: any) => payload),
      save: jest.fn(async (payload: any) => payload),
    };

    const passwordHistoryRepository = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((payload: any) => payload),
      save: jest.fn(async (payload: any) => payload),
    };

    const jwtService = {
      sign: jest.fn().mockReturnValue('token'),
      verify: jest.fn(),
    };

    const configService = {
      get: jest.fn((key: string, fallback?: any) => {
        if (key === 'AUTH_LOCKOUT_ATTEMPTS') return 5;
        if (key === 'AUTH_LOCKOUT_MINUTES') return 30;
        if (key === 'PASSWORD_EXPIRY_DAYS') return 90;
        return fallback;
      }),
    };

    const service = new AuthService(
      userRepository as any,
      loginHistoryRepository as any,
      passwordHistoryRepository as any,
      jwtService as any,
      configService as any,
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        service.login({ email: user.email, password: 'WrongP@ssword999' }, { ip: '1.1.1.1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }

    expect(user.failedLoginAttempts).toBe(5);
    expect(user.lockedUntil).toBeInstanceOf(Date);

    await expect(
      service.login({ email: user.email, password: 'ValidP@ssword123' }, { ip: '1.1.1.1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects weak passwords with policy validation', async () => {
    const service = new AuthService(
      { findOne: jest.fn(), save: jest.fn() } as any,
      { create: jest.fn(), save: jest.fn() } as any,
      { find: jest.fn(), create: jest.fn(), save: jest.fn() } as any,
      { sign: jest.fn(), verify: jest.fn() } as any,
      { get: jest.fn((_: string, fallback?: any) => fallback) } as any,
    );

    expect(() => service.assertPasswordPolicy('weakpass')).toThrow();
    expect(() => service.assertPasswordPolicy('StrongP@ssword123')).not.toThrow();
  });

  it('records login history entries', async () => {
    const passwordHash = await argon2.hash('ValidP@ssword123');
    const user = {
      id: 'user-history',
      email: 'history@client.com',
      passwordHash,
      role: 'client_admin',
      clientId: 'client-1',
      firstName: 'History',
      lastName: 'Owner',
      roles: [],
      status: 'active',
      failedLoginAttempts: 0,
      lockedUntil: null,
      loginCount: 0,
      isSkuld: () => false,
    } as any;

    const userRepository = {
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn(async (payload: any) => {
        Object.assign(user, payload);
        return user;
      }),
    };

    const loginHistoryRepository = {
      create: jest.fn((payload: any) => payload),
      save: jest.fn(async (payload: any) => payload),
    };

    const passwordHistoryRepository = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((payload: any) => payload),
      save: jest.fn(async (payload: any) => payload),
    };

    const service = new AuthService(
      userRepository as any,
      loginHistoryRepository as any,
      passwordHistoryRepository as any,
      { sign: jest.fn().mockReturnValue('token'), verify: jest.fn() } as any,
      {
        get: jest.fn((key: string, fallback?: any) => {
          if (key === 'AUTH_LOCKOUT_ATTEMPTS') return 5;
          if (key === 'AUTH_LOCKOUT_MINUTES') return 30;
          return fallback;
        }),
      } as any,
    );

    await expect(
      service.login({ email: user.email, password: 'WrongP@ssword999' }, { ip: '2.2.2.2' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await service.login(
      { email: user.email, password: 'ValidP@ssword123' },
      { ip: '2.2.2.2', userAgent: 'jest-agent' },
    );

    const savedEntries = loginHistoryRepository.save.mock.calls.map((call) => call[0]);
    expect(savedEntries.some((entry: any) => entry.success === false)).toBe(true);
    expect(savedEntries.some((entry: any) => entry.success === true)).toBe(true);
  });
});
