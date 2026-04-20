import {
  Body,
  Controller,
  Get,
  Param,
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
import { UserRole } from '../users/entities/user.entity';
import { LookupsService } from './lookups.service';
import { UpsertLookupValueDto } from './dto/lookup.dto';

@Controller('lookups')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class LookupsController {
  constructor(private readonly lookupsService: LookupsService) {}

  @Get('domains')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.LOOKUPS_READ)
  async listDomains(@Query('managedByPortal') managedByPortal?: string) {
    return this.lookupsService.listDomains(managedByPortal);
  }

  @Get('domains/:domainCode/values')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.LOOKUPS_READ)
  async listValues(@Param('domainCode') domainCode: string) {
    return this.lookupsService.listValuesByDomainCode(domainCode);
  }

  @Post('domains/:domainCode/values')
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.LOOKUPS_WRITE)
  async upsertDomainValue(
    @Param('domainCode') domainCode: string,
    @Body() dto: UpsertLookupValueDto,
  ) {
    return this.lookupsService.upsertDomainValue({
      domainCode,
      ...dto,
      managedByPortal: 'control_plane',
    });
  }
}
