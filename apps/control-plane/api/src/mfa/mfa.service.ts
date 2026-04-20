import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';
import { Repository } from 'typeorm';
import { SecurityAuditEvent } from '../common/audit/entities/security-audit-event.entity';
import { User, UserRole } from '../users/entities/user.entity';

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const MFA_MAX_ATTEMPTS = 5;
const MFA_LOCKOUT_MINUTES = 10;
const INSECURE_DEFAULT_SECRETS = new Set([
  'change-this-secret',
  'change-this-refresh-secret',
  'changeme',
  'default',
  'secret',
]);

type MfaState = {
  pendingSecret?: string;
  backupCodeHashes?: string[];
  backupCodesGeneratedAt?: string;
  failedAttempts?: number;
  lockedUntil?: string | null;
};

@Injectable()
export class MfaService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(SecurityAuditEvent)
    private readonly securityAuditRepository: Repository<SecurityAuditEvent>,
  ) {}

  async getStatus(currentUser: User): Promise<Record<string, unknown>> {
    const user = await this.requireUser(currentUser.id);
    const mfaState = this.readMfaState(user);
    const backupCodeCount = mfaState.backupCodeHashes?.length ?? 0;
    return {
      enabled: user.mfaEnabled,
      required: this.isMfaRequired(user),
      hasPendingSetup: Boolean(mfaState.pendingSecret),
      backupCodesRemaining: backupCodeCount,
      locked: this.isUserLocked(mfaState),
      lockedUntil: mfaState.lockedUntil ?? null,
    };
  }

  async getRequirementCheck(currentUser: User): Promise<Record<string, unknown>> {
    const user = await this.requireUser(currentUser.id);
    const required = this.isMfaRequired(user);
    return {
      required,
      enabled: user.mfaEnabled,
      compliant: !required || user.mfaEnabled,
      reason: required ? 'mfa_required_by_policy' : 'mfa_optional',
    };
  }

  async setup(
    currentUser: User,
    appName: string | undefined,
    requestIp: string | null,
  ): Promise<Record<string, unknown>> {
    const user = await this.requireUser(currentUser.id);
    const secret = this.generateBase32Secret();
    const pendingSecret = this.encryptSecret(secret);
    const issuer = this.resolveIssuer(appName);
    const otpAuthUri = this.buildOtpAuthUri(issuer, user.email, secret);

    const mfaState = this.readMfaState(user);
    mfaState.pendingSecret = pendingSecret;
    mfaState.failedAttempts = 0;
    mfaState.lockedUntil = null;
    user.settings = this.writeMfaState(user.settings, mfaState);
    await this.userRepository.save(user);

    await this.recordSecurityAuditEvent({
      action: 'mfa.setup_started',
      actor: user,
      requestIp,
      details: { issuer },
    });

    return {
      issuer,
      accountName: user.email,
      secret,
      otpAuthUri,
      enabled: user.mfaEnabled,
    };
  }

  async enable(
    currentUser: User,
    code: string,
    requestIp: string | null,
  ): Promise<Record<string, unknown>> {
    const user = await this.requireUser(currentUser.id);
    const mfaState = this.readMfaState(user);
    const pendingSecret = mfaState.pendingSecret
      ? this.decryptSecret(mfaState.pendingSecret)
      : null;

    if (!pendingSecret) {
      throw new BadRequestException({
        code: 'MFA_SETUP_REQUIRED',
        message: 'MFA setup must be completed before enabling.',
      });
    }

    this.assertNotLocked(mfaState);
    if (!this.verifyTotpCode(pendingSecret, code)) {
      await this.registerFailedAttempt(user, mfaState, requestIp, 'mfa.enable_failed');
      throw new BadRequestException({
        code: 'MFA_INVALID_CODE',
        message: 'Invalid authentication code.',
      });
    }

    const { rawCodes, hashes } = this.generateBackupCodes();
    user.mfaEnabled = true;
    user.mfaSecret = mfaState.pendingSecret ?? null;
    user.settings = this.writeMfaState(user.settings, {
      backupCodeHashes: hashes,
      backupCodesGeneratedAt: new Date().toISOString(),
      failedAttempts: 0,
      lockedUntil: null,
    });

    await this.userRepository.save(user);
    await this.recordSecurityAuditEvent({
      action: 'mfa.enabled',
      actor: user,
      requestIp,
      details: { backupCodesGenerated: rawCodes.length },
    });

    return {
      enabled: true,
      backupCodes: rawCodes,
      backupCodesCount: rawCodes.length,
    };
  }

  async verify(
    currentUser: User,
    code: string,
    requestIp: string | null,
  ): Promise<Record<string, unknown>> {
    const user = await this.requireUser(currentUser.id);
    const mfaState = this.readMfaState(user);

    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException({
        code: 'MFA_NOT_ENABLED',
        message: 'MFA is not enabled for this user.',
      });
    }

    this.assertNotLocked(mfaState);
    const secret = this.decryptSecret(user.mfaSecret);
    if (this.verifyTotpCode(secret, code)) {
      user.settings = this.writeMfaState(user.settings, {
        ...mfaState,
        failedAttempts: 0,
        lockedUntil: null,
      });
      await this.userRepository.save(user);
      await this.recordSecurityAuditEvent({
        action: 'mfa.verified_totp',
        actor: user,
        requestIp,
        details: {},
      });
      return {
        valid: true,
        method: 'totp',
        backupCodesRemaining: mfaState.backupCodeHashes?.length ?? 0,
      };
    }

    const backupCodeVerification = this.verifyAndConsumeBackupCode(mfaState, code);
    if (backupCodeVerification.valid) {
      user.settings = this.writeMfaState(user.settings, {
        ...mfaState,
        backupCodeHashes: backupCodeVerification.remainingHashes,
        failedAttempts: 0,
        lockedUntil: null,
      });
      await this.userRepository.save(user);
      await this.recordSecurityAuditEvent({
        action: 'mfa.verified_backup_code',
        actor: user,
        requestIp,
        details: {
          remainingBackupCodes: backupCodeVerification.remainingHashes.length,
        },
      });
      return {
        valid: true,
        method: 'backup_code',
        backupCodesRemaining: backupCodeVerification.remainingHashes.length,
      };
    }

    await this.registerFailedAttempt(user, mfaState, requestIp, 'mfa.verify_failed');
    throw new BadRequestException({
      code: 'MFA_INVALID_CODE',
      message: 'Invalid authentication code.',
    });
  }

  async disable(
    currentUser: User,
    code: string,
    requestIp: string | null,
  ): Promise<Record<string, unknown>> {
    const user = await this.requireUser(currentUser.id);
    const verification = await this.verify(currentUser, code, requestIp);
    if (!verification.valid) {
      throw new BadRequestException({
        code: 'MFA_INVALID_CODE',
        message: 'Invalid authentication code.',
      });
    }

    user.mfaEnabled = false;
    user.mfaSecret = null;
    user.settings = this.writeMfaState(user.settings, {
      failedAttempts: 0,
      lockedUntil: null,
    });
    await this.userRepository.save(user);
    await this.recordSecurityAuditEvent({
      action: 'mfa.disabled',
      actor: user,
      requestIp,
      details: {
        verifiedMethod: verification.method,
      },
    });
    return { enabled: false };
  }

  async regenerateBackupCodes(
    currentUser: User,
    code: string,
    requestIp: string | null,
  ): Promise<Record<string, unknown>> {
    const user = await this.requireUser(currentUser.id);
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException({
        code: 'MFA_NOT_ENABLED',
        message: 'MFA is not enabled for this user.',
      });
    }

    await this.verify(currentUser, code, requestIp);
    const { rawCodes, hashes } = this.generateBackupCodes();
    const mfaState = this.readMfaState(user);
    user.settings = this.writeMfaState(user.settings, {
      ...mfaState,
      backupCodeHashes: hashes,
      backupCodesGeneratedAt: new Date().toISOString(),
      failedAttempts: 0,
      lockedUntil: null,
    });

    await this.userRepository.save(user);
    await this.recordSecurityAuditEvent({
      action: 'mfa.backup_codes_regenerated',
      actor: user,
      requestIp,
      details: {
        backupCodesGenerated: rawCodes.length,
      },
    });
    return {
      backupCodes: rawCodes,
      backupCodesCount: rawCodes.length,
    };
  }

  private readMfaState(user: User): MfaState {
    const settings = (user.settings ?? {}) as Record<string, unknown>;
    const security = ((settings.security ?? {}) as Record<string, unknown>) || {};
    const mfa = ((security.mfa ?? {}) as Record<string, unknown>) || {};
    return {
      pendingSecret: typeof mfa.pendingSecret === 'string' ? mfa.pendingSecret : undefined,
      backupCodeHashes: Array.isArray(mfa.backupCodeHashes)
        ? mfa.backupCodeHashes.filter((value): value is string => typeof value === 'string')
        : [],
      backupCodesGeneratedAt:
        typeof mfa.backupCodesGeneratedAt === 'string' ? mfa.backupCodesGeneratedAt : undefined,
      failedAttempts:
        typeof mfa.failedAttempts === 'number' && Number.isFinite(mfa.failedAttempts)
          ? mfa.failedAttempts
          : 0,
      lockedUntil: typeof mfa.lockedUntil === 'string' ? mfa.lockedUntil : null,
    };
  }

  private writeMfaState(
    currentSettings: Record<string, unknown> | null | undefined,
    mfaState: MfaState,
  ): Record<string, unknown> {
    const settings = { ...((currentSettings ?? {}) as Record<string, unknown>) };
    const security = { ...((settings.security as Record<string, unknown>) ?? {}) };
    security.mfa = {
      pendingSecret: mfaState.pendingSecret,
      backupCodeHashes: mfaState.backupCodeHashes ?? [],
      backupCodesGeneratedAt: mfaState.backupCodesGeneratedAt ?? null,
      failedAttempts: mfaState.failedAttempts ?? 0,
      lockedUntil: mfaState.lockedUntil ?? null,
    };
    settings.security = security;
    return settings;
  }

  private resolveIssuer(appName?: string): string {
    if (appName && appName.trim()) {
      return appName.trim();
    }
    return this.configService.get<string>('MFA_ISSUER', 'SkuldBot');
  }

  private buildOtpAuthUri(issuer: string, email: string, secret: string): string {
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedLabel = encodeURIComponent(`${issuer}:${email}`);
    return `otpauth://totp/${encodedLabel}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
  }

  private verifyTotpCode(secret: string, code: string): boolean {
    const normalizedCode = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalizedCode)) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    for (const stepOffset of [-1, 0, 1]) {
      const candidate = this.generateTotp(secret, now + stepOffset * TOTP_STEP_SECONDS);
      if (timingSafeEqual(Buffer.from(candidate), Buffer.from(normalizedCode))) {
        return true;
      }
    }
    return false;
  }

  private generateTotp(secret: string, timestampSeconds: number): string {
    const counter = Math.floor(timestampSeconds / TOTP_STEP_SECONDS);
    const key = this.decodeBase32(secret);
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32BE(0, 0);
    buffer.writeUInt32BE(counter, 4);
    const hmac = createHmac('sha1', key).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    const token = binary % 10 ** TOTP_DIGITS;
    return token.toString().padStart(TOTP_DIGITS, '0');
  }

  private generateBase32Secret(): string {
    const bytes = randomBytes(20);
    return this.encodeBase32(bytes);
  }

  private encodeBase32(buffer: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';

    for (const byte of buffer) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }

    return output;
  }

  private decodeBase32(value: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const normalized = value.toUpperCase().replace(/=+$/g, '');
    let bits = 0;
    let acc = 0;
    const bytes: number[] = [];

    for (const char of normalized) {
      const index = alphabet.indexOf(char);
      if (index < 0) {
        continue;
      }
      acc = (acc << 5) | index;
      bits += 5;
      if (bits >= 8) {
        bytes.push((acc >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }

    return Buffer.from(bytes);
  }

  private generateBackupCodes(): { rawCodes: string[]; hashes: string[] } {
    const rawCodes = Array.from({ length: 8 }).map(() =>
      randomBytes(4).toString('hex').toUpperCase(),
    );
    const hashes = rawCodes.map((code) => this.hashBackupCode(code));
    return { rawCodes, hashes };
  }

  private verifyAndConsumeBackupCode(
    mfaState: MfaState,
    code: string,
  ): { valid: boolean; remainingHashes: string[] } {
    const hashes = [...(mfaState.backupCodeHashes ?? [])];
    if (hashes.length === 0) {
      return { valid: false, remainingHashes: hashes };
    }

    const candidateHash = this.hashBackupCode(code);
    const index = hashes.findIndex((hash) =>
      timingSafeEqual(Buffer.from(hash), Buffer.from(candidateHash)),
    );
    if (index < 0) {
      return { valid: false, remainingHashes: hashes };
    }

    hashes.splice(index, 1);
    return { valid: true, remainingHashes: hashes };
  }

  private hashBackupCode(code: string): string {
    const normalized = code.trim().replace(/-/g, '').toUpperCase();
    return createHash('sha256').update(normalized).digest('hex');
  }

  private resolveEncryptionKey(): Buffer {
    const seed =
      this.configService.get<string>('MFA_SECRET_ENCRYPTION_KEY') ??
      this.configService.get<string>('JWT_SECRET');
    if (!seed || INSECURE_DEFAULT_SECRETS.has(seed.toLowerCase())) {
      throw new BadRequestException({
        code: 'MFA_ENCRYPTION_KEY_NOT_CONFIGURED',
        message: 'MFA secret encryption key is not configured securely.',
      });
    }
    return createHash('sha256').update(seed).digest();
  }

  private encryptSecret(secret: string): string {
    const key = this.resolveEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${authTag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  private decryptSecret(payload: string): string {
    const [ivRaw, authTagRaw, encryptedRaw] = payload.split('.');
    if (!ivRaw || !authTagRaw || !encryptedRaw) {
      throw new BadRequestException({
        code: 'MFA_SECRET_FORMAT_INVALID',
        message: 'Stored MFA secret format is invalid.',
      });
    }

    const key = this.resolveEncryptionKey();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(authTagRaw, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  private isMfaRequired(user: User): boolean {
    if (this.configService.get<string>('MFA_REQUIRED_FOR_ALL') === 'true') {
      return true;
    }
    if ([UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT].includes(user.role)) {
      return true;
    }
    return this.configService.get<string>('MFA_REQUIRED_FOR_CLIENTS') === 'true';
  }

  private isUserLocked(mfaState: MfaState): boolean {
    if (!mfaState.lockedUntil) {
      return false;
    }
    return new Date(mfaState.lockedUntil).getTime() > Date.now();
  }

  private assertNotLocked(mfaState: MfaState): void {
    if (!this.isUserLocked(mfaState)) {
      return;
    }
    throw new BadRequestException({
      code: 'MFA_CODE_LOCKED',
      message: 'MFA verification is temporarily locked due to repeated failures.',
    });
  }

  private async registerFailedAttempt(
    user: User,
    mfaState: MfaState,
    requestIp: string | null,
    action: string,
  ): Promise<void> {
    const nextAttempts = (mfaState.failedAttempts ?? 0) + 1;
    const nextLock =
      nextAttempts >= MFA_MAX_ATTEMPTS
        ? new Date(Date.now() + MFA_LOCKOUT_MINUTES * 60 * 1000).toISOString()
        : null;
    user.settings = this.writeMfaState(user.settings, {
      ...mfaState,
      failedAttempts: nextAttempts,
      lockedUntil: nextLock,
    });
    await this.userRepository.save(user);
    await this.recordSecurityAuditEvent({
      action,
      actor: user,
      requestIp,
      details: {
        failedAttempts: nextAttempts,
        lockedUntil: nextLock,
      },
    });
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new BadRequestException({
        code: 'USER_NOT_FOUND',
        message: `User ${userId} not found.`,
      });
    }
    return user;
  }

  private async recordSecurityAuditEvent(input: {
    action: string;
    actor: User;
    requestIp: string | null;
    details: Record<string, unknown>;
  }): Promise<void> {
    await this.securityAuditRepository.save(
      this.securityAuditRepository.create({
        category: 'mfa',
        action: input.action,
        targetType: 'user',
        targetId: input.actor.id,
        actorUserId: input.actor.id,
        actorEmail: input.actor.email,
        requestIp: input.requestIp,
        details: input.details,
      }),
    );
  }
}
