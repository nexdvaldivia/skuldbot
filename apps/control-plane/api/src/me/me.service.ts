import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  ClientAddressListResponseDto,
  ClientAddressResponseDto,
  CreateClientAddressDto,
  ListClientAddressesQueryDto,
  UpdateClientAddressDto,
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
import { Client } from '../clients/entities/client.entity';
import { SecurityAuditEvent } from '../common/audit/entities/security-audit-event.entity';
import { PaymentProvider } from '../common/interfaces/integration.interface';
import { PAYMENT_PROVIDER } from '../integrations/payment/payment.module';
import { PaymentConfig, ProductType } from '../billing/entities/payment-config.entity';
import { PaymentMethodType, TenantSubscription } from '../billing/entities/subscription.entity';
import { PaymentMethodService } from '../billing/payment-method.service';
import { Tenant } from '../tenants/entities/tenant.entity';
import { UploadUserAvatarDto } from '../users/dto/user.dto';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  AddMyAddonDto,
  AddPaymentMethodDto,
  AcceptMyContractDto,
  AddonBillingCycle,
  MyInfoDto,
  SetDefaultPaymentMethodDto,
  UpdateMyNotificationPreferencesDto,
  UpdateMyProfileDto,
  UpdateMyUserProfileDto,
} from './me.dto';

const REQUIRED_CONTRACTS_BY_PLAN: Record<string, string[]> = {
  free: ['terms_of_service'],
  pro: ['master_service_agreement', 'data_processing_agreement'],
  enterprise: [
    'master_service_agreement',
    'data_processing_agreement',
    'business_associate_agreement',
  ],
};

const ADDON_CATALOG: Array<{
  id: string;
  name: string;
  description: string;
  monthlyPriceUsd: number;
  annualPriceUsd: number;
}> = [
  {
    id: 'advanced-analytics',
    name: 'Advanced Analytics',
    description: 'Enhanced dashboards, cohorts, and exportable BI datasets.',
    monthlyPriceUsd: 79,
    annualPriceUsd: 790,
  },
  {
    id: 'compliance-plus',
    name: 'Compliance Plus',
    description: 'Extended compliance evidence retention and additional controls.',
    monthlyPriceUsd: 129,
    annualPriceUsd: 1290,
  },
  {
    id: 'premium-support',
    name: 'Premium Support',
    description: 'Priority support queue with SLA-backed response times.',
    monthlyPriceUsd: 199,
    annualPriceUsd: 1990,
  },
];

type StoredClientContract = {
  id: string;
  templateType: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  pdfPath: string | null;
  signerEmail: string | null;
};

type StoredAddon = {
  id: string;
  billingCycle: AddonBillingCycle;
  status: 'active' | 'removed';
  activatedAt: string;
  removedAt: string | null;
};

