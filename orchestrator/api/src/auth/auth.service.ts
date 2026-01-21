import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { User, UserStatus, AuthProvider } from '../users/entities/user.entity';
import { RefreshToken } from '../users/entities/api-key.entity';
import { Session } from '../users/entities/api-key.entity';
import { Role } from '../roles/entities/role.entity';
import { AuditLog, AuditCategory, AuditAction, AuditResult } from '../audit/entities/audit-log.entity';
import { PasswordService, TokenService } from '../common/crypto/password.service';
import { JwtPayload } from './strategies/jwt.strategy';
import {
  LoginDto,
  LoginResponseDto,
  MfaRequiredResponseDto,
  RegisterDto,
  RegisterResponseDto,
  RefreshTokenDto,
  TokenResponseDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  VerifyEmailDto,
  EnableMfaResponseDto,
  ImpersonateUserDto,
  ImpersonateResponseDto,
} from './dto/auth.dto';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';

/**
 * Enterprise Authentication Service.
 *
 * Handles all authentication flows:
 * - Local login with email/password
 * - MFA (TOTP)
 * - Token management (JWT + Refresh tokens with rotation)
 * - Password reset
 * - Email verification
 * - Session management
 * - User impersonation (admin only)
 *
 * Security features:
 * - Argon2id password hashing
 * - Refresh token rotation with family tracking
 * - Account lockout after failed attempts
 * - Audit logging for all auth events
 * - Session tracking per device
 */
@Injectable()
export class AuthService {
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;
  private readonly maxFailedAttempts: number;
  private readonly lockoutDuration: number;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {
    this.accessTokenExpiry = this.configService.get('JWT_ACCESS_EXPIRY', '15m');
    this.refreshTokenExpiry = this.configService.get('JWT_REFRESH_EXPIRY', '7d');
    this.maxFailedAttempts = this.configService.get('AUTH_MAX_FAILED_ATTEMPTS', 5);
    this.lockoutDuration = this.configService.get('AUTH_LOCKOUT_DURATION', 30 * 60 * 1000); // 30 min
  }

  // ============================================================================
  // LOGIN
  // ============================================================================

