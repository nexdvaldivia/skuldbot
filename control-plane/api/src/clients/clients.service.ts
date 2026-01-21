import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client, ClientStatus } from './entities/client.entity';
import {
  CreateClientDto,
  UpdateClientDto,
  ClientResponseDto,
  ClientDetailResponseDto,
} from './dto/client.dto';
import { PaymentProvider } from '../common/interfaces/integration.interface';
import { PAYMENT_PROVIDER } from '../integrations/payment/payment.module';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  async findAll(): Promise<ClientResponseDto[]> {
    const clients = await this.clientRepository.find({
      relations: ['tenants'],
      order: { createdAt: 'DESC' },
    });

    return clients.map((client) => this.toResponseDto(client));
  }

  async findOne(id: string): Promise<ClientDetailResponseDto> {
    const client = await this.clientRepository.findOne({
      where: { id },
      relations: ['tenants'],
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    return this.toDetailDto(client);
  }

  async findBySlug(slug: string): Promise<ClientDetailResponseDto> {
    const client = await this.clientRepository.findOne({
      where: { slug },
      relations: ['tenants'],
    });

    if (!client) {
      throw new NotFoundException(`Client with slug ${slug} not found`);
    }

    return this.toDetailDto(client);
  }

  async create(dto: CreateClientDto): Promise<ClientDetailResponseDto> {
    const existing = await this.clientRepository.findOne({
      where: [{ slug: dto.slug }, { name: dto.name }],
    });

    if (existing) {
      throw new ConflictException('Client with this name or slug already exists');
    }

    const client = this.clientRepository.create({
      ...dto,
      status: ClientStatus.PENDING,
    });

    // Create Stripe customer if payment provider is configured
    if (this.paymentProvider.isConfigured()) {
      try {
        const customer = await this.paymentProvider.createCustomer({
          email: dto.billingEmail,
          name: dto.name,
          metadata: { slug: dto.slug },
        });
        client.stripeCustomerId = customer.id;
        this.logger.log(`Created Stripe customer ${customer.id} for client ${dto.slug}`);
      } catch (error) {
        this.logger.error(`Failed to create Stripe customer for ${dto.slug}`, error);
      }
    }

    const saved = await this.clientRepository.save(client);
    return this.toDetailDto(saved);
  }

  async update(id: string, dto: UpdateClientDto): Promise<ClientDetailResponseDto> {
    const client = await this.clientRepository.findOne({
      where: { id },
      relations: ['tenants'],
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    // Update Stripe customer if email changed
    if (dto.billingEmail && dto.billingEmail !== client.billingEmail && client.stripeCustomerId) {
      if (this.paymentProvider.isConfigured()) {
        try {
          await this.paymentProvider.updateCustomer(client.stripeCustomerId, {
            email: dto.billingEmail,
            name: dto.name || client.name,
          });
        } catch (error) {
          this.logger.error(`Failed to update Stripe customer for ${client.slug}`, error);
        }
      }
    }

    Object.assign(client, dto);
    const saved = await this.clientRepository.save(client);
    return this.toDetailDto(saved);
  }

  async delete(id: string): Promise<void> {
    const client = await this.clientRepository.findOne({
      where: { id },
      relations: ['tenants'],
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    if (client.tenants && client.tenants.length > 0) {
      throw new ConflictException('Cannot delete client with active tenants');
    }

    // Delete Stripe customer
    if (client.stripeCustomerId && this.paymentProvider.isConfigured()) {
      try {
        await this.paymentProvider.deleteCustomer(client.stripeCustomerId);
      } catch (error) {
        this.logger.error(`Failed to delete Stripe customer for ${client.slug}`, error);
      }
    }

    await this.clientRepository.remove(client);
  }

  async activate(id: string): Promise<ClientDetailResponseDto> {
    const client = await this.clientRepository.findOne({
      where: { id },
      relations: ['tenants'],
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    client.status = ClientStatus.ACTIVE;
    const saved = await this.clientRepository.save(client);
    return this.toDetailDto(saved);
  }

  async suspend(id: string): Promise<ClientDetailResponseDto> {
    const client = await this.clientRepository.findOne({
      where: { id },
      relations: ['tenants'],
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    client.status = ClientStatus.SUSPENDED;
    const saved = await this.clientRepository.save(client);
    return this.toDetailDto(saved);
  }

  private toResponseDto(client: Client): ClientResponseDto {
    return {
      id: client.id,
      name: client.name,
      slug: client.slug,
      plan: client.plan,
      status: client.status,
      billingEmail: client.billingEmail,
      tenantsCount: client.tenants?.length || 0,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };
  }

  private toDetailDto(client: Client): ClientDetailResponseDto {
    return {
      ...this.toResponseDto(client),
      stripeCustomerId: client.stripeCustomerId,
      stripeSubscriptionId: client.stripeSubscriptionId,
      settings: client.settings,
      metadata: client.metadata,
    };
  }
}
