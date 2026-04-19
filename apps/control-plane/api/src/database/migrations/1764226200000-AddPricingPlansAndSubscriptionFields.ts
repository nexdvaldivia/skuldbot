import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPricingPlansAndSubscriptionFields1764226200000 implements MigrationInterface {
  name = 'AddPricingPlansAndSubscriptionFields1764226200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pricing_plans" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" varchar(80) NOT NULL,
        "name" varchar(180) NOT NULL,
        "base_monthly_cents" int NOT NULL DEFAULT 0,
        "base_annual_cents" int NOT NULL DEFAULT 0,
        "included_runners" int NOT NULL DEFAULT 0,
        "included_bots" int NOT NULL DEFAULT 0,
        "included_executions" int NOT NULL DEFAULT 0,
        "price_per_extra_runner_cents" int NOT NULL DEFAULT 0,
        "price_per_extra_bot_cents" int NOT NULL DEFAULT 0,
        "price_per_execution_cents" int NOT NULL DEFAULT 0,
        "currency" varchar(10) NOT NULL DEFAULT 'USD',
        "features" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "stripe_price_monthly_id" varchar(255),
        "stripe_price_annual_id" varchar(255),
        "stripe_meter_id" varchar(255),
        "sort_order" int NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pricing_plans_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pricing_plans_code"
      ON "pricing_plans" ("code")
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_subscriptions"
      ADD COLUMN IF NOT EXISTS "planCode" varchar(80) NOT NULL DEFAULT 'starter'
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_subscriptions"
      ADD COLUMN IF NOT EXISTS "billingInterval" varchar(20) NOT NULL DEFAULT 'monthly'
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_subscriptions"
      ADD COLUMN IF NOT EXISTS "stripeSubscriptionItemId" varchar(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_subscriptions"
      ADD COLUMN IF NOT EXISTS "canceledAt" TIMESTAMP WITH TIME ZONE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_subscriptions"
      DROP COLUMN IF EXISTS "canceledAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_subscriptions"
      DROP COLUMN IF EXISTS "stripeSubscriptionItemId"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_subscriptions"
      DROP COLUMN IF EXISTS "billingInterval"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_subscriptions"
      DROP COLUMN IF EXISTS "planCode"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pricing_plans_code"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pricing_plans"`);
  }
}
