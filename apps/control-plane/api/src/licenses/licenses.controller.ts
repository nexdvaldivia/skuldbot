import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { LicensesService } from './licenses.service';
import {
  CreateLicenseDto,
  UpdateLicenseDto,
  UpdateLicenseTemplateDto,
  ValidateLicenseDto,
  LicenseTemplateResponseDto,
  LicenseResponseDto,
  LicenseDetailResponseDto,
  LicenseValidationResponseDto,
  LicenseTenantStatusResponseDto,
  RuntimeDecisionDto,
} from './dto/license.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CP_PERMISSIONS } from '../common/authz/permissions';
import { UserRole } from '../users/entities/user.entity';
import { ContractGateService } from '../contracts/contract-gate.service';

@Controller('licenses')
export class LicensesController {
  constructor(
    private readonly licensesService: LicensesService,
    private readonly contractGateService: ContractGateService,
  ) {}

  // Public endpoint for license validation (used by Orchestrators)
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validate(@Body() dto: ValidateLicenseDto): Promise<LicenseValidationResponseDto> {
    return this.licensesService.validate(dto.key);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.LICENSES_READ)
  async findAll(@Query('tenantId') tenantId?: string): Promise<LicenseResponseDto[]> {
    return this.licensesService.findAll(tenantId);
  }

  @Get(':tenantId/status')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.LICENSES_READ)
  async getTenantStatus(
    @Param('tenantId') tenantId: string,
  ): Promise<LicenseTenantStatusResponseDto> {
    return this.licensesService.getTenantStatus(tenantId);
  }

  @Get(':tenantId/runtime-decisions')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.LICENSES_READ)
  async listRuntimeDecisions(
    @Param('tenantId') tenantId: string,
    @Query('limit') limit?: string,
    @Query('resourceType') resourceType?: string,
    @Query('decisionType')
    decisionType?: 'entitlement_check' | 'quota_check' | 'quota_consume',
  ): Promise<RuntimeDecisionDto[]> {
    return this.licensesService.listRuntimeDecisions(tenantId, {
      limit: limit ? Number(limit) : undefined,
      resourceType,
      decisionType,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.LICENSES_READ)
  async findOne(@Param('id') id: string): Promise<LicenseDetailResponseDto> {
    return this.licensesService.findOne(id);
  }

  @Get('templates/:type')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.LICENSES_READ)
  async getTemplate(@Param('type') type: string): Promise<LicenseTemplateResponseDto> {
    return this.licensesService.getLicenseTemplate(type);
  }

  @Patch('templates/:type')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.LICENSES_WRITE)
  async updateTemplate(
    @Param('type') type: string,
    @Body() dto: UpdateLicenseTemplateDto,
  ): Promise<LicenseTemplateResponseDto> {
    return this.licensesService.updateLicenseTemplate(type, dto);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.LICENSES_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateLicenseDto): Promise<LicenseDetailResponseDto> {
    const gate = await this.contractGateService.validateForLicenseCreate(dto);
    if (!gate.allowed) {
      throw new ForbiddenException({
        code: 'CONTRACT_GATE_BLOCKED',
        message: 'License issuance is blocked until required contracts are signed.',
        missingContracts: gate.missing,
      });
    }

    return this.licensesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.LICENSES_WRITE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLicenseDto,
  ): Promise<LicenseDetailResponseDto> {
    return this.licensesService.update(id, dto);
  }

  @Post(':id/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.LICENSES_REVOKE)
  async revoke(@Param('id') id: string): Promise<LicenseDetailResponseDto> {
    return this.licensesService.revoke(id);
  }
}
