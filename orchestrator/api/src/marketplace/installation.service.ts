import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BotInstallation, InstallationStatus } from './entities/bot-installation.entity';
import { CatalogService, CatalogBot } from './catalog.service';
import { LicenseService } from '../license/license.service';

/**
 * Install Bot DTO
 */
export interface InstallBotDto {
  marketplaceBotId: string;
  vaultMappings?: Record<string, string>;
  connectionConfigs?: Record<string, Record<string, unknown>>;
  customConfig?: Record<string, unknown>;
}

/**
 * Configure Installation DTO
 */
export interface ConfigureInstallationDto {
  vaultMappings?: Record<string, string>;
  connectionConfigs?: Record<string, Record<string, unknown>>;
  customConfig?: Record<string, unknown>;
  schedules?: {
    id: string;
    cron: string;
    enabled: boolean;
    timezone: string;
  }[];
  autoUpdate?: boolean;
}

/**
 * Installation Service
 *
 * Manages bot installations in the Orchestrator.
 *
 * Features:
 * - Install bots from marketplace
 * - Configure vault mappings
 * - Manage subscriptions
 * - Track usage
 */
@Injectable()
export class InstallationService {
  private readonly logger = new Logger(InstallationService.name);

  constructor(
    @InjectRepository(BotInstallation)
    private readonly installationRepository: Repository<BotInstallation>,
    private readonly catalogService: CatalogService,
    private readonly configService: ConfigService,
    private readonly licenseService: LicenseService,
  ) {}

  /**
   * Install a bot from the marketplace
   */
  async installBot(dto: InstallBotDto, installedBy?: string): Promise<BotInstallation> {
    const tenantId = this.licenseService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('No valid license/tenant');
    }

    // Check if already installed
    const existing = await this.installationRepository.findOne({
      where: { tenantId, marketplaceBotId: dto.marketplaceBotId },
    });

    if (existing) {
      throw new ConflictException('Bot is already installed');
    }

    // Get bot details from catalog
    const bot = await this.catalogService.getBotById(dto.marketplaceBotId);
    if (!bot) {
      throw new NotFoundException('Bot not found in marketplace');
    }

    // Create installation
    const installation = this.installationRepository.create({
      tenantId,
      marketplaceBotId: dto.marketplaceBotId,
      botName: bot.name,
      botSlug: bot.slug,
      installedVersion: bot.currentVersion,
      latestAvailableVersion: bot.currentVersion,
      status: InstallationStatus.PENDING_CONFIG,
      vaultMappings: dto.vaultMappings || {},
      connectionConfigs: dto.connectionConfigs || {},
      customConfig: dto.customConfig,
      installedBy,
      isTrialing: (bot.pricing.trialDays ?? 0) > 0,
      trialEndDate:
        (bot.pricing.trialDays ?? 0) > 0
          ? new Date(Date.now() + bot.pricing.trialDays! * 24 * 60 * 60 * 1000)
          : undefined,
    });

    await this.installationRepository.save(installation);

    // Notify Control-Plane of installation
    await this.notifyInstallation(installation, bot);

    this.logger.log(`Bot ${bot.name} installed for tenant ${tenantId}`);

