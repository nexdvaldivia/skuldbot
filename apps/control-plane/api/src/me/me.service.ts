import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  ListClientAddressesQueryDto,
  CreateClientAddressDto,
  UpdateClientAddressDto,
  ClientAddressListResponseDto,
  ClientAddressResponseDto,
} from '../clients/dto/client-address.dto';
import {
  BulkCreateClientContactsDto,
  ClientContactBulkResponseDto,
  ClientContactListResponseDto,
  ClientContactResponseDto,
  CreateClientContactDto,
  ListClientContactsQueryDto,
  UpdateClientContactDto,
} from '../clients/dto/client-contact.dto';
import { ClientDetailResponseDto } from '../clients/dto/client.dto';
import { ClientAddressesService } from '../clients/client-addresses.service';
import { ClientContactsService } from '../clients/client-contacts.service';
import { ClientsService } from '../clients/clients.service';
import { Tenant } from '../tenants/entities/tenant.entity';
import { TenantSubscription } from '../billing/entities/subscription.entity';
import { User } from '../users/entities/user.entity';
import { MyInfoDto, UpdateMyProfileDto } from './me.dto';

@Injectable()
export class MeService {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly clientAddressesService: ClientAddressesService,
    private readonly clientContactsService: ClientContactsService,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantSubscription)
    private readonly subscriptionRepository: Repository<TenantSubscription>,
  ) {}

  async getProfile(currentUser: User): Promise<ClientDetailResponseDto> {
    const clientId = this.requireClientContext(currentUser);
    return this.clientsService.findOne(clientId);
  }

  async getInfo(currentUser: User): Promise<MyInfoDto> {
    const profile = await this.getProfile(currentUser);
    return {
      id: profile.id,
      name: profile.name,
      slug: profile.slug,
      billingEmail: profile.billingEmail,
      plan: profile.plan,
      status: profile.status,
    };
  }

  async updateProfile(
    currentUser: User,
    dto: UpdateMyProfileDto,
  ): Promise<ClientDetailResponseDto> {
    const clientId = this.requireClientContext(currentUser);
    return this.clientsService.update(clientId, {
      name: dto.name,
      billingEmail: dto.billingEmail,
    });
  }

  async getSubscription(currentUser: User): Promise<Record<string, unknown>> {
    const clientId = this.requireClientContext(currentUser);

    const tenants = await this.tenantRepository.find({
      where: { clientId },
      select: ['id', 'name', 'status'],
    });

    const tenantIds = tenants.map((tenant) => tenant.id);
    if (tenantIds.length === 0) {
      return {
        clientId,
        total: 0,
        subscriptions: [],
      };
    }

    const subscriptions = await this.subscriptionRepository.find({
      where: { tenantId: In(tenantIds) },
      order: { updatedAt: 'DESC' },
    });

    return {
      clientId,
      total: subscriptions.length,
      subscriptions: subscriptions.map((subscription) => ({
        id: subscription.id,
        tenantId: subscription.tenantId,
        tenantName: subscription.tenantName,
        status: subscription.status,
        paymentMethodType: subscription.paymentMethodType,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        monthlyAmount: subscription.monthlyAmount,
        currency: subscription.currency,
        botsCanRun: subscription.botsCanRun,
        gracePeriodEnds: subscription.gracePeriodEnds,
      })),
    };
  }

  async listAddresses(
    currentUser: User,
    query: ListClientAddressesQueryDto,
  ): Promise<ClientAddressListResponseDto> {
    const clientId = this.requireClientContext(currentUser);
    return this.clientAddressesService.listClientAddresses(clientId, query, currentUser);
  }

  async createAddress(
    currentUser: User,
    dto: CreateClientAddressDto,
  ): Promise<ClientAddressResponseDto> {
    const clientId = this.requireClientContext(currentUser);
    return this.clientAddressesService.createClientAddress(clientId, dto, currentUser);
  }

  async updateAddress(
    currentUser: User,
    addressId: string,
    dto: UpdateClientAddressDto,
  ): Promise<ClientAddressResponseDto> {
    const clientId = this.requireClientContext(currentUser);
    return this.clientAddressesService.updateClientAddress(clientId, addressId, dto, currentUser);
  }

  async deleteAddress(currentUser: User, addressId: string): Promise<void> {
    const clientId = this.requireClientContext(currentUser);
    await this.clientAddressesService.deleteClientAddress(clientId, addressId, false, currentUser);
  }

  async setAddressPrimary(currentUser: User, addressId: string): Promise<ClientAddressResponseDto> {
    const clientId = this.requireClientContext(currentUser);
    return this.clientAddressesService.setClientAddressPrimary(clientId, addressId, currentUser);
  }

  async listContacts(
    currentUser: User,
    query: ListClientContactsQueryDto,
  ): Promise<ClientContactListResponseDto> {
    const clientId = this.requireClientContext(currentUser);
    return this.clientContactsService.listClientContacts(clientId, query, currentUser);
  }

  async createContact(
    currentUser: User,
    dto: CreateClientContactDto,
  ): Promise<ClientContactResponseDto> {
    const clientId = this.requireClientContext(currentUser);
    return this.clientContactsService.createClientContact(clientId, dto, currentUser);
  }

  async bulkCreateContacts(
    currentUser: User,
    dto: BulkCreateClientContactsDto,
  ): Promise<ClientContactBulkResponseDto> {
    const clientId = this.requireClientContext(currentUser);
    return this.clientContactsService.bulkCreateClientContacts(clientId, dto, currentUser);
  }

  async updateContact(
    currentUser: User,
    contactId: string,
    dto: UpdateClientContactDto,
  ): Promise<ClientContactResponseDto> {
    const clientId = this.requireClientContext(currentUser);
    return this.clientContactsService.updateClientContact(clientId, contactId, dto, currentUser);
  }

  async deleteContact(currentUser: User, contactId: string): Promise<void> {
    const clientId = this.requireClientContext(currentUser);
    await this.clientContactsService.deleteClientContact(clientId, contactId, false, currentUser);
  }

  async setContactPrimary(currentUser: User, contactId: string): Promise<ClientContactResponseDto> {
    const clientId = this.requireClientContext(currentUser);
    return this.clientContactsService.setClientContactPrimary(clientId, contactId, currentUser);
  }

  private requireClientContext(currentUser: User): string {
    if (!currentUser.clientId) {
      throw new BadRequestException({
        code: 'ME_MISSING_CLIENT_CONTEXT',
        message: 'Authenticated user is not bound to a client.',
      });
    }

    return currentUser.clientId;
  }
}
