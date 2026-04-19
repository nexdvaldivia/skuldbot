import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SecurityAuditEvent } from '../common/audit/entities/security-audit-event.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { MfaService } from './mfa.service';

describe('MfaService', () => {
  let service: MfaService;
  let currentUser: User;
  let userRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let auditRepository: {
    create: jest.Mock;
    save: jest.Mock;
  };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    currentUser = {
      id: 'user-1',
      email: 'admin@skuld.local',
      role: UserRole.SKULD_ADMIN,
      mfaEnabled: false,
      mfaSecret: null,
      settings: {},
    } as unknown as User;

    userRepository = {
      findOne: jest.fn(async () => ({ ...currentUser })),
      save: jest.fn(async (payload) => {
        currentUser = { ...currentUser, ...payload };
        return currentUser;
      }),
    };

    auditRepository = {
      create: jest.fn((payload) => payload),
      save: jest.fn(async (payload) => payload),
    };

    configService = {
      get: jest.fn((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          MFA_SECRET_ENCRYPTION_KEY: 'skuld-test-mfa-key',
          MFA_ISSUER: 'SkuldBot',
        };
        return values[key] ?? fallback;
      }),
    };

    service = new MfaService(
      configService as unknown as ConfigService,
      userRepository as unknown as Repository<User>,
      auditRepository as unknown as Repository<SecurityAuditEvent>,
    );
  });

  it('creates setup secret and otpauth URI', async () => {
    const setup = await service.setup(currentUser, undefined, '127.0.0.1');
    expect(setup.secret).toBeDefined();
    expect(String(setup.otpAuthUri)).toContain('otpauth://totp/');
  });

  it('enables mfa with valid totp code', async () => {
    const setup = await service.setup(currentUser, undefined, '127.0.0.1');
    const code = (service as any).generateTotp(setup.secret, Math.floor(Date.now() / 1000));

    const enabled = await service.enable(currentUser, code, '127.0.0.1');
    expect(enabled.enabled).toBe(true);
    expect(Array.isArray(enabled.backupCodes)).toBe(true);
    expect(currentUser.mfaEnabled).toBe(true);
  });
});