    return installation;
  }

  /**
   * Configure an installation (vault mappings, etc.)
   */
  async configureInstallation(
    id: string,
    dto: ConfigureInstallationDto,
  ): Promise<BotInstallation> {
    const installation = await this.getInstallationById(id);

    if (dto.vaultMappings) {
      installation.vaultMappings = {
        ...installation.vaultMappings,
        ...dto.vaultMappings,
      };
    }

    if (dto.connectionConfigs) {
      installation.connectionConfigs = {
        ...installation.connectionConfigs,
        ...dto.connectionConfigs,
      };
    }

    if (dto.customConfig !== undefined) {
      installation.customConfig = dto.customConfig;
    }

    if (dto.schedules !== undefined) {
      installation.schedules = dto.schedules;
    }

    if (dto.autoUpdate !== undefined) {
      installation.autoUpdate = dto.autoUpdate;
    }

    // Check if all required mappings are configured
    const bot = await this.catalogService.getBotById(installation.marketplaceBotId);
    if (bot && this.isFullyConfigured(installation, bot)) {
      installation.status = InstallationStatus.ACTIVE;
      installation.configuredAt = new Date();
    }

    await this.installationRepository.save(installation);

    return installation;
  }

  /**
   * Uninstall a bot
   */
  async uninstallBot(id: string, reason?: string): Promise<void> {
    const installation = await this.getInstallationById(id);

    // Cancel subscription if active
    if (installation.stripeSubscriptionId) {
      await this.cancelSubscription(installation);
    }

    // Mark as cancelled
    installation.status = InstallationStatus.CANCELLED;
    installation.cancelledAt = new Date();
    installation.cancellationReason = reason;

    await this.installationRepository.save(installation);

    // Notify Control-Plane
    await this.notifyUninstallation(installation);

    this.logger.log(`Bot ${installation.botName} uninstalled for tenant ${installation.tenantId}`);
  }

  /**
   * Get installation by ID
   */
  async getInstallationById(id: string): Promise<BotInstallation> {
    const tenantId = this.licenseService.getTenantId();

    const installation = await this.installationRepository.findOne({
      where: { id, tenantId: tenantId || undefined },
    });

    if (!installation) {
      throw new NotFoundException('Installation not found');
    }

    return installation;
  }

  /**
   * Get all installations for tenant
   */
  async getInstallations(options: {
    status?: InstallationStatus;
    page?: number;
    limit?: number;
  } = {}): Promise<{ data: BotInstallation[]; total: number }> {
    const tenantId = this.licenseService.getTenantId();
    if (!tenantId) {
      return { data: [], total: 0 };
    }

    const { status, page = 1, limit = 20 } = options;

    const where: Record<string, unknown> = { tenantId };
    if (status) {
      where.status = status;
    }

    const [data, total] = await this.installationRepository.findAndCount({
      where,
      order: { installedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total };
  }

  /**
   * Check if bot is installed
   */
  async isInstalled(marketplaceBotId: string): Promise<boolean> {
    const tenantId = this.licenseService.getTenantId();
    if (!tenantId) {
      return false;
    }

    const installation = await this.installationRepository.findOne({
      where: {
        tenantId,
        marketplaceBotId,
        status: InstallationStatus.ACTIVE,
      },
    });

    return !!installation;
  }

  /**
   * Get installation by marketplace bot ID
   */
  async getInstallationByBotId(marketplaceBotId: string): Promise<BotInstallation | null> {
    const tenantId = this.licenseService.getTenantId();
    if (!tenantId) {
      return null;
    }

    return this.installationRepository.findOne({
      where: { tenantId, marketplaceBotId },
    });
  }

  /**
   * Update installation stats after a run
   */
  async recordRun(
    installationId: string,
    success: boolean,
    durationSeconds: number,
  ): Promise<void> {
    const installation = await this.installationRepository.findOne({
      where: { id: installationId },
    });

    if (!installation) {
      return;
    }

    installation.totalRuns++;
    if (success) {
      installation.successfulRuns++;
    } else {
      installation.failedRuns++;
    }
    installation.lastRunAt = new Date();

    // Update average duration
    const totalDuration =
      installation.avgRunDurationSeconds * (installation.totalRuns - 1) + durationSeconds;
    installation.avgRunDurationSeconds = totalDuration / installation.totalRuns;

    await this.installationRepository.save(installation);
  }

  /**
   * Record usage event for metered billing
   */
  async recordUsage(
    installationId: string,
    metric: string,
    quantity: number,
  ): Promise<void> {
    const installation = await this.installationRepository.findOne({
      where: { id: installationId },
    });

    if (!installation) {
      return;
    }

    // Update current period usage
    installation.usageThisPeriod[metric] =
      (installation.usageThisPeriod[metric] || 0) + quantity;

    // Update lifetime usage
    installation.usageLifetime[metric] =
      (installation.usageLifetime[metric] || 0) + quantity;

    installation.lastUsageReportedAt = new Date();

    await this.installationRepository.save(installation);
  }

  /**
   * Reset usage counters for new billing period
   */
  async resetBillingPeriod(
    installationId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    await this.installationRepository.update(installationId, {
      usageThisPeriod: {},
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });
  }

  /**
   * Check if update is available
   */
  async checkForUpdates(installationId: string): Promise<{
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string;
  }> {
    const installation = await this.getInstallationById(installationId);

    const bot = await this.catalogService.getBotById(installation.marketplaceBotId);
    if (!bot) {
      return {
        updateAvailable: false,
        currentVersion: installation.installedVersion,
        latestVersion: installation.installedVersion,
      };
    }

    const updateAvailable = installation.installedVersion !== bot.currentVersion;

    if (updateAvailable) {
      installation.latestAvailableVersion = bot.currentVersion;
      await this.installationRepository.save(installation);
    }

    return {
      updateAvailable,
      currentVersion: installation.installedVersion,
      latestVersion: bot.currentVersion,
    };
  }

  /**
   * Update to latest version
   */
  async updateToLatest(installationId: string): Promise<BotInstallation> {
    const installation = await this.getInstallationById(installationId);

    const bot = await this.catalogService.getBotById(installation.marketplaceBotId);
    if (!bot) {
      throw new NotFoundException('Bot no longer available in marketplace');
    }

    installation.installedVersion = bot.currentVersion;
    installation.latestAvailableVersion = bot.currentVersion;

    await this.installationRepository.save(installation);

    this.logger.log(
      `Updated ${installation.botName} to version ${bot.currentVersion} for tenant ${installation.tenantId}`,
    );

    return installation;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private isFullyConfigured(installation: BotInstallation, bot: CatalogBot): boolean {
    const requiredSecrets = bot.requirements?.vaultSecrets || [];
    const configuredSecrets = Object.keys(installation.vaultMappings);

    return requiredSecrets.every((secret) => configuredSecrets.includes(secret));
  }

  private async notifyInstallation(
    installation: BotInstallation,
    _bot: CatalogBot,
  ): Promise<void> {
    const controlPlaneUrl = this.configService.get<string>('CONTROL_PLANE_URL');
    if (!controlPlaneUrl) {
      return;
    }

    try {
      await fetch(`${controlPlaneUrl}/api/marketplace/bots/${installation.marketplaceBotId}/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-License-Key': this.configService.get<string>('LICENSE_KEY', ''),
        },
        body: JSON.stringify({
          tenantId: installation.tenantId,
          installationId: installation.id,
          version: installation.installedVersion,
        }),
      });
    } catch (error) {
      this.logger.warn(`Failed to notify Control-Plane of installation: ${error}`);
    }
  }

  private async notifyUninstallation(installation: BotInstallation): Promise<void> {
    const controlPlaneUrl = this.configService.get<string>('CONTROL_PLANE_URL');
    if (!controlPlaneUrl) {
      return;
    }

    try {
      await fetch(`${controlPlaneUrl}/api/marketplace/bots/${installation.marketplaceBotId}/uninstall`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-License-Key': this.configService.get<string>('LICENSE_KEY', ''),
        },
        body: JSON.stringify({
          tenantId: installation.tenantId,
          installationId: installation.id,
        }),
      });
    } catch (error) {
      this.logger.warn(`Failed to notify Control-Plane of uninstallation: ${error}`);
    }
  }

  private async cancelSubscription(_installation: BotInstallation): Promise<void> {
    // In production, this would call Stripe to cancel the subscription
    // For now, just log
    this.logger.log(`Would cancel subscription for installation ${_installation.id}`);
  }
}
