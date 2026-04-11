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
import { TenantsService } from './tenants.service';
import {
  CreateTenantDto,
  UpdateTenantDto,
  TenantResponseDto,
  TenantDetailResponseDto,
} from './dto/tenant.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CP_PERMISSIONS } from '../common/authz/permissions';
import { UserRole } from '../users/entities/user.entity';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.TENANTS_READ)
  async findAll(@Query('clientId') clientId?: string): Promise<TenantResponseDto[]> {
    return this.tenantsService.findAll(clientId);
  }

  @Get(':id')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.TENANTS_READ)
  async findOne(@Param('id') id: string): Promise<TenantDetailResponseDto> {
    return this.tenantsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.TENANTS_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateTenantDto): Promise<TenantDetailResponseDto> {
    return this.tenantsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.TENANTS_WRITE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<TenantDetailResponseDto> {
    return this.tenantsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.TENANTS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    return this.tenantsService.delete(id);
  }

  @Post(':id/activate')
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.TENANTS_WRITE)
  async activate(@Param('id') id: string): Promise<TenantDetailResponseDto> {
    return this.tenantsService.activate(id);
  }

  @Post(':id/suspend')
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.TENANTS_WRITE)
  async suspend(@Param('id') id: string): Promise<TenantDetailResponseDto> {
    return this.tenantsService.suspend(id);
  }
}
