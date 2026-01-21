import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MarketplaceService, CatalogFilters, CatalogOptions } from './marketplace.service';
import {
  MarketplaceBot,
  BotVersion,
  BotCategory,
  ExecutionMode,
  PricingModel,
} from './entities/marketplace-bot.entity';
import { Partner, PartnerStatus } from './entities/partner.entity';

// Note: In production, add proper guards for authentication/authorization
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { RolesGuard } from '../auth/guards/roles.guard';
// import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Marketplace Controller
 *
 * Provides REST API endpoints for the marketplace.
 *
 * Public Endpoints (no auth required):
 * - GET /catalog - Browse published bots
 * - GET /catalog/:slug - Get bot details
 *
 * Partner Endpoints (partner auth required):
 * - POST /bots - Create bot draft
 * - PUT /bots/:id - Update bot
 * - POST /bots/:id/submit - Submit for review
 * - POST /bots/:id/publish - Publish approved bot
 * - POST /bots/:id/versions - Add version
 *
 * Admin Endpoints (Skuld admin only):
 * - GET /submissions - List pending reviews
 * - POST /bots/:id/approve - Approve bot
 * - POST /bots/:id/reject - Reject bot
 * - GET /partners - List partners
 * - POST /partners/:id/approve - Approve partner
 */
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  // ============================================================================
  // PUBLIC CATALOG
  // ============================================================================

  @Get('catalog')
  async getCatalog(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: 'popular' | 'newest' | 'rating' | 'name',
    @Query('category') category?: BotCategory,
    @Query('executionMode') executionMode?: ExecutionMode,
    @Query('pricingModel') pricingModel?: PricingModel,
    @Query('tags') tags?: string,
    @Query('search') search?: string,
    @Query('publisherId') publisherId?: string,
    @Query('isSkuldBot') isSkuldBot?: string,
  ) {
    const filters: CatalogFilters = {
      category,
      executionMode,
      pricingModel,
      tags: tags ? tags.split(',') : undefined,
      search,
      publisherId,
      isSkuldBot: isSkuldBot ? isSkuldBot === 'true' : undefined,
    };

    const options: CatalogOptions = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      sort: sort || 'popular',
    };

    return this.marketplaceService.getCatalog(filters, options);
  }

  @Get('catalog/:slug')
  async getBotBySlug(@Param('slug') slug: string): Promise<MarketplaceBot> {
    return this.marketplaceService.getBotBySlug(slug);
  }

  // ============================================================================
  // BOT MANAGEMENT (PARTNER)
  // ============================================================================

  @Post('bots')
  // @UseGuards(JwtAuthGuard, PartnerGuard)
  async createBot(
    @Body()
    dto: {
      name: string;
      slug: string;
      description: string;
      longDescription?: string;
      category: BotCategory;
      tags?: string[];
      executionMode: ExecutionMode;
      publisherId: string; // In production, get from auth token
      pricing: MarketplaceBot['pricing'];
      requirements?: MarketplaceBot['requirements'];
      runnerRequirements?: MarketplaceBot['runnerRequirements'];
    },
  ): Promise<MarketplaceBot> {
    return this.marketplaceService.createBot(dto);
  }

  @Get('bots/:id')
  async getBotById(@Param('id') id: string): Promise<MarketplaceBot> {
    return this.marketplaceService.getBotById(id);
  }

  @Put('bots/:id')
  // @UseGuards(JwtAuthGuard, PartnerGuard)
  async updateBot(
    @Param('id') id: string,
    @Body()
    dto: {
      publisherId: string; // In production, get from auth token
      name?: string;
      description?: string;
      longDescription?: string;
      category?: BotCategory;
      tags?: string[];
      pricing?: MarketplaceBot['pricing'];
      requirements?: MarketplaceBot['requirements'];
      iconUrl?: string;
      screenshots?: string[];
      demoVideoUrl?: string;
      documentationUrl?: string;
    },
  ): Promise<MarketplaceBot> {
    const { publisherId, ...updateDto } = dto;
    return this.marketplaceService.updateBot(id, updateDto, publisherId);
  }

  @Post('bots/:id/submit')
  // @UseGuards(JwtAuthGuard, PartnerGuard)
  async submitForReview(
    @Param('id') id: string,
    @Body() body: { publisherId: string },
  ): Promise<MarketplaceBot> {
    return this.marketplaceService.submitForReview(id, body.publisherId);
  }

  @Post('bots/:id/publish')
  // @UseGuards(JwtAuthGuard, PartnerGuard)
  async publishBot(
    @Param('id') id: string,
    @Body() body: { publisherId: string },
  ): Promise<MarketplaceBot> {
    return this.marketplaceService.publishBot(id, body.publisherId);
  }

  @Post('bots/:id/deprecate')
  // @UseGuards(JwtAuthGuard, PartnerGuard)
  async deprecateBot(
    @Param('id') id: string,
    @Body() body: { publisherId: string },
  ): Promise<MarketplaceBot> {
    return this.marketplaceService.deprecateBot(id, body.publisherId);
  }

  // ============================================================================
  // VERSION MANAGEMENT
  // ============================================================================

  @Get('bots/:id/versions')
  async getVersions(@Param('id') id: string): Promise<BotVersion[]> {
    return this.marketplaceService.getVersions(id);
  }

  @Get('bots/:id/versions/:version')
  async getVersion(
    @Param('id') id: string,
    @Param('version') version: string,
  ): Promise<BotVersion> {
    return this.marketplaceService.getVersion(id, version);
  }

  @Post('bots/:id/versions')
  // @UseGuards(JwtAuthGuard, PartnerGuard)
  async addVersion(
    @Param('id') id: string,
    @Body()
    dto: {
      publisherId: string; // In production, get from auth token
      version: string;
      releaseNotes?: string;
      packageUrl: string;
      packageHash: string;
      packageSignature?: string;
      packageSize: number;
      dslHash: string;
      dslSchema?: Record<string, unknown>;
    },
  ): Promise<BotVersion> {
    const { publisherId, ...versionDto } = dto;
    return this.marketplaceService.addVersion(id, versionDto, publisherId);
  }

  // ============================================================================
  // ADMIN ENDPOINTS
  // ============================================================================

  @Get('submissions')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('admin')
  async getPendingBots(): Promise<MarketplaceBot[]> {
    return this.marketplaceService.getPendingBots();
  }

  @Post('bots/:id/approve')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('admin')
  async approveBot(
    @Param('id') id: string,
    @Body() body: { approvedBy: string },
  ): Promise<MarketplaceBot> {
    return this.marketplaceService.approveBot(id, body.approvedBy);
  }

  @Post('bots/:id/reject')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('admin')
  async rejectBot(
    @Param('id') id: string,
    @Body() body: { reason: string; rejectedBy: string },
  ): Promise<MarketplaceBot> {
    return this.marketplaceService.rejectBot(id, body.reason, body.rejectedBy);
  }

  // ============================================================================
  // PARTNER MANAGEMENT
  // ============================================================================

  @Post('partners')
  async createPartner(
    @Body()
    dto: {
      name: string;
      email: string;
      company: string;
      website?: string;
      description?: string;
      contactName?: string;
      contactPhone?: string;
    },
  ): Promise<Partner> {
    return this.marketplaceService.createPartner(dto);
  }

  @Get('partners')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('admin')
  async listPartners(@Query('status') status?: PartnerStatus): Promise<Partner[]> {
    return this.marketplaceService.listPartners(status);
  }

  @Get('partners/:id')
  async getPartner(@Param('id') id: string): Promise<Partner> {
    return this.marketplaceService.getPartner(id);
  }

  @Post('partners/:id/approve')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('admin')
  async approvePartner(
    @Param('id') id: string,
    @Body() body: { approvedBy: string },
  ): Promise<Partner> {
    return this.marketplaceService.approvePartner(id, body.approvedBy);
  }
}
