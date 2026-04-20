import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMarketplaceSubscriptions1764102000000
  implements MigrationInterface
{
  name = 'CreateMarketplaceSubscriptions1764102000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "marketplace_subscriptions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenantId" uuid NOT NULL,
        "marketplaceBotId" uuid NOT NULL,
        "pricingPlan" character varying(32) NOT NULL DEFAULT 'monthly',
        "status" character varying(32) NOT NULL DEFAULT 'active',
        "subscribedAt" TIMESTAMP WITH TIME ZONE,
        "canceledAt" TIMESTAMP WITH TIME ZONE,
        "downloadCount" integer NOT NULL DEFAULT 0,
        "lastDownloadedAt" TIMESTAMP WITH TIME ZONE,
        "metadata" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_marketplace_subscriptions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_marketplace_subscriptions_tenant_bot"
          UNIQUE ("tenantId", "marketplaceBotId"),
        CONSTRAINT "FK_marketplace_subscriptions_tenant"
          FOREIGN KEY ("tenantId")
          REFERENCES "tenants"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_marketplace_subscriptions_bot"
          FOREIGN KEY ("marketplaceBotId")
          REFERENCES "marketplace_bots"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_marketplace_subscriptions_tenant_status"
      ON "marketplace_subscriptions" ("tenantId", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_marketplace_subscriptions_tenant_status"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "marketplace_subscriptions"');
  }
}
