import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { BotInstallation } from './entities/bot-installation.entity';
import { CatalogService } from './catalog.service';
import { InstallationService } from './installation.service';
import { MarketplaceController } from './marketplace.controller';
import { LicenseModule } from '../license/license.module';

/**
 * Marketplace Module (Orchestrator)
 *
 * Provides marketplace functionality for the Orchestrator:
 *
 * 1. **Catalog Browsing**
 *    - Fetches catalog from Control-Plane
 *    - Caches results locally
 *    - Supports filtering and search
 *
 * 2. **Bot Installation**
 *    - Install bots from marketplace
 *    - Configure vault mappings
 *    - Manage subscriptions
 *
 * 3. **Usage Tracking**
 *    - Track usage for metered billing
 *    - Record run statistics
 *    - Report to Control-Plane
 *
 * Integration:
 * - Fetches catalog from Control-Plane API
 * - Reports installations/uninstalls to Control-Plane
 * - Uses LicenseModule for tenant identification
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([BotInstallation]),
    ConfigModule,
    LicenseModule,
  ],
  controllers: [MarketplaceController],
  providers: [CatalogService, InstallationService],
  exports: [CatalogService, InstallationService],
})
export class MarketplaceModule {}
