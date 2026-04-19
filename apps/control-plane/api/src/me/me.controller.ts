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
import {
  ClientAddressListResponseDto,
  ClientAddressResponseDto,
  CreateClientAddressDto,
  ListClientAddressesQueryDto,
  UpdateClientAddressDto,
} from '../clients/dto/client-address.dto';
import {
  ClientContactListResponseDto,
  ClientContactResponseDto,
  CreateClientContactDto,
  ListClientContactsQueryDto,
  UpdateClientContactDto,
} from '../clients/dto/client-contact.dto';
import { ClientDetailResponseDto } from '../clients/dto/client.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { MeService } from './me.service';
import { MyInfoDto, UpdateMyProfileDto } from './me.dto';

@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get()
  async getProfile(@CurrentUser() currentUser: User): Promise<ClientDetailResponseDto> {
    return this.meService.getProfile(currentUser);
  }

  @Get('info')
  async getInfo(@CurrentUser() currentUser: User): Promise<MyInfoDto> {
    return this.meService.getInfo(currentUser);
  }

  @Patch()
  async updateProfile(
    @CurrentUser() currentUser: User,
    @Body() dto: UpdateMyProfileDto,
  ): Promise<ClientDetailResponseDto> {
    return this.meService.updateProfile(currentUser, dto);
  }

  @Get('subscription')
  async getSubscription(@CurrentUser() currentUser: User): Promise<Record<string, unknown>> {
    return this.meService.getSubscription(currentUser);
  }

  @Get('addresses')
  async listAddresses(
    @CurrentUser() currentUser: User,
    @Query() query: ListClientAddressesQueryDto,
  ): Promise<ClientAddressListResponseDto> {
    return this.meService.listAddresses(currentUser, query);
  }

  @Post('addresses')
  @HttpCode(HttpStatus.CREATED)
  async createAddress(
    @CurrentUser() currentUser: User,
    @Body() dto: CreateClientAddressDto,
  ): Promise<ClientAddressResponseDto> {
    return this.meService.createAddress(currentUser, dto);
  }

  @Patch('addresses/:addressId')
  async updateAddress(
    @CurrentUser() currentUser: User,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateClientAddressDto,
  ): Promise<ClientAddressResponseDto> {
    return this.meService.updateAddress(currentUser, addressId, dto);
  }

  @Delete('addresses/:addressId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAddress(
    @CurrentUser() currentUser: User,
    @Param('addressId') addressId: string,
  ): Promise<void> {
    await this.meService.deleteAddress(currentUser, addressId);
  }

  @Post('addresses/:addressId/set-primary')
  async setAddressPrimary(
    @CurrentUser() currentUser: User,
    @Param('addressId') addressId: string,
  ): Promise<ClientAddressResponseDto> {
    return this.meService.setAddressPrimary(currentUser, addressId);
  }

  @Get('contacts')
  async listContacts(
    @CurrentUser() currentUser: User,
    @Query() query: ListClientContactsQueryDto,
  ): Promise<ClientContactListResponseDto> {
    return this.meService.listContacts(currentUser, query);
  }

  @Post('contacts')
  @HttpCode(HttpStatus.CREATED)
  async createContact(
    @CurrentUser() currentUser: User,
    @Body() dto: CreateClientContactDto,
  ): Promise<ClientContactResponseDto> {
    return this.meService.createContact(currentUser, dto);
  }

  @Patch('contacts/:contactId')
  async updateContact(
    @CurrentUser() currentUser: User,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateClientContactDto,
  ): Promise<ClientContactResponseDto> {
    return this.meService.updateContact(currentUser, contactId, dto);
  }

  @Delete('contacts/:contactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteContact(
    @CurrentUser() currentUser: User,
    @Param('contactId') contactId: string,
  ): Promise<void> {
    await this.meService.deleteContact(currentUser, contactId);
  }

  @Post('contacts/:contactId/set-primary')
  async setContactPrimary(
    @CurrentUser() currentUser: User,
    @Param('contactId') contactId: string,
  ): Promise<ClientContactResponseDto> {
    return this.meService.setContactPrimary(currentUser, contactId);
  }
}
