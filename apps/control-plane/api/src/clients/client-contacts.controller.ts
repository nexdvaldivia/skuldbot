import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CP_PERMISSIONS } from '../common/authz/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { ClientContactsService } from './client-contacts.service';
import {
  BulkCreateClientContactsDto,
  ClientContactBulkResponseDto,
  ClientContactListResponseDto,
  ClientContactResponseDto,
  CreateClientContactDto,
  DeleteClientContactQueryDto,
  ListClientContactsQueryDto,
  UpdateClientContactDto,
} from './dto/client-contact.dto';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ClientContactsController {
  constructor(private readonly clientContactsService: ClientContactsService) {}

  @Get(':clientId/contacts')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async listClientContacts(
    @Param('clientId') clientId: string,
    @Query() query: ListClientContactsQueryDto,
    @CurrentUser() currentUser: User,
  ): Promise<ClientContactListResponseDto> {
    return this.clientContactsService.listClientContacts(clientId, query, currentUser);
  }

  @Get(':clientId/contacts/:contactId')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async getClientContact(
    @Param('clientId') clientId: string,
    @Param('contactId') contactId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ClientContactResponseDto> {
    return this.clientContactsService.getClientContact(clientId, contactId, currentUser);
  }

  @Post(':clientId/contacts')
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async createClientContact(
    @Param('clientId') clientId: string,
    @Body() dto: CreateClientContactDto,
    @CurrentUser() currentUser: User,
  ): Promise<ClientContactResponseDto> {
    return this.clientContactsService.createClientContact(clientId, dto, currentUser);
  }

  @Post(':clientId/contacts/bulk')
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async bulkCreateClientContacts(
    @Param('clientId') clientId: string,
    @Body() dto: BulkCreateClientContactsDto,
    @CurrentUser() currentUser: User,
  ): Promise<ClientContactBulkResponseDto> {
    return this.clientContactsService.bulkCreateClientContacts(clientId, dto, currentUser);
  }

  @Patch(':clientId/contacts/:contactId')
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  async updateClientContact(
    @Param('clientId') clientId: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateClientContactDto,
    @CurrentUser() currentUser: User,
  ): Promise<ClientContactResponseDto> {
    return this.clientContactsService.updateClientContact(clientId, contactId, dto, currentUser);
  }

  @Delete(':clientId/contacts/:contactId')
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteClientContact(
    @Param('clientId') clientId: string,
    @Param('contactId') contactId: string,
    @Query() query: DeleteClientContactQueryDto,
    @CurrentUser() currentUser: User,
  ): Promise<void> {
    await this.clientContactsService.deleteClientContact(
      clientId,
      contactId,
      query.hardDelete ?? false,
      currentUser,
    );
  }

  @Post(':clientId/contacts/:contactId/set-primary')
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  async setClientContactPrimary(
    @Param('clientId') clientId: string,
    @Param('contactId') contactId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ClientContactResponseDto> {
    return this.clientContactsService.setClientContactPrimary(clientId, contactId, currentUser);
  }
}
