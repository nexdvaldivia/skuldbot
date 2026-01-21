/**
 * Database Seed Script
 *
 * Creates initial admin user for the Control-Plane.
 *
 * Usage:
 *   npx ts-node src/database/seed.ts
 *
 * Environment variables required:
 *   - DB_HOST (default: localhost)
 *   - DB_PORT (default: 5432)
 *   - DB_USERNAME (default: skuld)
 *   - DB_PASSWORD (default: skuld)
 *   - DB_DATABASE (default: skuld_controlplane)
 *
 * Default admin credentials (CHANGE IN PRODUCTION):
 *   Email: admin@skuld.io
 *   Password: SkuldAdmin2025!
 */

import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';

// Import entities
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { License } from '../licenses/entities/license.entity';
import { MarketplaceBot, BotVersion } from '../marketplace/entities/marketplace-bot.entity';
import { Partner } from '../marketplace/entities/partner.entity';
import { UsageRecord, UsageBatch } from '../billing/entities/usage-record.entity';
import { RevenueShareRecord, PartnerPayout } from '../billing/entities/revenue-share.entity';
import { TenantSubscription, PaymentHistory } from '../billing/entities/subscription.entity';
import { PaymentConfig, DEFAULT_PAYMENT_CONFIGS } from '../billing/entities/payment-config.entity';

// Default admin credentials - CHANGE IN PRODUCTION
const DEFAULT_ADMIN_EMAIL = 'admin@skuld.io';
const DEFAULT_ADMIN_PASSWORD = 'SkuldAdmin2025';
const DEFAULT_ADMIN_FIRST_NAME = 'Skuld';
const DEFAULT_ADMIN_LAST_NAME = 'Administrator';

async function seed() {
  console.log('🌱 Starting database seed...\n');

  // Create DataSource
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'skuldbot',
    password: process.env.DB_PASSWORD || 'skuldbot',
    database: process.env.DB_DATABASE || 'skuld_controlplane',
    entities: [
      User,
      Client,
      Tenant,
      License,
      MarketplaceBot,
      BotVersion,
      Partner,
      UsageRecord,
      UsageBatch,
      RevenueShareRecord,
      PartnerPayout,
      TenantSubscription,
      PaymentHistory,
      PaymentConfig,
    ],
    synchronize: true, // Creates tables if they don't exist
    logging: false,
  });

  try {
    // Initialize connection
    await dataSource.initialize();
    console.log('✅ Database connected\n');

    const userRepository = dataSource.getRepository(User);

    // Check if admin already exists
    const existingAdmin = await userRepository.findOne({
      where: { email: DEFAULT_ADMIN_EMAIL },
    });

    if (existingAdmin) {
      console.log(`⚠️  Admin user already exists: ${DEFAULT_ADMIN_EMAIL}`);
      console.log('   Skipping admin creation.\n');
    } else {
      // Hash password
      const passwordHash = await argon2.hash(DEFAULT_ADMIN_PASSWORD);

      // Create admin user
      const admin = userRepository.create({
        email: DEFAULT_ADMIN_EMAIL,
        passwordHash,
        firstName: DEFAULT_ADMIN_FIRST_NAME,
        lastName: DEFAULT_ADMIN_LAST_NAME,
        role: UserRole.SKULD_ADMIN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      });

      await userRepository.save(admin);

      console.log('✅ Admin user created successfully!\n');
      console.log('   ┌─────────────────────────────────────────┐');
      console.log('   │  CONTROL-PLANE ADMIN CREDENTIALS        │');
      console.log('   ├─────────────────────────────────────────┤');
      console.log(`   │  Email:    ${DEFAULT_ADMIN_EMAIL.padEnd(27)}│`);
      console.log(`   │  Password: ${DEFAULT_ADMIN_PASSWORD.padEnd(27)}│`);
      console.log('   └─────────────────────────────────────────┘');
      console.log('\n   ⚠️  IMPORTANT: Change this password in production!\n');
    }

    // Seed PaymentConfig defaults if not exists
    const paymentConfigRepository = dataSource.getRepository(PaymentConfig);
    const existingConfigs = await paymentConfigRepository.count();

    if (existingConfigs === 0) {
      console.log('📝 Creating default payment configurations...\n');

      for (const config of DEFAULT_PAYMENT_CONFIGS) {
        const paymentConfig = paymentConfigRepository.create({
          productType: config.productType,
          achEnabled: config.achEnabled,
          cardEnabled: config.cardEnabled,
          preferredMethod: config.preferredMethod,
          cardMaxAmountCents: config.cardMaxAmountCents,
          achMinAmountCents: config.achMinAmountCents,
          description: config.description,
        });
        await paymentConfigRepository.save(paymentConfig);
        console.log(`   ✓ ${config.productType}: ACH=${config.achEnabled}, Card=${config.cardEnabled}`);
      }

      console.log('\n✅ Payment configurations created\n');
    } else {
      console.log('⚠️  Payment configurations already exist, skipping.\n');
    }

    console.log('🎉 Seed completed successfully!\n');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

// Run seed
seed();
