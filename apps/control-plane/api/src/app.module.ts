import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions } from './database/typeorm-options';
import { enforceEnvironmentPolicy } from './common/security/environment-policy';

// Modules
import { IntegrationsModule } from './integrations/integrations.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { TenantsModule } from './tenants/tenants.module';
import { LicensesModule } from './licenses/licenses.module';
import { UsersModule } from './users/users.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { BillingModule } from './billing/billing.module';
import { SchemasModule } from './schemas/schemas.module';
import { MCPModule } from './mcp/mcp.module';
import { OrchestratorsModule } from './orchestrators/orchestrators.module';
import { SsoModule } from './sso/sso.module';
import { PublicLeadsModule } from './public-leads/public-leads.module';
import { TicketsModule } from './tickets/tickets.module';
import { LookupsModule } from './lookups/lookups.module';
import { RbacModule } from './rbac/rbac.module';

enforceEnvironmentPolicy(process.env);

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      // Regulated environments should inject env vars from platform/vault.
      // Local dotenv loading is opt-in via ALLOW_DOTENV=true.
      ignoreEnvFile: process.env.ALLOW_DOTENV !== 'true',
      envFilePath:
        process.env.ALLOW_DOTENV === 'true' ? ['.env.local', '.env'] : undefined,
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => buildTypeOrmOptions(process.env),
    }),

    // Integrations (global providers for payment, storage, email, graph)
    IntegrationsModule,

    // Feature modules
    AuthModule,
    ClientsModule,
    TenantsModule,
    LicensesModule,
    UsersModule,
    SsoModule,
    MarketplaceModule,
    BillingModule,
    SchemasModule,
    OrchestratorsModule,
    TicketsModule,
    PublicLeadsModule,
    LookupsModule,
    RbacModule,
    
    // MCP Module (Model Context Protocol)
    MCPModule,
  ],
})
export class AppModule {}
