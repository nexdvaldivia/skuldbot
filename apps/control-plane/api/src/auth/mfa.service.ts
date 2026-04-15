import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export type MfaVerificationMethod = 'totp' | 'backup_code';

export type MfaEnableResult = {
  secret: string;
  otpauthUri: string;
  backupCodes: string[];
};

export type MfaVerificationResult = {
  verified: true;
  method: MfaVerificationMethod;
};

@Injectable()
export class MfaService {
  private readonly mfaAttemptWindowMs = 60_000;
  private readonly mfaMaxAttemptsPerWindow = 5;
  private readonly attemptRegistry = new Map<string, number[]>();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  async enableMfa(userId: string): Promise<MfaEnableResult> {
    const user = await this.findUser(userId);

    const secret = this.generateBase32Secret();
    const encryptedSecret = this.encryptSecret(secret);

    const backupCodes = this.generateBackupCodes();
    const backupCodeHashes = await Promise.all(backupCodes.map((code) => argon2.hash(code)));

    user.mfaSecret = encryptedSecret;
    user.mfaBackupCodes = backupCodeHashes;
    user.mfaEnabled = false;
    await this.userRepository.save(user);

    return {
      secret,
      otpauthUri: this.buildOtpAuthUri(user.email, secret),
      backupCodes,
    };
  }

  async verifyMfa(userId: string, code: string): Promise<MfaVerificationResult> {
    const user = await this.findUser(userId);
    const normalizedCode = this.normalizeCode(code);

    this.assertRateLimit(user.id);

    const result = await this.tryVerifyCode(user, normalizedCode);
    if (!result) {
      this.markAttemptFailure(user.id);
      throw new BadRequestException({
        code: 'MFA_CODE_INVALID',
        message: 'Provided MFA code is invalid.',
      });
    }

    this.resetAttemptFailures(user.id);
    if (!user.mfaEnabled) {
      user.mfaEnabled = true;
      await this.userRepository.save(user);
    }

    return {
      verified: true,
      method: result,
    };
  }

  async disableMfa(userId: string, code: string): Promise<{ disabled: true }> {
    const user = await this.findUser(userId);
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException({
        code: 'MFA_NOT_ENABLED',
        message: 'MFA is not enabled for this user.',
      });
    }

    await this.verifyMfa(userId, code);

    user.mfaEnabled = false;
    user.mfaSecret = null;
    user.mfaBackupCodes = null;
    await this.userRepository.save(user);

