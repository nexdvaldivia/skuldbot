import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  ListUsersQueryDto,
  ResetUserPasswordDto,
  UpdateUserDto,
  UploadUserAvatarDto,
  UserResponseDto,
  UserStatsResponseDto,
} from './dto/user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CP_PERMISSIONS } from '../common/authz/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from './entities/user.entity';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.USERS_READ)
  async findAll(@Query() query: ListUsersQueryDto): Promise<UserResponseDto[]> {
    return this.usersService.findAll(query);
  }

  @Get('stats')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.USERS_READ)
  async getStats(): Promise<UserStatsResponseDto> {
    return this.usersService.getStats();
  }

  @Get(':id')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.USERS_READ)
  async findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.USERS_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.USERS_WRITE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: User,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto, currentUser);
  }

  @Delete(':id')
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.USERS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentUser() currentUser: User): Promise<void> {
    return this.usersService.delete(id, currentUser);
  }

  @Post(':id/activate')
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.USERS_STATUS)
  async activate(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.activate(id);
  }

  @Post(':id/suspend')
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.USERS_STATUS)
  async suspend(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
  ): Promise<UserResponseDto> {
    return this.usersService.suspend(id, currentUser);
  }

  @Post(':id/toggle-active')
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.USERS_STATUS)
  async toggleActive(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
  ): Promise<UserResponseDto> {
    return this.usersService.toggleActive(id, currentUser);
  }

  @Post(':id/reset-password')
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.USERS_WRITE)
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser() currentUser: User,
  ): Promise<UserResponseDto> {
    return this.usersService.resetPassword(id, dto.password, currentUser);
  }

  @Post(':id/avatar')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.USERS_WRITE)
  async uploadAvatar(
    @Param('id') id: string,
    @Body() dto: UploadUserAvatarDto,
  ): Promise<UserResponseDto> {
    return this.usersService.uploadAvatar(id, dto);
  }

  @Delete(':id/avatar')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.USERS_WRITE)
  async deleteAvatar(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.deleteAvatar(id);
  }
}
