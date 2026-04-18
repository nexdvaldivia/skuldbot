import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ClientsService } from './clients.service';
import {
  CreateClientDto,
  UpdateClientDto,
  ClientResponseDto,
  ClientDetailResponseDto,
  ListClientsQueryDto,
  RegenerateClientApiKeyResponseDto,
  ClientGatesResponseDto,
  ClientOverviewResponseDto,
  ClientAuthorizationResponseDto,
  ResendAuthorizationQueryDto,
  DenyClientQueryDto,
  SendClientContractsRequestDto,
} from './dto/client.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CP_PERMISSIONS } from '../common/authz/permissions';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async findAll(@Query() query: ListClientsQueryDto): Promise<ClientResponseDto[]> {
    return this.clientsService.findAll(query);
  }

  @Get('slug/:slug')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async findBySlug(@Param('slug') slug: string): Promise<ClientDetailResponseDto> {
    return this.clientsService.findBySlug(slug);
  }

  @Get(':id')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async findOne(@Param('id') id: string): Promise<ClientDetailResponseDto> {
    return this.clientsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateClientDto): Promise<ClientDetailResponseDto> {
    return this.clientsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ): Promise<ClientDetailResponseDto> {
    return this.clientsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    return this.clientsService.delete(id);
  }

  @Post(':id/activate')
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  async activate(@Param('id') id: string): Promise<ClientDetailResponseDto> {
    return this.clientsService.activate(id);
  }

  @Post(':id/suspend')
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  async suspend(@Param('id') id: string): Promise<ClientDetailResponseDto> {
    return this.clientsService.suspend(id);
  }

  @Post(':id/reactivate')
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  async reactivate(@Param('id') id: string): Promise<ClientDetailResponseDto> {
    return this.clientsService.reactivate(id);
  }

  @Post(':id/regenerate-api-key')
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  async regenerateApiKey(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<RegenerateClientApiKeyResponseDto> {
    const forwardedFor = request.headers['x-forwarded-for'];
    const resolvedIp =
      typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0]?.trim() || null
        : request.ip || null;
    return this.clientsService.regenerateApiKey(id, currentUser, resolvedIp);
  }

  @Post(':id/authorize')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  async authorize(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
  ): Promise<ClientAuthorizationResponseDto> {
    return this.clientsService.authorize(id, currentUser);
  }

  @Post(':id/resend-authorization')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  async resendAuthorization(
    @Param('id') id: string,
    @Query() query: ResendAuthorizationQueryDto,
    @CurrentUser() currentUser: User,
  ): Promise<ClientAuthorizationResponseDto> {
    return this.clientsService.resendAuthorization(id, currentUser, Boolean(query.regenerateToken));
  }

  @Post(':id/deny')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  async deny(
    @Param('id') id: string,
    @Query() query: DenyClientQueryDto,
    @CurrentUser() currentUser: User,
  ): Promise<Record<string, unknown>> {
    return this.clientsService.deny(id, query.reason, currentUser);
  }

  @Get(':id/contracts')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async getContracts(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
    @Query('includeRevoked') includeRevoked?: string,
  ): Promise<Record<string, unknown>> {
    return this.clientsService.getContracts(id, currentUser, includeRevoked === 'true');
  }

  @Post(':id/contracts/:contractId/generate-pdf')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async generateContractPdf(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @CurrentUser() currentUser: User,
  ): Promise<Record<string, unknown>> {
    return this.clientsService.generateContractPdf(id, contractId, currentUser);
  }

  @Post(':id/contracts/:contractId/revoke')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  async revokeContract(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Query() query: DenyClientQueryDto,
    @CurrentUser() currentUser: User,
  ): Promise<Record<string, unknown>> {
    return this.clientsService.revokeContract(id, contractId, query.reason, currentUser);
  }

  @Get(':id/contract-signing-readiness')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async getContractSigningReadiness(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
  ): Promise<Record<string, unknown>> {
    return this.clientsService.getContractSigningReadiness(id, currentUser);
  }

  @Post(':id/send-contracts')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async sendContracts(
    @Param('id') id: string,
    @Body() body: SendClientContractsRequestDto,
    @CurrentUser() currentUser: User,
  ): Promise<Record<string, unknown>> {
    return this.clientsService.sendContracts(id, body, currentUser);
  }

  @Get(':id/invoices')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async getInvoices(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<Record<string, unknown>> {
    return this.clientsService.getInvoices(
      id,
      currentUser,
      status ?? null,
      Number(page ?? '1'),
      Number(pageSize ?? '20'),
    );
  }

  @Get(':id/usage-history')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async getUsageHistory(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
    @Query('months') months?: string,
  ): Promise<Record<string, unknown>> {
    return this.clientsService.getUsageHistory(id, currentUser, Number(months ?? '12'));
  }

  @Get(':id/data-pods/daily-volume')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async getDataPodDailyVolume(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
    @Query('days') days?: string,
  ): Promise<Record<string, unknown>> {
    return this.clientsService.getDataPodDailyVolume(id, currentUser, Number(days ?? '30'));
  }

  @Get(':id/support-tickets')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async getSupportTickets(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    return this.clientsService.getSupportTickets(
      id,
      currentUser,
      status ?? null,
      Number(limit ?? '20'),
    );
  }

  @Get(':id/alerts')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async getAlerts(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
    @Query('severity') severity?: string,
    @Query('days') days?: string,
  ): Promise<Record<string, unknown>> {
    return this.clientsService.getAlerts(id, currentUser, severity ?? null, Number(days ?? '30'));
  }

  @Get(':id/quota-status')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async getQuotaStatus(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
  ): Promise<Record<string, unknown>> {
    return this.clientsService.getQuotaStatus(id, currentUser);
  }

  @Get(':id/health-score')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async getHealthScore(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
  ): Promise<Record<string, unknown>> {
    return this.clientsService.getHealthScore(id, currentUser);
  }

  @Get(':id/gates')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async getGates(@Param('id') id: string): Promise<ClientGatesResponseDto> {
    return this.clientsService.getGates(id);
  }

  @Get(':id/overview')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async getOverview(@Param('id') id: string): Promise<ClientOverviewResponseDto> {
    return this.clientsService.getOverview(id);
  }
}
