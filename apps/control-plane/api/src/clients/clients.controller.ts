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
} from '@nestjs/common';
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
} from './dto/client.dto';
import {
  ListClientContactsQueryDto,
  ClientContactResponseDto,
  CreateClientContactDto,
  UpdateClientContactDto,
} from './dto/client-contact.dto';
import { ClientContactsService } from './client-contacts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CP_PERMISSIONS } from '../common/authz/permissions';
import { User, UserRole } from '../users/entities/user.entity';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly clientContactsService: ClientContactsService,
  ) {}

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

  @Get(':clientId/contacts')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async listContacts(
    @Param('clientId') clientId: string,
    @Query() query: ListClientContactsQueryDto,
    @CurrentUser() currentUser: User,
  ): Promise<ClientContactResponseDto[]> {
    const response = await this.clientContactsService.listClientContacts(
      clientId,
      query,
      currentUser,
    );
    return response.contacts;
  }

  @Get(':clientId/contacts/:contactId')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async getContactById(
    @Param('clientId') clientId: string,
    @Param('contactId') contactId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ClientContactResponseDto> {
    return this.clientContactsService.getClientContact(clientId, contactId, currentUser);
  }

  @Post(':clientId/contacts')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async createContact(
    @Param('clientId') clientId: string,
    @Body() dto: CreateClientContactDto,
    @CurrentUser() currentUser: User,
  ): Promise<ClientContactResponseDto> {
    return this.clientContactsService.createClientContact(clientId, dto, currentUser);
  }

  @Patch(':clientId/contacts/:contactId')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  async updateContact(
    @Param('clientId') clientId: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateClientContactDto,
    @CurrentUser() currentUser: User,
  ): Promise<ClientContactResponseDto> {
    return this.clientContactsService.updateClientContact(clientId, contactId, dto, currentUser);
  }

  @Delete(':clientId/contacts/:contactId')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteContact(
    @Param('clientId') clientId: string,
    @Param('contactId') contactId: string,
    @CurrentUser() currentUser: User,
  ): Promise<void> {
    return this.clientContactsService.deleteClientContact(clientId, contactId, false, currentUser);
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
  async regenerateApiKey(@Param('id') id: string): Promise<RegenerateClientApiKeyResponseDto> {
    return this.clientsService.regenerateApiKey(id);
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
