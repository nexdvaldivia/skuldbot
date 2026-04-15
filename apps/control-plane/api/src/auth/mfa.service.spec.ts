import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import { MfaService } from './mfa.service';

function generateTotp(secret: string, timestamp = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  const base32Decode = (value: string): Buffer => {
    const sanitized = value.replace(/=+$/g, '').toUpperCase();
    let bits = 0;
    let acc = 0;
    const output: number[] = [];

    for (const char of sanitized) {
      const index = alphabet.indexOf(char);
      if (index < 0) continue;
      acc = (acc << 5) | index;
      bits += 5;
      if (bits >= 8) {
        output.push((acc >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }

    return Buffer.from(output);
  };

  const counter = Math.floor(timestamp / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const key = base32Decode(secret);
  const digest = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (code % 1_000_000).toString().padStart(6, '0');
}

describe('MfaService', () => {
  it('enable MFA flow generates secret and backup codes', async () => {
    const user = {
      id: 'user-1',
      email: 'owner@client.com',
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
    } as any;

    const userRepository = {
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn(async (payload: any) => {
        Object.assign(user, payload);
        return user;
      }),
    };

    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'MFA_SECRET_ENCRYPTION_KEY') return 'test-mfa-key';
        if (key === 'MFA_TOTP_ISSUER') return 'SkuldBot';
        return fallback;
      }),
    };

    const service = new MfaService(userRepository as any, configService as any as ConfigService);

    const result = await service.enableMfa(user.id);

    expect(result.secret).toBeTruthy();
    expect(result.otpauthUri).toContain('otpauth://totp');
    expect(result.backupCodes).toHaveLength(8);
    expect(user.mfaEnabled).toBe(false);
    expect(user.mfaSecret).toContain('v1.');
    expect(user.mfaBackupCodes).toHaveLength(8);
    expect(userRepository.save).toHaveBeenCalled();
  });

  it('verifies TOTP code (valid and invalid)', async () => {
    const user = {
      id: 'user-2',
      email: 'owner@client.com',
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: [],
    } as any;

    const userRepository = {
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn(async (payload: any) => {
        Object.assign(user, payload);
        return user;
      }),
    };

    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'MFA_SECRET_ENCRYPTION_KEY') return 'test-mfa-key';
        return fallback;
      }),
    };

    const service = new MfaService(userRepository as any, configService as any as ConfigService);
    const enable = await service.enableMfa(user.id);

    const validCode = generateTotp(enable.secret);
    const verified = await service.verifyMfa(user.id, validCode);

    expect(verified.verified).toBe(true);
    expect(verified.method).toBe('totp');
    expect(user.mfaEnabled).toBe(true);

    await expect(service.verifyMfa(user.id, '000000')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('verifies backup code and marks it as used', async () => {
    const user = {
      id: 'user-3',
      email: 'owner@client.com',
      mfaEnabled: true,
      mfaSecret: null,
      mfaBackupCodes: [],
    } as any;

    const userRepository = {
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn(async (payload: any) => {
        Object.assign(user, payload);
        return user;
      }),
    };

    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'MFA_SECRET_ENCRYPTION_KEY') return 'test-mfa-key';
        return fallback;
      }),
    };

    const service = new MfaService(userRepository as any, configService as any as ConfigService);
    const enable = await service.enableMfa(user.id);
    user.mfaEnabled = true;

    const code = enable.backupCodes[0];
    const originalCount = user.mfaBackupCodes.length;

    const verified = await service.verifyMfa(user.id, code);

    expect(verified.method).toBe('backup_code');
    expect(user.mfaBackupCodes.length).toBe(originalCount - 1);
    await expect(service.verifyMfa(user.id, code)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('disables MFA only with a valid code', async () => {
    const user = {
      id: 'user-4',
      email: 'owner@client.com',
      mfaEnabled: true,
      mfaSecret: null,
      mfaBackupCodes: [],
    } as any;

    const userRepository = {
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn(async (payload: any) => {
        Object.assign(user, payload);
        return user;
      }),
    };

    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'MFA_SECRET_ENCRYPTION_KEY') return 'test-mfa-key';
        return fallback;
      }),
    };

    const service = new MfaService(userRepository as any, configService as any as ConfigService);
    const enable = await service.enableMfa(user.id);
    user.mfaEnabled = true;

    await expect(service.disableMfa(user.id, '111111')).rejects.toBeInstanceOf(BadRequestException);

    const validCode = generateTotp(enable.secret);
    const result = await service.disableMfa(user.id, validCode);

    expect(result.disabled).toBe(true);
    expect(user.mfaEnabled).toBe(false);
    expect(user.mfaSecret).toBeNull();
    expect(user.mfaBackupCodes).toBeNull();
  });
});
