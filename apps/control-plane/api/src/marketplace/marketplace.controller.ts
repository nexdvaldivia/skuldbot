import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
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
import { PartnerType } from './entities/partner-type.entity';
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
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_WRITE)
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
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_WRITE)
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
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_WRITE)
  async submitForReview(
    @Param('id') id: string,
    @Body() body: { publisherId: string },
  ): Promise<MarketplaceBot> {
    return this.marketplaceService.submitForReview(id, body.publisherId);
  }

  @Post('bots/:id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_WRITE)
  async publishBot(
    @Param('id') id: string,
    @Body() body: { publisherId: string },
  ): Promise<MarketplaceBot> {
    return this.marketplaceService.publishBot(id, body.publisherId);
  }

  @Post('bots/:id/deprecate')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_WRITE)
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
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_WRITE)
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
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_READ)
  async getPendingBots(): Promise<MarketplaceBot[]> {
    return this.marketplaceService.getPendingBots();
  }

  @Post('bots/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_APPROVE)
  async approveBot(
    @Param('id') id: string,
    @Body() body: { approvedBy: string },
  ): Promise<MarketplaceBot> {
    return this.marketplaceService.approveBot(id, body.approvedBy);
  }

  @Post('bots/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_APPROVE)
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
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async createPartner(
    @Body()
    dto: {
      name: string;
      email: string;
      company: string;
      partnerTypeId?: string;
      website?: string;
      description?: string;
      contactName?: string;
      contactPhone?: string;
      billingEmail?: string;
      metadata?: Record<string, unknown>;
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
    @Query('partnerTypeId') partnerTypeId: string | undefined,
    @Query('search') search: string | undefined,
    @Query('isVerified') isVerified: string | undefined,
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<Partner[]> {
    return this.marketplaceService.listPartners(
      {
        status,
        partnerTypeId,
        search,
        isVerified: isVerified === undefined ? undefined : isVerified === 'true',
      },
      this.resolveAuditActor(currentUser, request),
    );
  }

  @Post('partners/reorder')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_WRITE)
  async reorderPartners(
    @Body() body: { partnerIds: string[] },
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<{ success: true }> {
    await this.marketplaceService.reorderPartners(
      body.partnerIds,
      this.resolveAuditActor(currentUser, request),
    );
    return { success: true };
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
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<Partner> {
    const approvedBy = this.resolveAuthenticatedActor(currentUser);
    return this.marketplaceService.approvePartner(
      id,
      approvedBy,
      this.resolveAuditActor(currentUser, request),
    );
  }

  @Post('partners/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_APPROVE)
  async rejectPartner(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<Partner> {
    const rejectedBy = this.resolveAuthenticatedActor(currentUser);
    return this.marketplaceService.rejectPartner(
      id,
      rejectedBy,
      body.reason,
      this.resolveAuditActor(currentUser, request),
    );
  }

  @Post('partners/:id/activate')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_APPROVE)
  async activatePartner(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<Partner> {
    const activatedBy = this.resolveAuthenticatedActor(currentUser);
    return this.marketplaceService.activatePartner(
      id,
      activatedBy,
      this.resolveAuditActor(currentUser, request),
    );
  }

  @Post('partners/:id/suspend')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_APPROVE)
  async suspendPartner(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<Partner> {
    const suspendedBy = this.resolveAuthenticatedActor(currentUser);
    return this.marketplaceService.suspendPartner(
      id,
      suspendedBy,
      body.reason,
      this.resolveAuditActor(currentUser, request),
    );
  }

  @Post('partners/:id/terminate')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_APPROVE)
  async terminatePartner(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<Partner> {
    const terminatedBy = this.resolveAuthenticatedActor(currentUser);
    return this.marketplaceService.terminatePartner(
      id,
      terminatedBy,
      body.reason,
      this.resolveAuditActor(currentUser, request),
    );
  }

  @Patch('partners/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_WRITE)
  async updatePartner(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      email?: string;
      company?: string;
      partnerTypeId?: string | null;
      website?: string | null;
      description?: string | null;
      contactName?: string | null;
      contactPhone?: string | null;
      billingEmail?: string | null;
      status?: PartnerStatus;
      verified?: boolean;
      metadata?: Record<string, unknown> | null;
    },
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<Partner> {
    return this.marketplaceService.updatePartner(
      id,
      body,
      this.resolveAuditActor(currentUser, request),
    );
  }

  @Delete('partners/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePartner(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<void> {
    await this.marketplaceService.deletePartner(id, this.resolveAuditActor(currentUser, request));
  }

  @Get('partner-types')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_READ)
  async listPartnerTypes(
    @Query('isActive') isActive: string | undefined,
    @Query('search') search: string | undefined,
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<PartnerType[]> {
    return this.marketplaceService.listPartnerTypes(
      {
        isActive: isActive === undefined ? undefined : isActive === 'true',
        search,
      },
      this.resolveAuditActor(currentUser, request),
    );
  }

  @Post('partner-types')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async createPartnerType(
    @Body()
    body: {
      name: string;
      slug: string;
      description?: string;
      color?: string;
      icon?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<PartnerType> {
    return this.marketplaceService.createPartnerType(
      body,
      this.resolveAuditActor(currentUser, request),
    );
  }

  @Get('partner-types/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_READ)
  async getPartnerType(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<PartnerType> {
    return this.marketplaceService.getPartnerType(id, this.resolveAuditActor(currentUser, request));
  }

  @Patch('partner-types/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_WRITE)
  async updatePartnerType(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      slug?: string;
      description?: string | null;
      color?: string | null;
      icon?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<PartnerType> {
    return this.marketplaceService.updatePartnerType(
      id,
      body,
      this.resolveAuditActor(currentUser, request),
    );
  }

  @Delete('partner-types/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.MARKETPLACE_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePartnerType(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<void> {
    await this.marketplaceService.deletePartnerType(
      id,
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

  private resolveAuthenticatedActor(currentUser: User): string {
    const actor = currentUser?.email ?? currentUser?.id;
    if (!actor) {
      throw new BadRequestException('Authenticated actor identity is required');
    }
    return actor;
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
