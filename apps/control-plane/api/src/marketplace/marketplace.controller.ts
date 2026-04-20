import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  CatalogFilters,
  CatalogOptions,
  MarketplaceAnalyticsResponse,
  MarketplaceService,
} from './marketplace.service';
import {
  MarketplaceBot,
  MarketplaceBotStatus,
  BotVersion,
  BotCategory,
  ExecutionMode,
  PricingModel,
} from './entities/marketplace-bot.entity';
import { Partner, PartnerStatus } from './entities/partner.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CP_PERMISSIONS } from '../common/authz/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

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

  @Get('bots')
  async listBots(
    @Query('status') status?: MarketplaceBotStatus,
    @Query('category') category?: BotCategory,
    @Query('search') search?: string,
  ): Promise<MarketplaceBot[]> {
    return this.marketplaceService.listBots({
      status,
      category,
      search,
    });
  }

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
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_WRITE)
  @HttpCode(HttpStatus.CREATED)
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
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<Partner> {
    return this.marketplaceService.createPartner(dto, this.resolveAuditActor(currentUser, request));
  }

  @Get('partners')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_READ)
  async listPartners(
    @Query('status') status: PartnerStatus | undefined,
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<Partner[]> {
    return this.marketplaceService.listPartners(
      status,
      this.resolveAuditActor(currentUser, request),
    );
  }

  @Get('partners/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_READ)
  async getPartner(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<Partner> {
    return this.marketplaceService.getPartner(id, this.resolveAuditActor(currentUser, request));
  }

  @Post('partners/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_APPROVE)
  async approvePartner(
    @Param('id') id: string,
    @Body() body: { approvedBy?: string },
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<Partner> {
    const approvedBy = body.approvedBy ?? currentUser.email ?? currentUser.id;
    return this.marketplaceService.approvePartner(
      id,
      approvedBy,
      this.resolveAuditActor(currentUser, request),
    );
  }

  @Get('analytics')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_READ)
  async getAnalytics(
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<MarketplaceAnalyticsResponse> {
    return this.marketplaceService.getMarketplaceAnalytics(
      this.resolveAuditActor(currentUser, request),
    );
  }

  private resolveAuditActor(
    currentUser: User,
    request: Request,
  ): {
    actorUserId: string | null;
    actorEmail: string | null;
    requestIp: string | null;
  } {
    const forwardedFor = request.headers['x-forwarded-for'];
    const requestIp =
      typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0]?.trim() || null
        : request.ip || null;

    return {
      actorUserId: currentUser?.id ?? null,
      actorEmail: currentUser?.email ?? null,
      requestIp,
    };
  }
}
