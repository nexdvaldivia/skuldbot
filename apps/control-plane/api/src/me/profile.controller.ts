import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { MeService } from './me.service';
import { UpdateMyUserProfileDto, UploadMyAvatarDto } from './me.dto';

@Controller('profile')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
export class ProfileController {
  constructor(private readonly meService: MeService) {}

  @Get()
  async getProfile(@CurrentUser() currentUser: User): Promise<Record<string, unknown>> {
    return this.meService.getMyUserProfile(currentUser);
  }

  @Patch()
  async updateProfile(
    @CurrentUser() currentUser: User,
    @Body() dto: UpdateMyUserProfileDto,
  ): Promise<Record<string, unknown>> {
    return this.meService.updateMyUserProfile(currentUser, dto);
  }

  @Post('avatar')
  @HttpCode(HttpStatus.CREATED)
  async uploadAvatar(
    @CurrentUser() currentUser: User,
    @Body() dto: UploadMyAvatarDto,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.meService.uploadMyAvatar(currentUser, dto, this.resolveRequestIp(request));
  }

  @Delete('avatar')
  async deleteAvatar(
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.meService.deleteMyAvatar(currentUser, this.resolveRequestIp(request));
  }

  private resolveRequestIp(request: Request): string | null {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      return forwardedFor.split(',')[0]?.trim() || null;
    }
    return request.ip || null;
  }
}