    return { disabled: true };
  }

  async regenerateBackupCodes(userId: string): Promise<{ backupCodes: string[] }> {
    const user = await this.findUser(userId);
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException({
        code: 'MFA_NOT_ENABLED',
        message: 'Enable MFA before regenerating backup codes.',
      });
    }

    const backupCodes = this.generateBackupCodes();
    user.mfaBackupCodes = await Promise.all(backupCodes.map((entry) => argon2.hash(entry)));
    await this.userRepository.save(user);

    return { backupCodes };
  }

  private async findUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `User ${userId} was not found.`,
      });
    }
    return user;
  }

  private buildOtpAuthUri(email: string, secret: string): string {
    const issuer = this.configService.get<string>('MFA_TOTP_ISSUER', 'SkuldBot');
    const label = `${issuer}:${email}`;
    return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(
      issuer,
    )}&algorithm=SHA1&digits=6&period=30`;
  }

  private generateBase32Secret(byteLength = 20): string {
    const bytes = crypto.randomBytes(byteLength);
    return this.base32Encode(bytes);
  }

  private base32Encode(bytes: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';

    for (const byte of bytes) {
      value = (value << 8) | byte;
      bits += 8;

      while (bits >= 5) {
        output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }

    return output;
  }

  private base32Decode(value: string): Buffer {
    const sanitized = value.replace(/=+$/g, '').toUpperCase();
    let bits = 0;
    let acc = 0;
    const output: number[] = [];

    for (const char of sanitized) {
      const index = BASE32_ALPHABET.indexOf(char);
      if (index < 0) {
        continue;
      }

      acc = (acc << 5) | index;
      bits += 5;

      if (bits >= 8) {
        output.push((acc >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }

    return Buffer.from(output);
  }

  private generateTotp(secret: string, timestamp: number): string {
    const step = 30;
    const counter = Math.floor(timestamp / 1000 / step);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));

    const key = this.base32Decode(secret);
    const digest = crypto.createHmac('sha1', key).update(counterBuffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;

    const code =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);

    return (code % 1_000_000).toString().padStart(6, '0');
  }

  private verifyTotp(code: string, secret: string): boolean {
    const now = Date.now();
    const windowOffsets = [-1, 0, 1];

    for (const offset of windowOffsets) {
      const candidate = this.generateTotp(secret, now + offset * 30_000);
      if (this.safeCompare(candidate, code)) {
        return true;
      }
    }

    return false;
  }

  private safeCompare(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  }

  private normalizeCode(code: string): string {
    return code.replace(/\s+/g, '').trim();
  }

  private generateBackupCodes(count = 8): string[] {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    return Array.from({ length: count }, () => {
      const chars = Array.from({ length: 10 }, () => {
        const index = crypto.randomInt(0, alphabet.length);
        return alphabet[index];
      });

      return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
    });
  }

  private async tryVerifyCode(user: User, code: string): Promise<MfaVerificationMethod | null> {
    if (!user.mfaSecret) {
      throw new BadRequestException({
        code: 'MFA_SECRET_MISSING',
        message: 'MFA must be enabled before verification.',
      });
    }

    const decryptedSecret = this.decryptSecret(user.mfaSecret);
    if (this.verifyTotp(code, decryptedSecret)) {
      return 'totp';
    }

    const hashedCodes = user.mfaBackupCodes ?? [];
    for (let index = 0; index < hashedCodes.length; index += 1) {
      const hash = hashedCodes[index];
      if (await argon2.verify(hash, code)) {
        hashedCodes.splice(index, 1);
        user.mfaBackupCodes = hashedCodes;
        await this.userRepository.save(user);
        return 'backup_code';
      }
    }

    return null;
  }

  private encryptSecret(secret: string): string {
    const keySeed =
      this.configService.get<string>('MFA_SECRET_ENCRYPTION_KEY') ??
      this.configService.get<string>('JWT_SECRET', 'change-this-secret');
    const key = crypto.createHash('sha256').update(keySeed).digest();
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `v1.${iv.toString('base64url')}.${authTag.toString('base64url')}.${encrypted.toString(
      'base64url',
    )}`;
  }

  private decryptSecret(encryptedSecret: string): string {
    const [version, ivB64, authTagB64, payloadB64] = encryptedSecret.split('.');
    if (version !== 'v1' || !ivB64 || !authTagB64 || !payloadB64) {
      throw new BadRequestException({
        code: 'MFA_SECRET_INVALID',
        message: 'Stored MFA secret format is invalid.',
      });
    }

    const keySeed =
      this.configService.get<string>('MFA_SECRET_ENCRYPTION_KEY') ??
      this.configService.get<string>('JWT_SECRET', 'change-this-secret');
    const key = crypto.createHash('sha256').update(keySeed).digest();

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64url'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payloadB64, 'base64url')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  private assertRateLimit(userId: string): void {
    const now = Date.now();
    const attempts = this.compactAttempts(userId, now);
    if (attempts.length >= this.mfaMaxAttemptsPerWindow) {
      throw new HttpException(
        {
          code: 'MFA_RATE_LIMITED',
          message: 'Too many MFA attempts. Please retry in one minute.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private markAttemptFailure(userId: string): void {
    const now = Date.now();
    const attempts = this.compactAttempts(userId, now);
    attempts.push(now);
    this.attemptRegistry.set(userId, attempts);
  }

  private resetAttemptFailures(userId: string): void {
    this.attemptRegistry.delete(userId);
  }

  private compactAttempts(userId: string, now: number): number[] {
    const windowStart = now - this.mfaAttemptWindowMs;
    const attempts = this.attemptRegistry.get(userId) ?? [];
    return attempts.filter((ts) => ts >= windowStart);
  }
}