@Injectable()
export class MeService {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly clientAddressesService: ClientAddressesService,
    private readonly clientContactsService: ClientContactsService,
    private readonly paymentMethodService: PaymentMethodService,
    private readonly usersService: UsersService,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantSubscription)
    private readonly subscriptionRepository: Repository<TenantSubscription>,
    @InjectRepository(PaymentConfig)
    private readonly paymentConfigRepository: Repository<PaymentConfig>,
    @InjectRepository(SecurityAuditEvent)
    private readonly securityAuditRepository: Repository<SecurityAuditEvent>,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
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
    const tenantIds = await this.getTenantIds(clientId);
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

  async getPaymentMethodSetup(currentUser: User): Promise<Record<string, unknown>> {
    const client = await this.requireClient(currentUser);
    const stripeCustomerId = await this.resolveStripeCustomerId(client);

    if (!this.paymentProvider.createACHSetupIntent) {
      throw new BadRequestException({
        code: 'PAYMENT_PROVIDER_CAPABILITY_MISSING',
        message: 'Current payment provider does not support ACH setup intents.',
      });
    }

    const setup = await this.paymentProvider.createACHSetupIntent(stripeCustomerId, {
      clientId: client.id,
      origin: 'control-plane-me',
    });

    return {
      clientId: client.id,
      customerId: stripeCustomerId,
      ...setup,
    };
  }

  async listPaymentMethods(currentUser: User): Promise<Record<string, unknown>> {
    const client = await this.requireClient(currentUser);
    const subscription = await this.getLatestSubscription(client.id);
    if (!client.stripeCustomerId || !this.paymentProvider.getCustomerBankAccount) {
      return {
        items: subscription ? [this.mapSubscriptionPaymentMethod(subscription)] : [],
        defaultPaymentMethodId: subscription?.stripePaymentMethodId ?? null,
        provider: this.paymentProvider.name,
      };
    }

    const bankAccount = await this.paymentProvider.getCustomerBankAccount(client.stripeCustomerId);
    const fallback = subscription ? [this.mapSubscriptionPaymentMethod(subscription)] : [];
    const items = bankAccount
      ? [
          {
            id: bankAccount.id,
            type: PaymentMethodType.ACH_DEBIT,
            bankName: bankAccount.bankName,
            last4: bankAccount.last4,
            accountType: bankAccount.accountType,
            status: bankAccount.status,
            isDefault: bankAccount.id === (subscription?.stripePaymentMethodId ?? bankAccount.id),
          },
        ]
      : fallback;

    return {
      items,
      defaultPaymentMethodId: subscription?.stripePaymentMethodId ?? bankAccount?.id ?? null,
      provider: this.paymentProvider.name,
    };
  }

  async addPaymentMethod(
    currentUser: User,
    dto: AddPaymentMethodDto,
    requestIp: string | null,
  ): Promise<Record<string, unknown>> {
    const client = await this.requireClient(currentUser);
    const customerId = await this.resolveStripeCustomerId(client);

    if (!this.paymentProvider.setDefaultPaymentMethod) {
      throw new BadRequestException({
        code: 'PAYMENT_PROVIDER_CAPABILITY_MISSING',
        message: 'Current payment provider cannot set a default payment method.',
      });
    }

    if (dto.setAsDefault !== false) {
      await this.paymentProvider.setDefaultPaymentMethod(customerId, dto.paymentMethodId);
    }

    await this.applyPaymentMethodToClientSubscriptions(client.id, dto.paymentMethodId);
    await this.recordAuditEvent({
      action: 'me.payment_method_added',
      actor: currentUser,
      targetType: 'client',
      targetId: client.id,
      requestIp,
      details: {
        paymentMethodId: dto.paymentMethodId,
        setAsDefault: dto.setAsDefault !== false,
      },
    });

    return {
      success: true,
      paymentMethodId: dto.paymentMethodId,
      setAsDefault: dto.setAsDefault !== false,
    };
  }

  async setDefaultPaymentMethod(
    currentUser: User,
    dto: SetDefaultPaymentMethodDto,
    requestIp: string | null,
  ): Promise<Record<string, unknown>> {
    const client = await this.requireClient(currentUser);
    const customerId = await this.resolveStripeCustomerId(client);

    if (!this.paymentProvider.setDefaultPaymentMethod) {
      throw new BadRequestException({
        code: 'PAYMENT_PROVIDER_CAPABILITY_MISSING',
        message: 'Current payment provider cannot set a default payment method.',
      });
    }

    await this.paymentProvider.setDefaultPaymentMethod(customerId, dto.paymentMethodId);
    await this.applyPaymentMethodToClientSubscriptions(client.id, dto.paymentMethodId);
    await this.recordAuditEvent({
      action: 'me.payment_method_set_default',
      actor: currentUser,
      targetType: 'client',
      targetId: client.id,
      requestIp,
      details: { paymentMethodId: dto.paymentMethodId },
    });

    return {
      success: true,
      paymentMethodId: dto.paymentMethodId,
    };
  }

  async deletePaymentMethod(
    currentUser: User,
    paymentMethodId: string,
    requestIp: string | null,
  ): Promise<void> {
    const client = await this.requireClient(currentUser);
    if (this.paymentProvider.detachPaymentMethod) {
      await this.paymentProvider.detachPaymentMethod(paymentMethodId);
    }

    const tenantIds = await this.getTenantIds(client.id);
    if (tenantIds.length > 0) {
      const subscriptions = await this.subscriptionRepository.find({
        where: { tenantId: In(tenantIds), stripePaymentMethodId: paymentMethodId },
      });
      for (const subscription of subscriptions) {
        subscription.stripePaymentMethodId = undefined;
        subscription.bankAccountLast4 = undefined;
        subscription.bankName = undefined;
        subscription.bankAccountType = undefined;
      }
      if (subscriptions.length > 0) {
        await this.subscriptionRepository.save(subscriptions);
      }
    }

    await this.recordAuditEvent({
      action: 'me.payment_method_deleted',
      actor: currentUser,
      targetType: 'client',
      targetId: client.id,
      requestIp,
      details: { paymentMethodId },
    });
  }

  async getPaymentConfig(currentUser: User): Promise<Record<string, unknown>> {
    const client = await this.requireClient(currentUser);
    const configs = await this.paymentConfigRepository.find({
      where: { isActive: true },
      order: { productType: 'ASC' },
    });

    const inferredProductType = this.resolveProductTypeForPlan(client.plan);
    const amountHint = Number(
      (client.settings as Record<string, unknown> | undefined)?.monthlyAmountCents,
    );
    const selection = await this.paymentMethodService.getAllowedPaymentMethods(
      inferredProductType,
      Number.isFinite(amountHint) ? Math.max(100, Math.round(amountHint)) : 25000,
    );

    return {
      clientPlan: client.plan,
      inferredProductType,
      selection,
      configs: configs.map((config) => ({
        productType: config.productType,
        achEnabled: config.achEnabled,
        cardEnabled: config.cardEnabled,
        preferredMethod: config.preferredMethod,
        cardMaxAmountCents: config.cardMaxAmountCents,
        achMinAmountCents: config.achMinAmountCents,
      })),
    };
  }

  async getRequiredContracts(currentUser: User): Promise<Record<string, unknown>> {
    const client = await this.requireClient(currentUser);
    const contracts = this.getStoredContracts(client);
    const requiredTypes = this.getRequiredContractTypes(client.plan);

    return {
      clientId: client.id,
      required: requiredTypes.map((templateType) => {
        const matching = contracts.find(
          (contract) =>
            contract.templateType === templateType &&
            ['active', 'signed', 'accepted'].includes(contract.status),
        );
        return {
          templateType,
          satisfied: Boolean(matching),
          acceptedAt: matching?.acceptedAt ?? null,
          contractId: matching?.id ?? null,
        };
      }),
      contracts,
    };
  }

  async acceptContract(
    currentUser: User,
    dto: AcceptMyContractDto,
    requestIp: string | null,
  ): Promise<Record<string, unknown>> {
    const client = await this.requireClient(currentUser);
    const contracts = this.getStoredContracts(client);
    const nowIso = new Date().toISOString();
    const existingIndex = contracts.findIndex(
      (contract) =>
        (dto.contractId && contract.id === dto.contractId) ||
        (!dto.contractId && contract.templateType === dto.templateType),
    );

    if (existingIndex >= 0) {
      contracts[existingIndex] = {
        ...contracts[existingIndex],
        status: 'active',
        acceptedAt: nowIso,
        signerEmail: currentUser.email,
      };
    } else {
      contracts.push({
        id: `contract_${Math.random().toString(36).slice(2, 10)}`,
        templateType: dto.templateType,
        status: 'active',
        createdAt: nowIso,
        sentAt: nowIso,
        acceptedAt: nowIso,
        revokedAt: null,
        revocationReason: null,
        pdfPath: null,
        signerEmail: currentUser.email,
      });
    }

    client.metadata = {
      ...(client.metadata || {}),
      contracts,
    };
    await this.clientRepository.save(client);

    await this.recordAuditEvent({
      action: 'me.contract_accepted',
      actor: currentUser,
      targetType: 'client',
      targetId: client.id,
      requestIp,
      details: {
        templateType: dto.templateType,
        contractId: dto.contractId ?? null,
      },
    });

    return {
      accepted: true,
      templateType: dto.templateType,
      acceptedAt: nowIso,
    };
  }

  async listAvailableAddons(currentUser: User): Promise<Record<string, unknown>> {
    const client = await this.requireClient(currentUser);
    const activeAddonIds = new Set(
      this.getStoredAddons(client)
        .filter((addon) => addon.status === 'active')
        .map((addon) => addon.id),
    );
    return {
      addons: ADDON_CATALOG.map((addon) => ({
        ...addon,
        active: activeAddonIds.has(addon.id),
      })),
    };
  }

  async listMyAddons(currentUser: User): Promise<Record<string, unknown>> {
    const client = await this.requireClient(currentUser);
    const stored = this.getStoredAddons(client);
    return {
      addons: stored
        .filter((addon) => addon.status === 'active')
        .map((addon) => ({
          ...addon,
          catalog: ADDON_CATALOG.find((entry) => entry.id === addon.id) ?? null,
        })),
    };
  }

  async getAddonPreview(currentUser: User, addonId: string): Promise<Record<string, unknown>> {
    const client = await this.requireClient(currentUser);
    const addon = this.requireAddon(addonId);
    const planDiscount = client.plan === 'enterprise' ? 0.15 : client.plan === 'pro' ? 0.1 : 0;
    return {
      addonId,
      addonName: addon.name,
      monthlyPriceUsd: addon.monthlyPriceUsd,
      annualPriceUsd: addon.annualPriceUsd,
      discountPercent: Math.round(planDiscount * 100),
      monthlyEffectiveUsd: Number((addon.monthlyPriceUsd * (1 - planDiscount)).toFixed(2)),
      annualEffectiveUsd: Number((addon.annualPriceUsd * (1 - planDiscount)).toFixed(2)),
    };
  }

  async addAddon(
    currentUser: User,
    addonId: string,
    dto: AddMyAddonDto,
    requestIp: string | null,
  ): Promise<Record<string, unknown>> {
    const client = await this.requireClient(currentUser);
    this.requireAddon(addonId);
    const stored = this.getStoredAddons(client);
    const existing = stored.find((addon) => addon.id === addonId && addon.status === 'active');
    if (existing) {
      throw new BadRequestException({
        code: 'ADDON_ALREADY_ACTIVE',
        message: `Addon ${addonId} is already active.`,
      });
    }

    stored.push({
      id: addonId,
      billingCycle: dto.billingCycle ?? AddonBillingCycle.MONTHLY,
      status: 'active',
      activatedAt: new Date().toISOString(),
      removedAt: null,
    });

    client.settings = {
      ...(client.settings || {}),
      addons: stored,
    };
    await this.clientRepository.save(client);

    await this.recordAuditEvent({
      action: 'me.addon_added',
      actor: currentUser,
      targetType: 'client',
      targetId: client.id,
      requestIp,
      details: {
        addonId,
        billingCycle: dto.billingCycle ?? AddonBillingCycle.MONTHLY,
      },
    });

    return {
      success: true,
      addonId,
    };
  }

  async removeAddon(currentUser: User, addonId: string, requestIp: string | null): Promise<void> {
    const client = await this.requireClient(currentUser);
    const stored = this.getStoredAddons(client);
    const addon = stored.find((entry) => entry.id === addonId && entry.status === 'active');
    if (!addon) {
      throw new NotFoundException({
        code: 'ADDON_NOT_FOUND',
        message: `Addon ${addonId} is not active.`,
      });
    }

    addon.status = 'removed';
    addon.removedAt = new Date().toISOString();
    client.settings = {
      ...(client.settings || {}),
      addons: stored,
    };
    await this.clientRepository.save(client);

    await this.recordAuditEvent({
      action: 'me.addon_removed',
      actor: currentUser,
      targetType: 'client',
      targetId: client.id,
      requestIp,
      details: { addonId },
    });
  }

  async getNotificationPreferences(currentUser: User): Promise<Record<string, unknown>> {
    const user = await this.requireUser(currentUser.id);
    const settings = this.getNotificationSettings(user);
    return {
      billingEmails: settings.billingEmails,
      contractEmails: settings.contractEmails,
      securityEmails: settings.securityEmails,
    };
  }

  async updateNotificationPreferences(
    currentUser: User,
    dto: UpdateMyNotificationPreferencesDto,
    requestIp: string | null,
  ): Promise<Record<string, unknown>> {
    const user = await this.requireUser(currentUser.id);
    const settings = this.getNotificationSettings(user);
    const next = {
      billingEmails: dto.billingEmails ?? settings.billingEmails,
      contractEmails: dto.contractEmails ?? settings.contractEmails,
      securityEmails: dto.securityEmails ?? settings.securityEmails,
    };

    user.settings = {
      ...(user.settings || {}),
      notifications: next,
    };
    await this.userRepository.save(user);

    await this.recordAuditEvent({
      action: 'me.notification_preferences_updated',
      actor: currentUser,
      targetType: 'user',
      targetId: user.id,
      requestIp,
      details: next,
    });

    return next;
  }

  async getMyUserProfile(currentUser: User): Promise<Record<string, unknown>> {
    const profile = await this.usersService.findOne(currentUser.id);
    return {
      id: profile.id,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      role: profile.role,
      roles: profile.roles,
      status: profile.status,
      clientId: profile.clientId,
      mfaEnabled: profile.mfaEnabled,
      avatarUrl: profile.avatarUrl,
      lastLoginAt: profile.lastLoginAt,
    };
  }

  async updateMyUserProfile(
    currentUser: User,
    dto: UpdateMyUserProfileDto,
  ): Promise<Record<string, unknown>> {
    const user = await this.requireUser(currentUser.id);
    if (dto.firstName !== undefined) {
      user.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      user.lastName = dto.lastName;
    }
    await this.userRepository.save(user);
    return this.getMyUserProfile(currentUser);
  }

  async uploadMyAvatar(
    currentUser: User,
    dto: UploadUserAvatarDto,
    requestIp: string | null,
  ): Promise<Record<string, unknown>> {
    const response = await this.usersService.uploadAvatar(
      currentUser.id,
      dto,
      currentUser,
      requestIp,
    );
    return { ...response };
  }

  async deleteMyAvatar(
    currentUser: User,
    requestIp: string | null,
  ): Promise<Record<string, unknown>> {
    const response = await this.usersService.deleteAvatar(currentUser.id, currentUser, requestIp);
    return { ...response };
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

  private async requireClient(currentUser: User): Promise<Client> {
    const clientId = this.requireClientContext(currentUser);
    const client = await this.clientRepository.findOne({ where: { id: clientId } });
    if (!client) {
      throw new NotFoundException({
        code: 'CLIENT_NOT_FOUND',
        message: `Client ${clientId} not found.`,
      });
    }
    return client;
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `User ${userId} not found.`,
      });
    }
    return user;
  }

  private async resolveStripeCustomerId(client: Client): Promise<string> {
    if (client.stripeCustomerId) {
      return client.stripeCustomerId;
    }

    const customer = await this.paymentProvider.createCustomer({
      email: client.billingEmail,
      name: client.name,
      metadata: {
        clientId: client.id,
        source: 'control-plane-me',
      },
    });

    client.stripeCustomerId = customer.id;
    await this.clientRepository.save(client);
    return customer.id;
  }

  private async getTenantIds(clientId: string): Promise<string[]> {
    const tenants = await this.tenantRepository.find({
      where: { clientId },
      select: ['id'],
    });
    return tenants.map((tenant) => tenant.id);
  }

  private async getLatestSubscription(clientId: string): Promise<TenantSubscription | null> {
    const tenantIds = await this.getTenantIds(clientId);
    if (tenantIds.length === 0) {
      return null;
    }

    return this.subscriptionRepository.findOne({
      where: { tenantId: In(tenantIds) },
      order: { updatedAt: 'DESC' },
    });
  }

  private async applyPaymentMethodToClientSubscriptions(
    clientId: string,
    paymentMethodId: string,
  ): Promise<void> {
    const tenantIds = await this.getTenantIds(clientId);
    if (tenantIds.length === 0) {
      return;
    }

    const subscriptions = await this.subscriptionRepository.find({
      where: { tenantId: In(tenantIds) },
    });

    for (const subscription of subscriptions) {
      subscription.stripePaymentMethodId = paymentMethodId;
      if (subscription.paymentMethodType !== PaymentMethodType.ACH_DEBIT) {
        subscription.paymentMethodType = PaymentMethodType.ACH_DEBIT;
      }
    }

    if (subscriptions.length > 0) {
      await this.subscriptionRepository.save(subscriptions);
    }
  }

  private mapSubscriptionPaymentMethod(subscription: TenantSubscription): Record<string, unknown> {
    return {
      id: subscription.stripePaymentMethodId,
      type: subscription.paymentMethodType,
      bankName: subscription.bankName,
      last4: subscription.bankAccountLast4,
      accountType: subscription.bankAccountType,
      isDefault: Boolean(subscription.stripePaymentMethodId),
    };
  }

  private getRequiredContractTypes(plan: string): string[] {
    return REQUIRED_CONTRACTS_BY_PLAN[plan] ?? REQUIRED_CONTRACTS_BY_PLAN.free;
  }

  private getStoredContracts(client: Client): StoredClientContract[] {
    const metadata = (client.metadata || {}) as Record<string, unknown>;
    const raw = metadata.contracts;
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        id: String(item.id ?? ''),
        templateType: String(item.templateType ?? ''),
        status: String(item.status ?? 'pending'),
        createdAt: String(item.createdAt ?? new Date().toISOString()),
        sentAt: item.sentAt ? String(item.sentAt) : null,
        acceptedAt: item.acceptedAt ? String(item.acceptedAt) : null,
        revokedAt: item.revokedAt ? String(item.revokedAt) : null,
        revocationReason: item.revocationReason ? String(item.revocationReason) : null,
        pdfPath: item.pdfPath ? String(item.pdfPath) : null,
        signerEmail: item.signerEmail ? String(item.signerEmail) : null,
      }))
      .filter((item) => item.id && item.templateType);
  }

  private getStoredAddons(client: Client): StoredAddon[] {
    const settings = (client.settings || {}) as Record<string, unknown>;
    const raw = settings.addons;
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        id: String(item.id ?? ''),
        billingCycle:
          item.billingCycle === AddonBillingCycle.ANNUAL
            ? AddonBillingCycle.ANNUAL
            : AddonBillingCycle.MONTHLY,
        status: (item.status === 'removed' ? 'removed' : 'active') as 'active' | 'removed',
        activatedAt: String(item.activatedAt ?? new Date().toISOString()),
        removedAt: item.removedAt ? String(item.removedAt) : null,
      }))
      .filter((item) => item.id);
  }

  private requireAddon(addonId: string) {
    const addon = ADDON_CATALOG.find((entry) => entry.id === addonId);
    if (!addon) {
      throw new NotFoundException({
        code: 'ADDON_NOT_FOUND',
        message: `Addon ${addonId} not found.`,
      });
    }
    return addon;
  }

  private getNotificationSettings(user: User): {
    billingEmails: boolean;
    contractEmails: boolean;
    securityEmails: boolean;
  } {
    const settings = (user.settings || {}) as Record<string, unknown>;
    const notifications = (settings.notifications || {}) as Record<string, unknown>;
    return {
      billingEmails: notifications.billingEmails !== false,
      contractEmails: notifications.contractEmails !== false,
      securityEmails: notifications.securityEmails !== false,
    };
  }

  private resolveProductTypeForPlan(plan: string): ProductType {
    if (plan === 'enterprise') {
      return ProductType.ENTERPRISE;
    }
    if (plan === 'pro' || plan === 'professional') {
      return ProductType.ORCHESTRATOR;
    }
    return ProductType.MARKETPLACE_BOT;
  }

  private async recordAuditEvent(input: {
    action: string;
    actor: User;
    targetType: string;
    targetId: string;
    requestIp: string | null;
    details: Record<string, unknown>;
  }): Promise<void> {
    await this.securityAuditRepository.save(
      this.securityAuditRepository.create({
        category: 'me',
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        actorUserId: input.actor.id,
        actorEmail: input.actor.email,
        requestIp: input.requestIp,
        details: input.details,
      }),
    );
  }
}
