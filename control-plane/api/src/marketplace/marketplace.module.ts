import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceBot, BotVersion } from './entities/marketplace-bot.entity';
import { Partner } from './entities/partner.entity';

/**
 * Marketplace Module
 *
 * Provides the bot marketplace functionality for Control-Plane.
 *
 * Features:
 * - Bot publication and versioning
 * - Partner management and revenue share
 * - Review and approval workflow
 * - Public catalog browsing
 *
 * Entities:
 * - MarketplaceBot: Bot published in the marketplace
 * - BotVersion: Versions of a marketplace bot
 * - Partner: Publishers who can submit bots
 *
 * Integration:
 * - Uses IntegrationsModule for Stripe payments
 * - Orchestrators fetch catalog via API
 * - Web marketing site shows public catalog
 */
@Module({
  imports: [TypeOrmModule.forFeature([MarketplaceBot, BotVersion, Partner])],
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
