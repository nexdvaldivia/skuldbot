import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { Audit } from '../common/interceptors/audit.interceptor';
import { AuditCategory, AuditAction } from '../audit/entities/audit-log.entity';
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
  ResendVerificationDto,
  EnableMfaDto,
  EnableMfaResponseDto,
  VerifyMfaDto,
  DisableMfaDto,
  RegenerateBackupCodesDto,
  SessionResponseDto,
  RevokeSessionDto,
  RevokeAllSessionsDto,
  ImpersonateUserDto,
  ImpersonateResponseDto,
} from './dto/auth.dto';

/**
 * Authentication Controller.
 *
 * Provides REST API endpoints for all authentication flows:
 *
 * Public endpoints:
 * - POST /auth/login
 * - POST /auth/register
 * - POST /auth/refresh
 * - POST /auth/forgot-password
 * - POST /auth/reset-password
 * - POST /auth/verify-email
 * - POST /auth/resend-verification
 *
 * Protected endpoints (require authentication):
 * - POST /auth/logout
 * - POST /auth/change-password
 * - GET  /auth/sessions
 * - DELETE /auth/sessions/:id
 * - DELETE /auth/sessions (all)
 * - POST /auth/mfa/enable
 * - POST /auth/mfa/verify
 * - POST /auth/mfa/disable
 * - POST /auth/mfa/backup-codes
 *
 * Admin endpoints:
 * - POST /auth/impersonate
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ============================================================================
  // PUBLIC ENDPOINTS
  // ============================================================================

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.AUTH,
    action: AuditAction.LOGIN,
    resourceType: 'session',
    skipAudit: () => true, // Auth service handles its own audit logging
  })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
  ): Promise<LoginResponseDto | MfaRequiredResponseDto> {
    const clientInfo = {
      ip: this.getClientIp(request),
      userAgent: request.headers['user-agent'] || '',
    };

    return this.authService.login(dto, clientInfo);
  }

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    category: AuditCategory.AUTH,
    action: AuditAction.CREATE,
    resourceType: 'user',
    getResourceId: (_req, res) => res?.user?.id,
    getResourceName: (_req, res) => res?.user?.email,
  })
  async register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.register(dto);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
  ): Promise<TokenResponseDto> {
    const clientInfo = {
      ip: this.getClientIp(request),
      userAgent: request.headers['user-agent'] || '',
    };

    return this.authService.refreshToken(dto, clientInfo);
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.SECURITY,
    action: AuditAction.UPDATE,
    resourceType: 'password',
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.resetPassword(dto);
  }

  @Post('verify-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ message: string }> {
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-verification')
  @Public()
  @HttpCode(HttpStatus.OK)
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    return this.authService.resendVerification(dto.email);
  }

  // ============================================================================
  // PROTECTED ENDPOINTS
  // ============================================================================

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.AUTH,
    action: AuditAction.LOGOUT,
    resourceType: 'session',
  })
  async logout(
    @CurrentUser() user: User,
    @Body() body?: { sessionId?: string },
  ): Promise<{ message: string }> {
    await this.authService.logout(user.id, body?.sessionId);
    return { message: 'Logged out successfully.' };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.SECURITY,
    action: AuditAction.UPDATE,
    resourceType: 'password',
    getResourceId: (req) => req.user?.id,
  })
  async changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    const clientInfo = {
      ip: this.getClientIp(request),
      userAgent: request.headers['user-agent'] || '',
    };

    return this.authService.changePassword(user.id, dto, clientInfo);
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async getSessions(@CurrentUser() user: User): Promise<SessionResponseDto[]> {
    const sessions = await this.authService.getSessions(user.id);

    return sessions.map((session) => ({
      id: session.id,
      deviceName: session.deviceName || 'Unknown Device',
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      lastActiveAt: session.lastActivityAt || session.createdAt,
      createdAt: session.createdAt,
      isCurrent: false, // TODO: Determine from JWT sessionId
    }));
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.AUTH,
    action: AuditAction.DELETE,
    resourceType: 'session',
    getResourceId: (req) => req.params.id,
  })
  async revokeSession(
    @CurrentUser() user: User,
    @Param('id') sessionId: string,
  ): Promise<{ message: string }> {
    await this.authService.revokeSession(user.id, sessionId);
    return { message: 'Session revoked successfully.' };
  }

  @Delete('sessions')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.AUTH,
    action: AuditAction.DELETE,
    resourceType: 'session',
  })
  async revokeAllSessions(
    @CurrentUser() user: User,
    @Body() dto?: RevokeAllSessionsDto,
  ): Promise<{ message: string }> {
    // TODO: Pass current session ID if exceptCurrent is true
    await this.authService.revokeAllSessions(
      user.id,
      dto?.exceptCurrent ? undefined : undefined,
    );
    return { message: 'All sessions revoked successfully.' };
  }

  // ============================================================================
  // MFA ENDPOINTS
  // ============================================================================

  @Post('mfa/enable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.SECURITY,
    action: AuditAction.UPDATE,
    resourceType: 'mfa',
    getResourceId: (req) => req.user?.id,
  })
  async enableMfa(
    @CurrentUser() user: User,
    @Body() dto: EnableMfaDto,
  ): Promise<EnableMfaResponseDto> {
    return this.authService.enableMfa(user.id, dto.password);
  }

  @Post('mfa/verify')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.SECURITY,
    action: AuditAction.CREATE,
    resourceType: 'mfa',
    getResourceId: (req) => req.user?.id,
  })
  async verifyMfa(
    @CurrentUser() user: User,
    @Body() dto: VerifyMfaDto,
  ): Promise<{ message: string }> {
    return this.authService.verifyAndEnableMfa(user.id, dto.code);
  }

  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.SECURITY,
    action: AuditAction.DELETE,
    resourceType: 'mfa',
    getResourceId: (req) => req.user?.id,
  })
  async disableMfa(
    @CurrentUser() user: User,
    @Body() dto: DisableMfaDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    const clientInfo = {
      ip: this.getClientIp(request),
      userAgent: request.headers['user-agent'] || '',
    };

    return this.authService.disableMfa(
      user.id,
      dto.password,
      dto.code,
      clientInfo,
    );
  }

  @Post('mfa/backup-codes')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.SECURITY,
    action: AuditAction.UPDATE,
    resourceType: 'mfa_backup_codes',
    getResourceId: (req) => req.user?.id,
  })
  async regenerateBackupCodes(
    @CurrentUser() user: User,
    @Body() dto: RegenerateBackupCodesDto,
  ): Promise<{ backupCodes: string[] }> {
    return this.authService.regenerateBackupCodes(
      user.id,
      dto.password,
      dto.code,
    );
  }

  // ============================================================================
  // ADMIN ENDPOINTS
  // ============================================================================

  @Post('impersonate')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.SECURITY,
    action: AuditAction.IMPERSONATE,
    resourceType: 'user',
    getResourceId: (req) => req.body?.userId,
  })
  async impersonate(
    @CurrentUser() user: User,
    @Body() dto: ImpersonateUserDto,
    @Req() request: Request,
  ): Promise<ImpersonateResponseDto> {
    const clientInfo = {
      ip: this.getClientIp(request),
      userAgent: request.headers['user-agent'] || '',
    };

    return this.authService.impersonateUser(user, dto, clientInfo);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getClientIp(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (request.headers['x-real-ip'] as string) ||
      request.socket?.remoteAddress ||
      request.ip ||
      'unknown'
    );
  }
}
