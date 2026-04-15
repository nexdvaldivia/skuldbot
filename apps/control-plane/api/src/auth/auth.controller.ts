import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
  ChangePasswordDto,
  DisableMfaResponseDto,
  EnableMfaResponseDto,
  MfaCodeDto,
  RegenerateBackupCodesResponseDto,
  VerifyMfaResponseDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { getUserGrantedPermissions, getUserRoleNames } from '../common/authz/permissions';
import { MfaService } from './mfa.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthResponseDto> {
    const forwardedFor = req.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim();

    const userAgentHeader = req.headers['user-agent'];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    return this.authService.login(dto, {
      ip: forwardedIp || req.ip || 'unknown',
      userAgent: userAgent ?? null,
    });
  }

  @Post('register')
  @HttpCode(HttpStatus.FORBIDDEN)
  async register(): Promise<AuthResponseDto> {
    return this.authService.register();
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.FORBIDDEN)
  async forgotPassword(): Promise<{ message: string }> {
    return this.authService.forgotPassword();
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.FORBIDDEN)
  async resetPassword(): Promise<{ message: string }> {
    return this.authService.resetPassword();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: User): Promise<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    roles: string[];
    clientId: string | null;
    emailVerified: boolean;
    mfaEnabled: boolean;
    permissions: string[];
  }> {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      roles: getUserRoleNames(user),
      clientId: user.clientId,
      emailVerified: user.emailVerified,
      mfaEnabled: user.mfaEnabled,
      permissions: getUserGrantedPermissions(user),
    };
  }

  @Post('password/change')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.changePassword(user.id, dto);
  }

  @Post('mfa/enable')
  @UseGuards(JwtAuthGuard)
  async enableMfa(@CurrentUser() user: User): Promise<EnableMfaResponseDto> {
    return this.mfaService.enableMfa(user.id);
  }

  @Post('mfa/verify')
  @UseGuards(JwtAuthGuard)
  async verifyMfa(
    @CurrentUser() user: User,
    @Body() dto: MfaCodeDto,
  ): Promise<VerifyMfaResponseDto> {
    return this.mfaService.verifyMfa(user.id, dto.code);
  }

  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  async disableMfa(
    @CurrentUser() user: User,
    @Body() dto: MfaCodeDto,
  ): Promise<DisableMfaResponseDto> {
    return this.mfaService.disableMfa(user.id, dto.code);
  }

  @Post('mfa/backup-codes')
  @UseGuards(JwtAuthGuard)
  async regenerateBackupCodes(
    @CurrentUser() user: User,
  ): Promise<RegenerateBackupCodesResponseDto> {
    return this.mfaService.regenerateBackupCodes(user.id);
  }
}
