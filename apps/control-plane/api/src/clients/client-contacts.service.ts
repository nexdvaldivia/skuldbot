import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { assertClientBoundary } from '../contracts/contracts-access.util';
import { User } from '../users/entities/user.entity';
import {
  ClientContactResponseDto,
  CreateClientContactDto,
  UpdateClientContactDto,
} from './dto/client-contact.dto';
import { ClientContact } from './entities/client-contact.entity';
import { Client } from './entities/client.entity';

@Injectable()
export class ClientContactsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(ClientContact)
    private readonly contactRepository: Repository<ClientContact>,
  ) {}

  async list(clientId: string, currentUser: User): Promise<ClientContactResponseDto[]> {
    await this.requireClient(clientId, currentUser);

    const contacts = await this.contactRepository.find({
      where: { clientId },
      order: {
        isPrimary: 'DESC',
        fullName: 'ASC',
      },
    });

    return contacts.map((contact) => this.toResponse(contact));
  }

  async getById(
    clientId: string,
    contactId: string,
    currentUser: User,
  ): Promise<ClientContactResponseDto> {
    await this.requireClient(clientId, currentUser);

    const contact = await this.contactRepository.findOne({
      where: {
        id: contactId,
        clientId,
      },
    });

    if (!contact) {
      throw new NotFoundException({
        code: 'CLIENT_CONTACT_NOT_FOUND',
        message: `Client contact ${contactId} was not found for client ${clientId}.`,
      });
    }

    return this.toResponse(contact);
  }

  async create(
    clientId: string,
    dto: CreateClientContactDto,
    currentUser: User,
  ): Promise<ClientContactResponseDto> {
    await this.requireClient(clientId, currentUser);

    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.contactRepository.findOne({
      where: {
        clientId,
        email: normalizedEmail,
      },
    });

    if (existing) {
      throw new ConflictException({
        code: 'CLIENT_CONTACT_EMAIL_EXISTS',
        message: `A client contact with email ${normalizedEmail} already exists for client ${clientId}.`,
      });
    }

    if (dto.isPrimary) {
      await this.clearExistingPrimary(clientId, null, currentUser.id);
    }

    const contact = await this.contactRepository.save(
      this.contactRepository.create({
        clientId,
        fullName: dto.fullName.trim(),
        email: normalizedEmail,
        phone: dto.phone?.trim() || null,
        title: dto.title?.trim() || null,
        department: dto.department?.trim() || null,
        roleCodes: this.normalizeRoleCodes(dto.roleCodes),
        isPrimary: dto.isPrimary ?? false,
        isActive: dto.isActive ?? true,
        createdByUserId: currentUser.id,
        updatedByUserId: currentUser.id,
        metadata: dto.metadata ?? {},
      }),
    );

    return this.toResponse(contact);
  }

  async update(
    clientId: string,
    contactId: string,
    dto: UpdateClientContactDto,
    currentUser: User,
  ): Promise<ClientContactResponseDto> {
    await this.requireClient(clientId, currentUser);

    const contact = await this.contactRepository.findOne({
      where: {
        id: contactId,
        clientId,
      },
    });

    if (!contact) {
      throw new NotFoundException({
        code: 'CLIENT_CONTACT_NOT_FOUND',
        message: `Client contact ${contactId} was not found for client ${clientId}.`,
      });
    }

    if (dto.email !== undefined) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      if (normalizedEmail !== contact.email) {
        const duplicate = await this.contactRepository.findOne({
          where: {
            clientId,
            email: normalizedEmail,
          },
        });
        if (duplicate && duplicate.id !== contact.id) {
          throw new ConflictException({
            code: 'CLIENT_CONTACT_EMAIL_EXISTS',
            message: `A client contact with email ${normalizedEmail} already exists for client ${clientId}.`,
          });
        }
      }
      contact.email = normalizedEmail;
    }

    if (dto.fullName !== undefined) {
      const value = dto.fullName.trim();
      if (!value) {
        throw new BadRequestException({
          code: 'CLIENT_CONTACT_NAME_REQUIRED',
          message: 'Client contact full name cannot be empty.',
        });
      }
      contact.fullName = value;
    }

    if (dto.phone !== undefined) {
      contact.phone = dto.phone.trim() || null;
    }

    if (dto.title !== undefined) {
      contact.title = dto.title.trim() || null;
    }

    if (dto.department !== undefined) {
      contact.department = dto.department.trim() || null;
    }

    if (dto.roleCodes !== undefined) {
      contact.roleCodes = this.normalizeRoleCodes(dto.roleCodes);
    }

    if (dto.isActive !== undefined) {
      contact.isActive = dto.isActive;
    }

    if (dto.isPrimary !== undefined) {
      contact.isPrimary = dto.isPrimary;
      if (dto.isPrimary) {
        await this.clearExistingPrimary(clientId, contact.id, currentUser.id);
      }
    }

    if (dto.metadata !== undefined) {
      contact.metadata = dto.metadata;
    }

    contact.updatedByUserId = currentUser.id;

    const saved = await this.contactRepository.save(contact);
    return this.toResponse(saved);
  }

  async remove(clientId: string, contactId: string, currentUser: User): Promise<void> {
    await this.requireClient(clientId, currentUser);

    const contact = await this.contactRepository.findOne({
      where: {
        id: contactId,
        clientId,
      },
    });

    if (!contact) {
      throw new NotFoundException({
        code: 'CLIENT_CONTACT_NOT_FOUND',
        message: `Client contact ${contactId} was not found for client ${clientId}.`,
      });
    }

    await this.contactRepository.remove(contact);
  }

  private async requireClient(clientId: string, currentUser: User): Promise<void> {
    assertClientBoundary(clientId, currentUser);

    const exists = await this.clientRepository.exist({ where: { id: clientId } });
    if (!exists) {
      throw new NotFoundException({
        code: 'CLIENT_NOT_FOUND',
        message: `Client ${clientId} was not found.`,
      });
    }
  }

  private normalizeRoleCodes(value: string[] | undefined): string[] {
    if (!value || value.length === 0) {
      return [];
    }
    return Array.from(
      new Set(value.map((entry) => entry.trim().toLowerCase()).filter((entry) => entry.length > 0)),
    );
  }

  private async clearExistingPrimary(
    clientId: string,
    exceptContactId: string | null,
    actorUserId: string,
  ): Promise<void> {
    const currentPrimary = await this.contactRepository.find({
      where: {
        clientId,
        isPrimary: true,
      },
    });

    for (const item of currentPrimary) {
      if (exceptContactId && item.id === exceptContactId) {
        continue;
      }
      item.isPrimary = false;
      item.updatedByUserId = actorUserId;
      await this.contactRepository.save(item);
    }
  }

  private toResponse(contact: ClientContact): ClientContactResponseDto {
    return {
      id: contact.id,
      clientId: contact.clientId,
      fullName: contact.fullName,
      email: contact.email,
      phone: contact.phone,
      title: contact.title,
      department: contact.department,
      roleCodes: contact.roleCodes ?? [],
      isPrimary: contact.isPrimary,
      isActive: contact.isActive,
      metadata: contact.metadata ?? {},
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    };
  }
}
