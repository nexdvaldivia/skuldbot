import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CP_PERMISSIONS } from '../common/authz/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import {
  CreateOrUpdateProviderConfigDto,
  ListProviderConfigsQueryDto,
  UpdateProviderConfigDto,
} from './dto/provider-config.dto';
import { IntegrationsService } from './integrations.service';
import { SanitizedProviderConfig } from './entities/provider-config.entity';

@Controller('integrations/providers')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.INTEGRATIONS_READ)
  async list(
    @Query() query: ListProviderConfigsQueryDto,
  ): Promise<SanitizedProviderConfig[]> {
    return this.integrationsService.listConfigs(query);
  }

  @Get(':id')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.INTEGRATIONS_READ)
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SanitizedProviderConfig> {
    return this.integrationsService.getConfig(id);
  }

  @Post()
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.INTEGRATIONS_WRITE)
  async createOrUpdate(
    @Body() dto: CreateOrUpdateProviderConfigDto,
    @CurrentUser() currentUser: User,
  ): Promise<SanitizedProviderConfig> {
    return this.integrationsService.createOrUpdate(dto, currentUser);
  }

  @Patch(':id')
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.INTEGRATIONS_WRITE)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderConfigDto,
    @CurrentUser() currentUser: User,
  ): Promise<SanitizedProviderConfig> {
    return this.integrationsService.update(id, dto, currentUser);
  }

  @Delete(':id')
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.INTEGRATIONS_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.integrationsService.delete(id);
  }

  @Post(':id/test')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.INTEGRATIONS_TEST)
  async test(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{
    success: boolean;
    message: string;
    checkedAt: string;
    details?: Record<string, unknown>;
  }> {
    return this.integrationsService.testConfig(id);
  }
}

