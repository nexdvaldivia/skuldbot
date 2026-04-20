import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  BulkCreateClientContactsDto,
  ClientContactBulkResponseDto,
  ClientContactListResponseDto,
  ClientContactResponseDto,
  CreateClientContactDto,
  ListClientContactsQueryDto,
  UpdateClientContactDto,
} from './dto/client-contact.dto';
import { ClientContact } from './entities/client-contact.entity';
import { Client } from './entities/client.entity';
import {
  clearPrimaryForType,
  ensureClientAccess,
  normalizeOptionalString,
} from './clients-shared.util';

@Injectable()
export class ClientContactsService {
  constructor(
    @InjectRepository(ClientContact)
    private readonly contactRepository: Repository<ClientContact>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  async listClientContacts(
    clientId: string,
    query: ListClientContactsQueryDto,
    currentUser: User,
  ): Promise<ClientContactListResponseDto> {
    await ensureClientAccess(this.clientRepository, clientId, currentUser);

    const qb = this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.client_id = :clientId', { clientId })
      .andWhere('contact.deleted_at IS NULL');

    if (query.contactType) {
      qb.andWhere('contact.contact_type = :contactType', { contactType: query.contactType });
    }
    if (!query.includeInactive) {
      qb.andWhere('contact.is_active = :isActive', { isActive: true });
    }

    const contacts = await qb
      .orderBy('contact.contact_type', 'ASC')
      .addOrderBy('contact.is_primary', 'DESC')
      .addOrderBy('contact.last_name', 'ASC')
      .addOrderBy('contact.first_name', 'ASC')
      .getMany();

    return {
      contacts: contacts.map((contact) => this.toResponse(contact)),
      total: contacts.length,
    };
  }

  async getClientContact(
    clientId: string,
    contactId: string,
    currentUser: User,
  ): Promise<ClientContactResponseDto> {
    await ensureClientAccess(this.clientRepository, clientId, currentUser);
    const contact = await this.requireContact(clientId, contactId);
    return this.toResponse(contact);
  }

  async createClientContact(
    clientId: string,
    dto: CreateClientContactDto,
    currentUser: User,
  ): Promise<ClientContactResponseDto> {
    await ensureClientAccess(this.clientRepository, clientId, currentUser);
    await this.ensureUniqueContactEmail(clientId, dto.email);

    if (dto.isPrimary) {
      await clearPrimaryForType(
        this.contactRepository,
        ClientContact,
        clientId,
        'contact_type',
        dto.contactType,
      );
    }

    const contact = await this.contactRepository.save(
      this.contactRepository.create({
        clientId,
        contactType: dto.contactType,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: normalizeOptionalString(dto.phone),
        mobile: normalizeOptionalString(dto.mobile),
        jobTitle: normalizeOptionalString(dto.jobTitle),
        department: normalizeOptionalString(dto.department),
        linkedinUrl: normalizeOptionalString(dto.linkedinUrl),
        isPrimary: dto.isPrimary ?? false,
        isContractSigner: dto.isContractSigner ?? false,
        isInstaller: dto.isInstaller ?? false,
        isActive: dto.isActive ?? true,
        canReceiveMarketing: dto.canReceiveMarketing ?? true,
        canReceiveUpdates: dto.canReceiveUpdates ?? true,
        preferredLanguage: normalizeOptionalString(dto.preferredLanguage) ?? 'en',
        notes: normalizeOptionalString(dto.notes),
        deletedAt: null,
      }),
    );

    return this.toResponse(contact);
  }

  async bulkCreateClientContacts(
    clientId: string,
    dto: BulkCreateClientContactsDto,
    currentUser: User,
  ): Promise<ClientContactBulkResponseDto> {
    await ensureClientAccess(this.clientRepository, clientId, currentUser);

    const created: ClientContactResponseDto[] = [];
    const errors: string[] = [];

    for (let index = 0; index < dto.contacts.length; index += 1) {
      const contactInput = dto.contacts[index];
      try {
        const contact = await this.createClientContact(clientId, contactInput, currentUser);
        created.push(contact);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : `Unable to create contact at index ${index}.`;
        errors.push(`Contact ${index}: ${message}`);
      }
    }

    return { created, errors };
  }

  async updateClientContact(
    clientId: string,
    contactId: string,
    dto: UpdateClientContactDto,
    currentUser: User,
  ): Promise<ClientContactResponseDto> {
    await ensureClientAccess(this.clientRepository, clientId, currentUser);
    const contact = await this.requireContact(clientId, contactId);

    if (dto.email && dto.email.trim().toLowerCase() !== contact.email) {
      await this.ensureUniqueContactEmail(clientId, dto.email, contact.id);
    }

    const nextType = dto.contactType ?? contact.contactType;
    const nextIsPrimary = dto.isPrimary ?? contact.isPrimary;
    if (nextIsPrimary) {
      await clearPrimaryForType(
        this.contactRepository,
        ClientContact,
        clientId,
        'contact_type',
        nextType,
        contact.id,
      );
    }

    if (dto.contactType !== undefined) contact.contactType = dto.contactType;
    if (dto.firstName !== undefined) contact.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) contact.lastName = dto.lastName.trim();
    if (dto.email !== undefined) contact.email = dto.email.trim().toLowerCase();
    if (dto.phone !== undefined) contact.phone = normalizeOptionalString(dto.phone);
    if (dto.mobile !== undefined) contact.mobile = normalizeOptionalString(dto.mobile);
    if (dto.jobTitle !== undefined) contact.jobTitle = normalizeOptionalString(dto.jobTitle);
    if (dto.department !== undefined) contact.department = normalizeOptionalString(dto.department);
    if (dto.linkedinUrl !== undefined)
      contact.linkedinUrl = normalizeOptionalString(dto.linkedinUrl);
    if (dto.isPrimary !== undefined) contact.isPrimary = dto.isPrimary;
    if (dto.isContractSigner !== undefined) contact.isContractSigner = dto.isContractSigner;
    if (dto.isInstaller !== undefined) contact.isInstaller = dto.isInstaller;
    if (dto.isActive !== undefined) contact.isActive = dto.isActive;
    if (dto.canReceiveMarketing !== undefined)
      contact.canReceiveMarketing = dto.canReceiveMarketing;
    if (dto.canReceiveUpdates !== undefined) contact.canReceiveUpdates = dto.canReceiveUpdates;
    if (dto.preferredLanguage !== undefined)
      contact.preferredLanguage = normalizeOptionalString(dto.preferredLanguage) ?? 'en';
    if (dto.notes !== undefined) contact.notes = normalizeOptionalString(dto.notes);

    const saved = await this.contactRepository.save(contact);
    return this.toResponse(saved);
  }

