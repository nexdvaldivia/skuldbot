import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  BulkCreateClientAddressesDto,
  ClientAddressBulkResponseDto,
  ClientAddressListResponseDto,
  ClientAddressResponseDto,
  CreateClientAddressDto,
  ListClientAddressesQueryDto,
  UpdateClientAddressDto,
} from './dto/client-address.dto';
import { ClientAddress } from './entities/client-address.entity';
import { Client } from './entities/client.entity';
import {
  clearPrimaryForType,
  ensureClientAccess,
  normalizeOptionalString,
} from './clients-shared.util';

@Injectable()
export class ClientAddressesService {
  constructor(
    @InjectRepository(ClientAddress)
    private readonly addressRepository: Repository<ClientAddress>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  async listClientAddresses(
    clientId: string,
    query: ListClientAddressesQueryDto,
    currentUser: User,
  ): Promise<ClientAddressListResponseDto> {
    await ensureClientAccess(this.clientRepository, clientId, currentUser);

    const qb = this.addressRepository
      .createQueryBuilder('address')
      .where('address.client_id = :clientId', { clientId })
      .andWhere('address.deleted_at IS NULL');

    if (query.addressType) {
      qb.andWhere('address.address_type = :addressType', { addressType: query.addressType });
    }
    if (!query.includeInactive) {
      qb.andWhere('address.is_active = :isActive', { isActive: true });
    }

    const addresses = await qb
      .orderBy('address.address_type', 'ASC')
      .addOrderBy('address.is_primary', 'DESC')
      .addOrderBy('address.country', 'ASC')
      .addOrderBy('address.city', 'ASC')
      .getMany();

    return {
      addresses: addresses.map((address) => this.toResponse(address)),
      total: addresses.length,
    };
  }

  async getClientAddress(
    clientId: string,
    addressId: string,
    currentUser: User,
  ): Promise<ClientAddressResponseDto> {
    await ensureClientAccess(this.clientRepository, clientId, currentUser);
    const address = await this.requireAddress(clientId, addressId);
    return this.toResponse(address);
  }

  async createClientAddress(
    clientId: string,
    dto: CreateClientAddressDto,
    currentUser: User,
  ): Promise<ClientAddressResponseDto> {
    await ensureClientAccess(this.clientRepository, clientId, currentUser);

    if (dto.isPrimary) {
      await clearPrimaryForType(
        this.addressRepository,
        ClientAddress,
        clientId,
        'address_type',
        dto.addressType,
      );
    }

    const address = await this.addressRepository.save(
      this.addressRepository.create({
        clientId,
        addressType: dto.addressType,
        label: normalizeOptionalString(dto.label),
        addressLine1: dto.addressLine1.trim(),
        addressLine2: normalizeOptionalString(dto.addressLine2),
        city: dto.city.trim(),
        stateProvince: normalizeOptionalString(dto.stateProvince),
        postalCode: normalizeOptionalString(dto.postalCode),
        country: dto.country.trim(),
        isPrimary: dto.isPrimary ?? false,
        isActive: dto.isActive ?? true,
        notes: normalizeOptionalString(dto.notes),
        deletedAt: null,
      }),
    );
    return this.toResponse(address);
  }

  async bulkCreateClientAddresses(
    clientId: string,
    dto: BulkCreateClientAddressesDto,
    currentUser: User,
  ): Promise<ClientAddressBulkResponseDto> {
    await ensureClientAccess(this.clientRepository, clientId, currentUser);

    const created: ClientAddressResponseDto[] = [];
    const errors: string[] = [];

    for (let index = 0; index < dto.addresses.length; index += 1) {
      const addressInput = dto.addresses[index];
      try {
        const address = await this.createClientAddress(clientId, addressInput, currentUser);
        created.push(address);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : `Unable to create address at index ${index}.`;
        errors.push(`Address ${index}: ${message}`);
      }
    }

    return { created, errors };
  }

  async updateClientAddress(
    clientId: string,
    addressId: string,
    dto: UpdateClientAddressDto,
    currentUser: User,
  ): Promise<ClientAddressResponseDto> {
    await ensureClientAccess(this.clientRepository, clientId, currentUser);
    const address = await this.requireAddress(clientId, addressId);

    const nextType = dto.addressType ?? address.addressType;
    const nextIsPrimary = dto.isPrimary ?? address.isPrimary;
    if (nextIsPrimary) {
      await clearPrimaryForType(
        this.addressRepository,
        ClientAddress,
        clientId,
        'address_type',
        nextType,
        address.id,
      );
    }

    if (dto.addressType !== undefined) address.addressType = dto.addressType;
    if (dto.label !== undefined) address.label = normalizeOptionalString(dto.label);
    if (dto.addressLine1 !== undefined) address.addressLine1 = dto.addressLine1.trim();
    if (dto.addressLine2 !== undefined)
      address.addressLine2 = normalizeOptionalString(dto.addressLine2);
    if (dto.city !== undefined) address.city = dto.city.trim();
    if (dto.stateProvince !== undefined)
      address.stateProvince = normalizeOptionalString(dto.stateProvince);
    if (dto.postalCode !== undefined) address.postalCode = normalizeOptionalString(dto.postalCode);
    if (dto.country !== undefined) address.country = dto.country.trim();
    if (dto.isPrimary !== undefined) address.isPrimary = dto.isPrimary;
    if (dto.isActive !== undefined) address.isActive = dto.isActive;
    if (dto.notes !== undefined) address.notes = normalizeOptionalString(dto.notes);

    const saved = await this.addressRepository.save(address);
    return this.toResponse(saved);
  }

  async deleteClientAddress(
    clientId: string,
    addressId: string,
    hardDelete: boolean,
    currentUser: User,
  ): Promise<void> {
    await ensureClientAccess(this.clientRepository, clientId, currentUser);
    const address = await this.requireAddress(clientId, addressId);

    if (hardDelete) {
      await this.addressRepository.delete({ id: address.id });
      return;
    }

    address.deletedAt = new Date();
    await this.addressRepository.save(address);
  }

  async setClientAddressPrimary(
    clientId: string,
    addressId: string,
    currentUser: User,
  ): Promise<ClientAddressResponseDto> {
    await ensureClientAccess(this.clientRepository, clientId, currentUser);
    const address = await this.requireAddress(clientId, addressId);

    await clearPrimaryForType(
      this.addressRepository,
      ClientAddress,
      clientId,
      'address_type',
      address.addressType,
      address.id,
    );
    address.isPrimary = true;
    const saved = await this.addressRepository.save(address);
    return this.toResponse(saved);
  }

  private async requireAddress(clientId: string, addressId: string): Promise<ClientAddress> {
    const address = await this.addressRepository.findOne({
      where: {
        id: addressId,
        clientId,
        deletedAt: IsNull(),
      },
    });
    if (!address) {
      throw new NotFoundException({
        code: 'CLIENT_ADDRESS_NOT_FOUND',
        message: `Address ${addressId} not found for client ${clientId}`,
      });
    }
    return address;
  }

  private toResponse(address: ClientAddress): ClientAddressResponseDto {
    return {
      id: address.id,
      clientId: address.clientId,
      addressType: address.addressType,
      label: address.label,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      city: address.city,
      stateProvince: address.stateProvince,
      postalCode: address.postalCode,
      country: address.country,
      isPrimary: address.isPrimary,
      isActive: address.isActive,
      notes: address.notes,
      createdAt: address.createdAt,
      updatedAt: address.updatedAt,
    };
  }
}
