import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import type { CatalogBot, CatalogResponse } from './catalog.service';
import { InstallationService } from './installation.service';
import type { InstallBotDto, ConfigureInstallationDto } from './installation.service';
import { BotInstallation, InstallationStatus } from './entities/bot-installation.entity';

/**
 * Marketplace Controller
 *
 * Provides REST API endpoints for browsing and installing marketplace bots.
 *
 * Catalog Endpoints:
 * - GET /catalog - Browse marketplace bots
 * - GET /catalog/:slug - Get bot details by slug
 * - GET /categories - Get available categories
 *
 * Installation Endpoints:
 * - GET /my-bots - Get installed bots
 * - GET /my-bots/:id - Get installation details
 * - POST /install/:botId - Install a bot
 * - PUT /my-bots/:id/configure - Configure installation
 * - DELETE /my-bots/:id - Uninstall a bot
 * - POST /my-bots/:id/update - Update to latest version
 */
@Controller('marketplace')
export class MarketplaceController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly installationService: InstallationService,
  ) {}

  // ============================================================================
  // CATALOG ENDPOINTS
  // ============================================================================

  @Get('catalog')
  async getCatalog(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: 'popular' | 'newest' | 'rating' | 'name',
  ): Promise<CatalogResponse> {
    return this.catalogService.getCatalog({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      category,
      search,
      sort: sort || 'popular',
    });
  }

  @Get('catalog/:slug')
  async getBotBySlug(@Param('slug') slug: string): Promise<CatalogBot | null> {
    return this.catalogService.getBotBySlug(slug);
  }

  @Get('categories')
  async getCategories(): Promise<{ id: string; name: string; count: number }[]> {
    return this.catalogService.getCategories();
  }

  // ============================================================================
  // INSTALLATION ENDPOINTS
  // ============================================================================

  @Get('my-bots')
  async getMyBots(
    @Query('status') status?: InstallationStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ data: BotInstallation[]; total: number }> {
    return this.installationService.getInstallations({
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('my-bots/:id')
  async getInstallation(@Param('id') id: string): Promise<BotInstallation> {
    return this.installationService.getInstallationById(id);
  }

  @Post('install/:botId')
  async installBot(
    @Param('botId') botId: string,
    @Body() dto: Omit<InstallBotDto, 'marketplaceBotId'>,
  ): Promise<BotInstallation> {
    return this.installationService.installBot({
      ...dto,
      marketplaceBotId: botId,
    });
  }

  @Put('my-bots/:id/configure')
  async configureInstallation(
    @Param('id') id: string,
    @Body() dto: ConfigureInstallationDto,
  ): Promise<BotInstallation> {
    return this.installationService.configureInstallation(id, dto);
  }

  @Delete('my-bots/:id')
  async uninstallBot(
    @Param('id') id: string,
    @Body() body?: { reason?: string },
  ): Promise<{ success: boolean }> {
    await this.installationService.uninstallBot(id, body?.reason);
    return { success: true };
  }

  @Get('my-bots/:id/check-updates')
  async checkForUpdates(@Param('id') id: string): Promise<{
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string;
  }> {
    return this.installationService.checkForUpdates(id);
  }

  @Post('my-bots/:id/update')
  async updateBot(@Param('id') id: string): Promise<BotInstallation> {
    return this.installationService.updateToLatest(id);
  }

  @Get('installed/:botId')
  async isInstalled(@Param('botId') botId: string): Promise<{ installed: boolean }> {
    const installed = await this.installationService.isInstalled(botId);
    return { installed };
  }

  // ============================================================================
  // RUNNER ENDPOINTS - For runners to fetch bot packages
  // ============================================================================

  /**
   * Get bot package info for a runner to download and execute
   * Used by runners when assigned a job for a marketplace bot
   *
   * Flow:
   * 1. Orchestrator assigns job to runner with installationId
   * 2. Runner calls this endpoint to get package URL and config
   * 3. Runner downloads package (caches locally)
   * 4. Runner executes bot with resolved secrets
   */
  @Get('runner/package/:installationId')
  async getPackageForRunner(@Param('installationId') installationId: string): Promise<{
    installation: {
      id: string;
      marketplaceBotId: string;
      botName: string;
      botSlug: string;
      installedVersion: string;
    };
    packageUrl: string;
    packageHash: string;
    vaultMappings: Record<string, string>;
    connectionConfigs: Record<string, Record<string, unknown>>;
    customConfig?: Record<string, unknown>;
  }> {
    const installation = await this.installationService.getInstallationById(installationId);

    // Get the package URL from Control-Plane
    const bot = await this.catalogService.getBotById(installation.marketplaceBotId);

    if (!bot) {
      throw new Error('Bot not found in catalog');
    }

    // In production, this would return a signed URL for the package
    // The runner will download the package and cache it locally
    return {
      installation: {
        id: installation.id,
        marketplaceBotId: installation.marketplaceBotId,
        botName: installation.botName,
        botSlug: installation.botSlug,
        installedVersion: installation.installedVersion,
      },
      packageUrl: `/api/marketplace/packages/${installation.marketplaceBotId}/${installation.installedVersion}/download`,
      packageHash: '', // Would come from bot version
      vaultMappings: installation.vaultMappings,
      connectionConfigs: installation.connectionConfigs,
      customConfig: installation.customConfig,
    };
  }

  /**
   * List all active installations for a runner to cache
   * Runners can proactively download bot packages for faster execution
   */
  @Get('runner/installations')
  async getInstallationsForRunner(): Promise<{
    installations: Array<{
      id: string;
      marketplaceBotId: string;
      botName: string;
      botSlug: string;
      installedVersion: string;
      status: InstallationStatus;
    }>;
  }> {
    const { data } = await this.installationService.getInstallations({
      status: InstallationStatus.ACTIVE,
      limit: 100,
    });

    return {
      installations: data.map((i) => ({
        id: i.id,
        marketplaceBotId: i.marketplaceBotId,
        botName: i.botName,
        botSlug: i.botSlug,
        installedVersion: i.installedVersion,
        status: i.status,
      })),
    };
  }

  /**
   * Runner reports execution result back to update stats
   */
  @Post('runner/report/:installationId')
  async reportRunnerExecution(
    @Param('installationId') installationId: string,
    @Body()
    body: {
      success: boolean;
      durationSeconds: number;
      usage?: Array<{ metric: string; quantity: number }>;
    },
  ): Promise<{ success: boolean }> {
    // Record run stats
    await this.installationService.recordRun(
      installationId,
      body.success,
      body.durationSeconds,
    );

    // Record usage events for billing
    if (body.usage) {
      for (const event of body.usage) {
        await this.installationService.recordUsage(
          installationId,
          event.metric,
          event.quantity,
        );
      }
    }

    return { success: true };
  }
}
