import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User } from '../users/entities/user.entity';
import { DisableMfaDto, EnableMfaDto, SetupMfaDto, VerifyMfaCodeDto } from './dto/mfa.dto';
import { MfaService } from './mfa.service';

@Controller('mfa')
@UseGuards(JwtAuthGuard)
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Get('status')
  async getStatus(@CurrentUser() currentUser: User): Promise<Record<string, unknown>> {
    return this.mfaService.getStatus(currentUser);
  }

  @Get('requirement-check')
  async getRequirementCheck(@CurrentUser() currentUser: User): Promise<Record<string, unknown>> {
    return this.mfaService.getRequirementCheck(currentUser);
  }

  @Post('setup')
  @HttpCode(HttpStatus.CREATED)
  async setup(
    @CurrentUser() currentUser: User,
    @Body() dto: SetupMfaDto,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.mfaService.setup(currentUser, dto.appName, this.resolveRequestIp(request));
  }

  @Post('enable')
  async enable(
    @CurrentUser() currentUser: User,
    @Body() dto: EnableMfaDto,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.mfaService.enable(currentUser, dto.code, this.resolveRequestIp(request));
  }

  @Post('disable')
  async disable(
    @CurrentUser() currentUser: User,
    @Body() dto: DisableMfaDto,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.mfaService.disable(currentUser, dto.code, this.resolveRequestIp(request));
  }

  @Post('verify')
  async verify(
    @CurrentUser() currentUser: User,
    @Body() dto: VerifyMfaCodeDto,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.mfaService.verify(currentUser, dto.code, this.resolveRequestIp(request));
  }

  @Post('backup-codes/regenerate')
  async regenerateBackupCodes(
    @CurrentUser() currentUser: User,
    @Body() dto: VerifyMfaCodeDto,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.mfaService.regenerateBackupCodes(
      currentUser,
      dto.code,
      this.resolveRequestIp(request),
    );
  }

  private resolveRequestIp(request: Request): string | null {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      return forwardedFor.split(',')[0]?.trim() || null;
    }
    return request.ip || null;
  }
}
