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
} from '@nestjs/common';
import { LicensesService } from './licenses.service';
import {
  CreateLicenseDto,
  UpdateLicenseDto,
  ValidateLicenseDto,
  LicenseResponseDto,
  LicenseDetailResponseDto,
  LicenseValidationResponseDto,
} from './dto/license.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('licenses')
export class LicensesController {
  constructor(private readonly licensesService: LicensesService) {}

  // Public endpoint for license validation (used by Orchestrators)
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validate(@Body() dto: ValidateLicenseDto): Promise<LicenseValidationResponseDto> {
    return this.licensesService.validate(dto.key);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  async findAll(@Query('tenantId') tenantId?: string): Promise<LicenseResponseDto[]> {
    return this.licensesService.findAll(tenantId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  async findOne(@Param('id') id: string): Promise<LicenseDetailResponseDto> {
    return this.licensesService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateLicenseDto): Promise<LicenseDetailResponseDto> {
    return this.licensesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SKULD_ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLicenseDto,
  ): Promise<LicenseDetailResponseDto> {
    return this.licensesService.update(id, dto);
  }

  @Post(':id/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SKULD_ADMIN)
  async revoke(@Param('id') id: string): Promise<LicenseDetailResponseDto> {
    return this.licensesService.revoke(id);
  }
}