  async login(
    dto: LoginDto,
    clientInfo: { ip: string; userAgent: string },
  ): Promise<LoginResponseDto | MfaRequiredResponseDto> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
      relations: ['roles', 'roles.permissions', 'tenant'],
    });

    if (!user) {
      // Don't reveal whether email exists
      await this.auditLoginFailure(null, dto.email, 'USER_NOT_FOUND', clientInfo);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    // Check account lockout
    if (await this.isAccountLocked(user)) {
      await this.auditLoginFailure(user, dto.email, 'ACCOUNT_LOCKED', clientInfo);
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked due to too many failed attempts.',
      });
    }

    // Check user status
    if (user.status === UserStatus.SUSPENDED) {
      await this.auditLoginFailure(user, dto.email, 'ACCOUNT_SUSPENDED', clientInfo);
      throw new UnauthorizedException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended. Please contact support.',
      });
    }

    if (user.status === UserStatus.DEACTIVATED) {
      await this.auditLoginFailure(user, dto.email, 'ACCOUNT_DEACTIVATED', clientInfo);
      throw new UnauthorizedException({
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Your account has been deactivated.',
      });
    }

    // Verify password
    if (user.authProvider !== AuthProvider.LOCAL || !user.passwordHash) {
      await this.auditLoginFailure(user, dto.email, 'SSO_REQUIRED', clientInfo);
      throw new UnauthorizedException({
        code: 'SSO_REQUIRED',
        message: `Please login using ${user.authProvider}.`,
      });
    }

    const passwordValid = await this.passwordService.verifyPassword(
      dto.password,
      user.passwordHash,
    );

    if (!passwordValid) {
      await this.handleFailedLogin(user, clientInfo);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    // Check MFA
    if (user.mfaEnabled) {
      if (!dto.mfaCode && !dto.backupCode) {
        // Return MFA challenge
        const sessionToken = await this.createMfaSession(user);
        return {
          mfaRequired: true,
          mfaMethod: 'totp',
          sessionToken,
        };
      }

      // Verify MFA
      const mfaValid = dto.backupCode
        ? await this.verifyBackupCode(user, dto.backupCode)
        : this.verifyTotpCode(user, dto.mfaCode!);

      if (!mfaValid) {
        await this.handleFailedLogin(user, clientInfo);
        throw new UnauthorizedException({
          code: 'INVALID_MFA_CODE',
          message: 'Invalid MFA code.',
        });
      }
    }

    // Check email verification
    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new UnauthorizedException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email before logging in.',
      });
    }

    // Successful login
    await this.clearFailedAttempts(user);
    return this.createAuthSession(user, clientInfo, dto.rememberMe);
  }

  // ============================================================================
  // REGISTRATION
  // ============================================================================

  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    // Check if email exists
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException({
        code: 'EMAIL_EXISTS',
        message: 'An account with this email already exists.',
      });
    }

    // Determine tenant
    let tenantId = dto.tenantId;
    if (dto.invitationToken) {
      // Handle invitation flow
      // TODO: Implement invitation validation
      throw new BadRequestException('Invitation system not yet implemented');
    } else if (!tenantId && dto.organizationName) {
      // Create new tenant for self-service registration
      // TODO: Implement tenant creation
      throw new BadRequestException('Self-service tenant creation not yet implemented');
    } else if (!tenantId) {
      throw new BadRequestException({
        code: 'TENANT_REQUIRED',
        message: 'Either invitation token or organization name is required.',
      });
    }

    // Hash password
    const passwordHash = await this.passwordService.hashPassword(dto.password);

    // Create user
    const user = this.userRepository.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      tenantId,
      status: UserStatus.PENDING_VERIFICATION,
      authProvider: AuthProvider.LOCAL,
    });

    // Assign default role
    const defaultRole = await this.roleRepository.findOne({
      where: { tenantId, name: 'viewer' },
    });
    if (defaultRole) {
      user.roles = [defaultRole];
    }

    // Generate email verification token
    user.emailVerificationToken = this.tokenService.generateSecureToken();
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await this.userRepository.save(user);

    // TODO: Send verification email

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      message: 'Registration successful. Please check your email to verify your account.',
      verificationRequired: true,
    };
  }

  // ============================================================================
  // TOKEN REFRESH
  // ============================================================================

  async refreshToken(
    dto: RefreshTokenDto,
    clientInfo: { ip: string; userAgent: string },
  ): Promise<TokenResponseDto> {
    // Verify refresh token
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token.',
      });
    }

    // Check if token is in database and not revoked
    const tokenHash = await this.passwordService.hashToken(dto.refreshToken);
    const storedToken = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!storedToken) {
      throw new UnauthorizedException({
        code: 'TOKEN_NOT_FOUND',
        message: 'Refresh token not found.',
      });
    }

    // Check for token reuse (security: detect token theft)
    if (storedToken.isUsed) {
      // Token reuse detected! Revoke all tokens in this family
      await this.revokeTokenFamily(storedToken.familyId);
      await this.auditSecurityEvent(
        storedToken.user,
        'TOKEN_REUSE_DETECTED',
        'Possible token theft detected. All sessions revoked.',
        clientInfo,
      );
      throw new UnauthorizedException({
        code: 'TOKEN_REUSED',
        message: 'Security violation detected. Please login again.',
      });
    }

    if (storedToken.isRevoked) {
      throw new UnauthorizedException({
        code: 'TOKEN_REVOKED',
        message: 'Refresh token has been revoked.',
      });
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'TOKEN_EXPIRED',
        message: 'Refresh token has expired.',
      });
    }

    // Load fresh user data
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: ['roles', 'roles.permissions'],
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: 'USER_INVALID',
        message: 'User account is not valid.',
      });
    }

    // Mark current token as used (single use)
    storedToken.isUsed = true;
    await this.refreshTokenRepository.save(storedToken);

    // Generate new token pair (rotation)
    const tokens = await this.generateTokenPair(user, storedToken.familyId);

    // Update session
    const session = await this.sessionRepository.findOne({
      where: { id: payload.sessionId },
    });
    if (session) {
      session.lastActiveAt = new Date();
      session.refreshTokenId = tokens.refreshTokenId;
      await this.sessionRepository.save(session);
    }

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: this.parseExpiryToSeconds(this.accessTokenExpiry),
      tokenType: 'Bearer',
    };
  }

  // ============================================================================
  // LOGOUT
  // ============================================================================

  async logout(userId: string, sessionId?: string): Promise<void> {
    if (sessionId) {
      // Logout specific session
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId, userId },
      });
      if (session) {
        // Revoke associated refresh token
        if (session.refreshTokenId) {
          await this.refreshTokenRepository.update(
            { id: session.refreshTokenId },
            { isRevoked: true, revokedAt: new Date() },
          );
        }
        await this.sessionRepository.delete({ id: sessionId });
      }
    } else {
      // Logout all sessions for user
      const sessions = await this.sessionRepository.find({
        where: { userId },
      });
      for (const session of sessions) {
        if (session.refreshTokenId) {
          await this.refreshTokenRepository.update(
            { id: session.refreshTokenId },
            { isRevoked: true, revokedAt: new Date() },
          );
        }
      }
      await this.sessionRepository.delete({ userId });
    }
  }

  // ============================================================================
  // PASSWORD MANAGEMENT
  // ============================================================================

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    // Always return success to prevent email enumeration
    const successMessage = 'If an account exists with this email, you will receive a password reset link.';

    if (!user || user.authProvider !== AuthProvider.LOCAL) {
      return { message: successMessage };
    }

    // Generate reset token
    const resetToken = this.tokenService.generateSecureToken();
    const resetTokenHash = await this.passwordService.hashToken(resetToken);

    user.passwordResetToken = resetTokenHash;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.userRepository.save(user);

    // TODO: Send password reset email with resetToken

    return { message: successMessage };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    // Hash the token to compare
    const tokenHash = await this.passwordService.hashToken(dto.token);

    const user = await this.userRepository.findOne({
      where: {
        passwordResetToken: tokenHash,
        passwordResetExpires: MoreThan(new Date()),
      },
    });

    if (!user) {
      throw new BadRequestException({
        code: 'INVALID_RESET_TOKEN',
        message: 'Invalid or expired password reset token.',
      });
    }

    // Check password history (prevent reuse of last 5 passwords)
    if (user.passwordHistory && user.passwordHistory.length > 0) {
      for (const oldHash of user.passwordHistory.slice(-5)) {
        if (await this.passwordService.verifyPassword(dto.newPassword, oldHash)) {
          throw new BadRequestException({
            code: 'PASSWORD_REUSED',
            message: 'Cannot reuse any of your last 5 passwords.',
          });
        }
      }
    }

    // Update password
    const newPasswordHash = await this.passwordService.hashPassword(dto.newPassword);

    user.passwordHash = newPasswordHash;
    user.passwordChangedAt = new Date();
    user.passwordResetToken = undefined!;
    user.passwordResetExpires = undefined!;
    user.passwordHistory = [...(user.passwordHistory || []), user.passwordHash].slice(-5);

    await this.userRepository.save(user);

    // Revoke all sessions (force re-login)
    await this.logout(user.id);

    return { message: 'Password has been reset successfully. Please login with your new password.' };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    clientInfo: { ip: string; userAgent: string },
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const currentPasswordValid = await this.passwordService.verifyPassword(
      dto.currentPassword,
      user.passwordHash!,
    );

    if (!currentPasswordValid) {
      await this.auditSecurityEvent(
        user,
        'INVALID_PASSWORD_CHANGE',
        'Failed password change attempt - incorrect current password',
        clientInfo,
      );
      throw new UnauthorizedException({
        code: 'INVALID_PASSWORD',
        message: 'Current password is incorrect.',
      });
    }

    // Check password history
    if (user.passwordHistory && user.passwordHistory.length > 0) {
      for (const oldHash of user.passwordHistory.slice(-5)) {
        if (await this.passwordService.verifyPassword(dto.newPassword, oldHash)) {
          throw new BadRequestException({
            code: 'PASSWORD_REUSED',
            message: 'Cannot reuse any of your last 5 passwords.',
          });
        }
      }
    }

    // Update password
    const newPasswordHash = await this.passwordService.hashPassword(dto.newPassword);

    user.passwordHash = newPasswordHash;
    user.passwordChangedAt = new Date();
    user.passwordHistory = [...(user.passwordHistory || []), user.passwordHash].slice(-5);

    await this.userRepository.save(user);

    await this.auditSecurityEvent(
      user,
      'PASSWORD_CHANGED',
      'User changed their password',
      clientInfo,
    );

    return { message: 'Password changed successfully.' };
  }

  // ============================================================================
  // EMAIL VERIFICATION
  // ============================================================================

  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: {
        emailVerificationToken: dto.token,
        emailVerificationExpires: MoreThan(new Date()),
      },
    });

    if (!user) {
      throw new BadRequestException({
        code: 'INVALID_VERIFICATION_TOKEN',
        message: 'Invalid or expired verification token.',
      });
    }

    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerificationToken = undefined!;
    user.emailVerificationExpires = undefined!;
    user.status = UserStatus.ACTIVE;

    await this.userRepository.save(user);

    return { message: 'Email verified successfully. You can now login.' };
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });

    if (!user || user.emailVerified) {
      // Don't reveal whether email exists
      return { message: 'If an unverified account exists, a new verification email will be sent.' };
    }

    user.emailVerificationToken = this.tokenService.generateSecureToken();
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.userRepository.save(user);

    // TODO: Send verification email

    return { message: 'If an unverified account exists, a new verification email will be sent.' };
  }

  // ============================================================================
  // MFA
  // ============================================================================

  async enableMfa(userId: string, password: string): Promise<EnableMfaResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify password
    const passwordValid = await this.passwordService.verifyPassword(
      password,
      user.passwordHash!,
    );

    if (!passwordValid) {
      throw new UnauthorizedException({
        code: 'INVALID_PASSWORD',
        message: 'Invalid password.',
      });
    }

    if (user.mfaEnabled) {
      throw new BadRequestException({
        code: 'MFA_ALREADY_ENABLED',
        message: 'MFA is already enabled for this account.',
      });
    }

    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `SkuldBot (${user.email})`,
      length: 32,
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    // Generate backup codes
    const backupCodes = this.tokenService.generateBackupCodes(10);
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => this.passwordService.hashToken(code)),
    );

    // Save temporarily (will be confirmed after TOTP verification)
    user.mfaSecret = secret.base32;
    user.mfaBackupCodes = hashedBackupCodes;

    await this.userRepository.save(user);

    return {
      secret: secret.base32,
      qrCodeUrl,
      backupCodes,
    };
  }

  async verifyAndEnableMfa(userId: string, code: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user || !user.mfaSecret) {
      throw new BadRequestException('MFA setup not initiated');
    }

    if (user.mfaEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    const verified = this.verifyTotpCode(user, code);

    if (!verified) {
      throw new UnauthorizedException({
        code: 'INVALID_MFA_CODE',
        message: 'Invalid MFA code. Please try again.',
      });
    }

    user.mfaEnabled = true;
    user.mfaEnabledAt = new Date();

    await this.userRepository.save(user);

    return { message: 'MFA has been enabled successfully.' };
  }

  async disableMfa(
    userId: string,
    password: string,
    code: string,
    clientInfo: { ip: string; userAgent: string },
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.mfaEnabled) {
      throw new BadRequestException('MFA is not enabled');
    }

    // Verify password
    const passwordValid = await this.passwordService.verifyPassword(
      password,
      user.passwordHash!,
    );

    if (!passwordValid) {
      throw new UnauthorizedException({
        code: 'INVALID_PASSWORD',
        message: 'Invalid password.',
      });
    }

    // Verify MFA code
    const mfaValid = this.verifyTotpCode(user, code);

    if (!mfaValid) {
      throw new UnauthorizedException({
        code: 'INVALID_MFA_CODE',
        message: 'Invalid MFA code.',
      });
    }

    user.mfaEnabled = false;
    user.mfaSecret = undefined!;
    user.mfaBackupCodes = [];
    user.mfaEnabledAt = undefined!;

    await this.userRepository.save(user);

    await this.auditSecurityEvent(
      user,
      'MFA_DISABLED',
      'User disabled MFA',
      clientInfo,
    );

    return { message: 'MFA has been disabled.' };
  }

  async regenerateBackupCodes(
    userId: string,
    password: string,
    code: string,
  ): Promise<{ backupCodes: string[] }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.mfaEnabled) {
      throw new BadRequestException('MFA is not enabled');
    }

    // Verify password and MFA
    const passwordValid = await this.passwordService.verifyPassword(
      password,
      user.passwordHash!,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    const mfaValid = this.verifyTotpCode(user, code);

    if (!mfaValid) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    // Generate new backup codes
    const backupCodes = this.tokenService.generateBackupCodes(10);
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((c) => this.passwordService.hashToken(c)),
    );

    user.mfaBackupCodes = hashedBackupCodes;
    await this.userRepository.save(user);

    return { backupCodes };
  }

  // ============================================================================
  // IMPERSONATION
  // ============================================================================

  async impersonateUser(
    adminUser: User,
    dto: ImpersonateUserDto,
    clientInfo: { ip: string; userAgent: string },
  ): Promise<ImpersonateResponseDto> {
    // Only super admins can impersonate
    const isSuperAdmin = adminUser.roles.some((r) => r.name === 'super_admin');
    if (!isSuperAdmin) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Only super admins can impersonate users.',
      });
    }

    const targetUser = await this.userRepository.findOne({
      where: { id: dto.userId },
      relations: ['roles', 'roles.permissions'],
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // Cannot impersonate another super admin
    const targetIsSuperAdmin = targetUser.roles.some((r) => r.name === 'super_admin');
    if (targetIsSuperAdmin) {
      throw new ForbiddenException({
        code: 'CANNOT_IMPERSONATE_ADMIN',
        message: 'Cannot impersonate another super admin.',
      });
    }

    // Create impersonation session
    const familyId = this.tokenService.generateSessionId();
    const sessionId = this.tokenService.generateSessionId();

    const session = this.sessionRepository.create({
      id: sessionId,
      userId: targetUser.id,
      tenantId: targetUser.tenantId,
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      deviceName: 'Impersonation Session',
      isImpersonation: true,
      impersonatedBy: adminUser.id,
    });

    await this.sessionRepository.save(session);

    // Generate tokens with impersonation flag
    const payload: JwtPayload = {
      sub: targetUser.id,
      email: targetUser.email,
      tenantId: targetUser.tenantId,
      roles: targetUser.roles.map((r) => r.name),
      sessionId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.parseExpiryToSeconds(this.accessTokenExpiry),
    };

    const accessToken = this.jwtService.sign(payload);
    const { refreshToken } = await this.createRefreshToken(targetUser, familyId);

    // Audit impersonation
    await this.auditRepository.save({
      tenantId: targetUser.tenantId,
      userId: adminUser.id,
      userEmail: adminUser.email,
      category: AuditCategory.SECURITY,
      action: AuditAction.IMPERSONATE,
      result: AuditResult.SUCCESS,
      resourceType: 'user',
      resourceId: targetUser.id,
      resourceName: targetUser.email,
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      metadata: {
        reason: dto.reason,
        impersonatedUser: targetUser.email,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiryToSeconds(this.accessTokenExpiry),
      tokenType: 'Bearer',
      impersonating: {
        id: targetUser.id,
        email: targetUser.email,
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
      },
      originalUser: {
        id: adminUser.id,
        email: adminUser.email,
      },
    };
  }

  // ============================================================================
  // SESSIONS
  // ============================================================================

  async getSessions(userId: string): Promise<Session[]> {
    return this.sessionRepository.find({
      where: { userId },
      order: { lastActiveAt: 'DESC' },
    });
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.refreshTokenId) {
      await this.refreshTokenRepository.update(
        { id: session.refreshTokenId },
        { isRevoked: true, revokedAt: new Date() },
      );
    }

    await this.sessionRepository.delete({ id: sessionId });
  }

  async revokeAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
    const sessions = await this.sessionRepository.find({
      where: { userId },
    });

    for (const session of sessions) {
      if (exceptSessionId && session.id === exceptSessionId) {
        continue;
      }

      if (session.refreshTokenId) {
        await this.refreshTokenRepository.update(
          { id: session.refreshTokenId },
          { isRevoked: true, revokedAt: new Date() },
        );
      }

      await this.sessionRepository.delete({ id: session.id });
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async createAuthSession(
    user: User,
    clientInfo: { ip: string; userAgent: string },
    rememberMe?: boolean,
  ): Promise<LoginResponseDto> {
    const familyId = this.tokenService.generateSessionId();
    const sessionId = this.tokenService.generateSessionId();

    // Create session
    const session = this.sessionRepository.create({
      id: sessionId,
      userId: user.id,
      tenantId: user.tenantId,
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      deviceName: this.parseDeviceName(clientInfo.userAgent),
    });

    await this.sessionRepository.save(session);

    // Generate tokens
    const tokens = await this.generateTokenPair(user, familyId, sessionId, rememberMe);

    // Update session with refresh token reference
    session.refreshTokenId = tokens.refreshTokenId;
    await this.sessionRepository.save(session);

    // Update user last login
    user.lastLoginAt = new Date();
    user.lastLoginIp = clientInfo.ip;
    await this.userRepository.save(user);

    // Audit successful login
    await this.auditRepository.save({
      tenantId: user.tenantId,
      userId: user.id,
      userEmail: user.email,
      category: AuditCategory.AUTH,
      action: AuditAction.LOGIN,
      result: AuditResult.SUCCESS,
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      sessionId,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: this.parseExpiryToSeconds(this.accessTokenExpiry),
      tokenType: 'Bearer',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tenantId: user.tenantId,
        roles: user.roles.map((r) => r.name),
        mfaEnabled: user.mfaEnabled,
      },
    };
  }

  private async generateTokenPair(
    user: User,
    familyId: string,
    sessionId?: string,
    rememberMe?: boolean,
  ): Promise<{ accessToken: string; refreshToken: string; refreshTokenId: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      roles: user.roles.map((r) => r.name),
      sessionId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.parseExpiryToSeconds(this.accessTokenExpiry),
    };

    const accessToken = this.jwtService.sign(payload);
    const { refreshToken, tokenId } = await this.createRefreshToken(user, familyId, rememberMe);

    return { accessToken, refreshToken, refreshTokenId: tokenId };
  }

  private async createRefreshToken(
    user: User,
    familyId: string,
    rememberMe?: boolean,
  ): Promise<{ refreshToken: string; tokenId: string }> {
    const expiry = rememberMe ? '30d' : this.refreshTokenExpiry;

    const refreshPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      roles: user.roles.map((r) => r.name),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.parseExpiryToSeconds(expiry),
    };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
    });

    const tokenHash = await this.passwordService.hashToken(refreshToken);

    const storedToken = this.refreshTokenRepository.create({
      tokenHash,
      userId: user.id,
      tenantId: user.tenantId,
      familyId,
      expiresAt: new Date(Date.now() + this.parseExpiryToSeconds(expiry) * 1000),
    });

    await this.refreshTokenRepository.save(storedToken);

    return { refreshToken, tokenId: storedToken.id };
  }

  private async isAccountLocked(user: User): Promise<boolean> {
    if (!user.lockoutUntil) return false;
    if (user.lockoutUntil < new Date()) {
      // Lockout expired, clear it
      user.lockoutUntil = undefined!;
      user.failedLoginAttempts = 0;
      await this.userRepository.save(user);
      return false;
    }
    return true;
  }

  private async handleFailedLogin(
    user: User,
    clientInfo: { ip: string; userAgent: string },
  ): Promise<void> {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

    if (user.failedLoginAttempts >= this.maxFailedAttempts) {
      user.lockoutUntil = new Date(Date.now() + this.lockoutDuration);
      await this.auditSecurityEvent(
        user,
        'ACCOUNT_LOCKED',
        `Account locked after ${this.maxFailedAttempts} failed attempts`,
        clientInfo,
      );
    }

    await this.userRepository.save(user);
    await this.auditLoginFailure(user, user.email, 'INVALID_PASSWORD', clientInfo);
  }

  private async clearFailedAttempts(user: User): Promise<void> {
    if (user.failedLoginAttempts > 0 || user.lockoutUntil) {
      user.failedLoginAttempts = 0;
      user.lockoutUntil = undefined!;
      await this.userRepository.save(user);
    }
  }

  private async revokeTokenFamily(familyId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { familyId },
      { isRevoked: true, revokedAt: new Date() },
    );
  }

  private async createMfaSession(user: User): Promise<string> {
    // Create a short-lived token for MFA completion
    const payload = {
      sub: user.id,
      type: 'mfa_challenge',
      exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
    };

    return this.jwtService.sign(payload);
  }

  private verifyTotpCode(user: User, code: string): boolean {
    if (!user.mfaSecret) return false;

    return speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: code,
      window: 1, // Allow 1 step before/after for clock drift
    });
  }

  private async verifyBackupCode(user: User, code: string): Promise<boolean> {
    if (!user.mfaBackupCodes || user.mfaBackupCodes.length === 0) {
      return false;
    }

    for (let i = 0; i < user.mfaBackupCodes.length; i++) {
      const match = await this.passwordService.verifyToken(code, user.mfaBackupCodes[i]);
      if (match) {
        // Remove used backup code
        user.mfaBackupCodes.splice(i, 1);
        await this.userRepository.save(user);
        return true;
      }
    }

    return false;
  }

  private async auditLoginFailure(
    user: User | null,
    email: string,
    reason: string,
    clientInfo: { ip: string; userAgent: string },
  ): Promise<void> {
    await this.auditRepository.save({
      tenantId: user?.tenantId,
      userId: user?.id,
      userEmail: email,
      category: AuditCategory.AUTH,
      action: AuditAction.LOGIN,
      result: AuditResult.FAILURE,
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      errorCode: reason,
      errorMessage: `Login failed: ${reason}`,
    });
  }

  private async auditSecurityEvent(
    user: User,
    event: string,
    description: string,
    clientInfo: { ip: string; userAgent: string },
  ): Promise<void> {
    await this.auditRepository.save({
      tenantId: user.tenantId,
      userId: user.id,
      userEmail: user.email,
      category: AuditCategory.SECURITY,
      action: AuditAction.READ, // Generic action for security events
      result: AuditResult.SUCCESS,
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      metadata: { event, description },
    });
  }

  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // Default 15 minutes

    const [, value, unit] = match;
    const num = parseInt(value, 10);

    switch (unit) {
      case 's':
        return num;
      case 'm':
        return num * 60;
      case 'h':
        return num * 60 * 60;
      case 'd':
        return num * 60 * 60 * 24;
      default:
        return 900;
    }
  }

  private parseDeviceName(userAgent: string): string {
    if (!userAgent) return 'Unknown Device';

    if (userAgent.includes('Mobile')) return 'Mobile Device';
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'Mac';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('iPhone')) return 'iPhone';
    if (userAgent.includes('iPad')) return 'iPad';
    if (userAgent.includes('Android')) return 'Android';

    return 'Unknown Device';
  }
}
