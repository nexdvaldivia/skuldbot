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
import { ClientAddressesService } from './client-addresses.service';
import {
  BulkCreateClientAddressesDto,
  ClientAddressBulkResponseDto,
  ClientAddressListResponseDto,
  ClientAddressResponseDto,
  CreateClientAddressDto,
  DeleteClientAddressQueryDto,
  ListClientAddressesQueryDto,
  UpdateClientAddressDto,
} from './dto/client-address.dto';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ClientAddressesController {
  constructor(private readonly clientAddressesService: ClientAddressesService) {}

  @Get(':clientId/addresses')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async listClientAddresses(
    @Param('clientId') clientId: string,
    @Query() query: ListClientAddressesQueryDto,
    @CurrentUser() currentUser: User,
  ): Promise<ClientAddressListResponseDto> {
    return this.clientAddressesService.listClientAddresses(clientId, query, currentUser);
  }

  @Get(':clientId/addresses/:addressId')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_READ)
  async getClientAddress(
    @Param('clientId') clientId: string,
    @Param('addressId') addressId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ClientAddressResponseDto> {
    return this.clientAddressesService.getClientAddress(clientId, addressId, currentUser);
  }

  @Post(':clientId/addresses')
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async createClientAddress(
    @Param('clientId') clientId: string,
    @Body() dto: CreateClientAddressDto,
    @CurrentUser() currentUser: User,
  ): Promise<ClientAddressResponseDto> {
    return this.clientAddressesService.createClientAddress(clientId, dto, currentUser);
  }

  @Post(':clientId/addresses/bulk')
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async bulkCreateClientAddresses(
    @Param('clientId') clientId: string,
    @Body() dto: BulkCreateClientAddressesDto,
    @CurrentUser() currentUser: User,
  ): Promise<ClientAddressBulkResponseDto> {
    return this.clientAddressesService.bulkCreateClientAddresses(clientId, dto, currentUser);
  }

  @Patch(':clientId/addresses/:addressId')
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  async updateClientAddress(
    @Param('clientId') clientId: string,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateClientAddressDto,
    @CurrentUser() currentUser: User,
  ): Promise<ClientAddressResponseDto> {
    return this.clientAddressesService.updateClientAddress(clientId, addressId, dto, currentUser);
  }

  @Delete(':clientId/addresses/:addressId')
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteClientAddress(
    @Param('clientId') clientId: string,
    @Param('addressId') addressId: string,
    @Query() query: DeleteClientAddressQueryDto,
    @CurrentUser() currentUser: User,
  ): Promise<void> {
    await this.clientAddressesService.deleteClientAddress(
      clientId,
      addressId,
      query.hardDelete ?? false,
      currentUser,
    );
  }

  @Post(':clientId/addresses/:addressId/set-primary')
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.CLIENTS_WRITE)
  async setClientAddressPrimary(
    @Param('clientId') clientId: string,
    @Param('addressId') addressId: string,
    @CurrentUser() currentUser: User,
  ): Promise<ClientAddressResponseDto> {
    return this.clientAddressesService.setClientAddressPrimary(clientId, addressId, currentUser);
  }
}