  async deleteClientContact(
    clientId: string,
    contactId: string,
    hardDelete: boolean,
    currentUser: User,
  ): Promise<void> {
    await ensureClientAccess(this.clientRepository, clientId, currentUser);
    const contact = await this.requireContact(clientId, contactId);

    if (hardDelete) {
      await this.contactRepository.delete({ id: contact.id });
      return;
    }

    contact.deletedAt = new Date();
    await this.contactRepository.save(contact);
  }

  async setClientContactPrimary(
    clientId: string,
    contactId: string,
    currentUser: User,
  ): Promise<ClientContactResponseDto> {
    await ensureClientAccess(this.clientRepository, clientId, currentUser);
    const contact = await this.requireContact(clientId, contactId);

    await clearPrimaryForType(
      this.contactRepository,
      ClientContact,
      clientId,
      'contact_type',
      contact.contactType,
      contact.id,
    );
    contact.isPrimary = true;
    const saved = await this.contactRepository.save(contact);
    return this.toResponse(saved);
  }

  private async requireContact(clientId: string, contactId: string): Promise<ClientContact> {
    const contact = await this.contactRepository.findOne({
      where: {
        id: contactId,
        clientId,
        deletedAt: IsNull(),
      },
    });
    if (!contact) {
      throw new NotFoundException({
        code: 'CLIENT_CONTACT_NOT_FOUND',
        message: `Contact ${contactId} not found for client ${clientId}`,
      });
    }
    return contact;
  }

  private async ensureUniqueContactEmail(
    clientId: string,
    email: string,
    excludeId?: string,
  ): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const qb = this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.client_id = :clientId', { clientId })
      .andWhere('LOWER(contact.email) = :email', { email: normalized })
      .andWhere('contact.deleted_at IS NULL');

    if (excludeId) {
      qb.andWhere('contact.id != :excludeId', { excludeId });
    }

    const exists = await qb.getExists();
    if (exists) {
      throw new ConflictException({
        code: 'CLIENT_CONTACT_EMAIL_EXISTS',
        message: `Contact email ${normalized} already exists for client ${clientId}`,
      });
    }
  }

  private toResponse(contact: ClientContact): ClientContactResponseDto {
    return {
      id: contact.id,
      clientId: contact.clientId,
      contactType: contact.contactType,
      firstName: contact.firstName,
      lastName: contact.lastName,
      fullName: `${contact.firstName} ${contact.lastName}`.trim(),
      email: contact.email,
      phone: contact.phone,
      mobile: contact.mobile,
      jobTitle: contact.jobTitle,
      department: contact.department,
      linkedinUrl: contact.linkedinUrl,
      isPrimary: contact.isPrimary,
      isContractSigner: contact.isContractSigner,
      isInstaller: contact.isInstaller,
      isActive: contact.isActive,
      canReceiveMarketing: contact.canReceiveMarketing,
      canReceiveUpdates: contact.canReceiveUpdates,
      preferredLanguage: contact.preferredLanguage,
      notes: contact.notes,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    };
  }
}
