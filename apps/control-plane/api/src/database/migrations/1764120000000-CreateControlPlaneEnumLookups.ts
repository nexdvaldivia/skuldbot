import { MigrationInterface, QueryRunner } from 'typeorm';

type LookupSeed = {
  table: string;
  values: Array<{ code: string; name: string; description: string; sortOrder: number }>;
};

const LOOKUP_TABLES: string[] = [
  'cp_bot_category_lookups',
  'cp_marketplace_bot_status_lookups',
  'cp_partner_status_lookups',
  'cp_revenue_share_tier_lookups',
  'cp_ticket_status_lookups',
  'cp_ticket_priority_lookups',
  'cp_marketplace_subscription_status_lookups',
  'cp_marketplace_subscription_plan_lookups',
  'cp_lead_status_lookups',
  'cp_client_contact_type_lookups',
  'cp_client_address_type_lookups',
  'cp_pricing_model_lookups',
];

const LOOKUP_SEEDS: LookupSeed[] = [
  {
    table: 'cp_bot_category_lookups',
    values: [
      { code: 'email', name: 'Email', description: 'Email automation bots', sortOrder: 10 },
      { code: 'insurance', name: 'Insurance', description: 'Insurance workflows', sortOrder: 20 },
      { code: 'finance', name: 'Finance', description: 'Financial operations workflows', sortOrder: 30 },
      { code: 'hr', name: 'HR', description: 'Human resources automation', sortOrder: 40 },
      { code: 'sales', name: 'Sales', description: 'Sales enablement automation', sortOrder: 50 },
      { code: 'healthcare', name: 'Healthcare', description: 'Healthcare workflows', sortOrder: 60 },
      { code: 'logistics', name: 'Logistics', description: 'Logistics and operations automation', sortOrder: 70 },
      { code: 'custom', name: 'Custom', description: 'Custom category', sortOrder: 80 },
    ],
  },
  {
    table: 'cp_marketplace_bot_status_lookups',
    values: [
      { code: 'draft', name: 'Draft', description: 'Draft and not submitted', sortOrder: 10 },
      {
        code: 'pending_review',
        name: 'Pending Review',
        description: 'Submitted and pending approval',
        sortOrder: 20,
      },
      { code: 'approved', name: 'Approved', description: 'Approved and ready to publish', sortOrder: 30 },
      { code: 'published', name: 'Published', description: 'Available in marketplace', sortOrder: 40 },
      { code: 'deprecated', name: 'Deprecated', description: 'Deprecated but still tracked', sortOrder: 50 },
      { code: 'rejected', name: 'Rejected', description: 'Rejected during review', sortOrder: 60 },
    ],
  },
  {
    table: 'cp_partner_status_lookups',
    values: [
      { code: 'pending', name: 'Pending', description: 'Pending partner approval', sortOrder: 10 },
      { code: 'approved', name: 'Approved', description: 'Approved partner', sortOrder: 20 },
      { code: 'suspended', name: 'Suspended', description: 'Suspended partner account', sortOrder: 30 },
      { code: 'terminated', name: 'Terminated', description: 'Terminated partner account', sortOrder: 40 },
      { code: 'rejected', name: 'Rejected', description: 'Rejected partner application', sortOrder: 50 },
    ],
  },
  {
    table: 'cp_revenue_share_tier_lookups',
    values: [
      { code: 'starter', name: 'Starter', description: 'Starter commission tier', sortOrder: 10 },
      {
        code: 'established',
        name: 'Established',
        description: 'Established commission tier',
        sortOrder: 20,
      },
      { code: 'premier', name: 'Premier', description: 'Premier commission tier', sortOrder: 30 },
    ],
  },
  {
    table: 'cp_ticket_status_lookups',
    values: [
      { code: 'open', name: 'Open', description: 'Ticket is open', sortOrder: 10 },
      { code: 'in_progress', name: 'In Progress', description: 'Ticket is being worked', sortOrder: 20 },
      { code: 'resolved', name: 'Resolved', description: 'Ticket resolved', sortOrder: 30 },
      { code: 'closed', name: 'Closed', description: 'Ticket closed', sortOrder: 40 },
    ],
  },
  {
    table: 'cp_ticket_priority_lookups',
    values: [
      { code: 'low', name: 'Low', description: 'Low priority', sortOrder: 10 },
      { code: 'normal', name: 'Normal', description: 'Normal priority', sortOrder: 20 },
      { code: 'high', name: 'High', description: 'High priority', sortOrder: 30 },
      { code: 'urgent', name: 'Urgent', description: 'Urgent priority', sortOrder: 40 },
    ],
  },
  {
    table: 'cp_marketplace_subscription_status_lookups',
    values: [
      { code: 'active', name: 'Active', description: 'Subscription is active', sortOrder: 10 },
      { code: 'canceled', name: 'Canceled', description: 'Subscription canceled', sortOrder: 20 },
    ],
  },
  {
    table: 'cp_marketplace_subscription_plan_lookups',
    values: [
      { code: 'usage', name: 'Usage', description: 'Usage-based billing', sortOrder: 10 },
      { code: 'per_call', name: 'Per Call', description: 'Per API call billing', sortOrder: 20 },
      { code: 'monthly', name: 'Monthly', description: 'Monthly fixed plan', sortOrder: 30 },
      { code: 'hybrid', name: 'Hybrid', description: 'Hybrid billing plan', sortOrder: 40 },
    ],
  },
  {
    table: 'cp_lead_status_lookups',
    values: [
      { code: 'new', name: 'New', description: 'New lead', sortOrder: 10 },
      { code: 'working', name: 'Working', description: 'Lead under qualification', sortOrder: 20 },
      { code: 'qualified', name: 'Qualified', description: 'Qualified lead', sortOrder: 30 },
      { code: 'disqualified', name: 'Disqualified', description: 'Disqualified lead', sortOrder: 40 },
    ],
  },
  {
    table: 'cp_client_contact_type_lookups',
    values: [
      { code: 'primary', name: 'Primary', description: 'Primary contact', sortOrder: 10 },
      { code: 'technical', name: 'Technical', description: 'Technical contact', sortOrder: 20 },
      { code: 'business', name: 'Business', description: 'Business contact', sortOrder: 30 },
      { code: 'legal', name: 'Legal', description: 'Legal contact', sortOrder: 40 },
      { code: 'billing', name: 'Billing', description: 'Billing contact', sortOrder: 50 },
      { code: 'support', name: 'Support', description: 'Support contact', sortOrder: 60 },
    ],
  },
  {
    table: 'cp_client_address_type_lookups',
    values: [
      { code: 'business', name: 'Business', description: 'Business address', sortOrder: 10 },
      { code: 'legal', name: 'Legal', description: 'Legal address', sortOrder: 20 },
      { code: 'postal', name: 'Postal', description: 'Postal address', sortOrder: 30 },
      { code: 'billing', name: 'Billing', description: 'Billing address', sortOrder: 40 },
      { code: 'shipping', name: 'Shipping', description: 'Shipping address', sortOrder: 50 },
    ],
  },
  {
    table: 'cp_pricing_model_lookups',
    values: [
      { code: 'free', name: 'Free', description: 'No billing', sortOrder: 10 },
      { code: 'subscription', name: 'Subscription', description: 'Subscription pricing', sortOrder: 20 },
      { code: 'usage', name: 'Usage', description: 'Usage-based pricing', sortOrder: 30 },
      { code: 'hybrid', name: 'Hybrid', description: 'Hybrid pricing', sortOrder: 40 },
    ],
  },
];

export class CreateControlPlaneEnumLookups1764120000000 implements MigrationInterface {
  name = 'CreateControlPlaneEnumLookups1764120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    for (const table of LOOKUP_TABLES) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "${table}" (
          "id" uuid NOT NULL DEFAULT gen_random_uuid(),
          "code" character varying(50) NOT NULL,
          "name" character varying(100) NOT NULL,
          "description" text,
          "isActive" boolean NOT NULL DEFAULT true,
          "sortOrder" integer NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_${table}_id" PRIMARY KEY ("id"),
          CONSTRAINT "UQ_${table}_code" UNIQUE ("code")
        )
      `);

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_${table}_is_active"
        ON "${table}" ("isActive")
      `);
    }

    for (const seed of LOOKUP_SEEDS) {
      for (const row of seed.values) {
        await queryRunner.query(
          `
            INSERT INTO "${seed.table}" ("code", "name", "description", "isActive", "sortOrder")
            VALUES ($1, $2, $3, true, $4)
            ON CONFLICT ("code") DO NOTHING
          `,
          [row.code, row.name, row.description, row.sortOrder],
        );
      }
    }

    await this.convertEnumColumnToVarchar(queryRunner, 'marketplace_bots', 'category', 50);
    await this.convertEnumColumnToVarchar(queryRunner, 'marketplace_bots', 'status', 50);
    await this.convertEnumColumnToVarchar(queryRunner, 'marketplace_bots', 'pricingModel', 50);
    await this.convertEnumColumnToVarchar(queryRunner, 'partners', 'status', 50);
    await this.convertEnumColumnToVarchar(queryRunner, 'partners', 'revenueShareTier', 50);
    await this.convertEnumColumnToVarchar(queryRunner, 'revenue_share_records', 'tier', 50);
    await this.convertEnumColumnToVarchar(queryRunner, 'tickets', 'status', 50);
    await this.convertEnumColumnToVarchar(queryRunner, 'tickets', 'priority', 50);
    await this.convertEnumColumnToVarchar(queryRunner, 'leads', 'status', 50);
    await this.convertEnumColumnToVarchar(queryRunner, 'marketplace_subscriptions', 'status', 32);
    await this.convertEnumColumnToVarchar(queryRunner, 'marketplace_subscriptions', 'pricingPlan', 32);

    await this.addCodeForeignKey(
      queryRunner,
      'marketplace_bots',
      'category',
      'cp_bot_category_lookups',
      'FK_marketplace_bots_category_lookup',
    );
    await this.addCodeForeignKey(
      queryRunner,
      'marketplace_bots',
      'status',
      'cp_marketplace_bot_status_lookups',
      'FK_marketplace_bots_status_lookup',
    );
    await this.addCodeForeignKey(
      queryRunner,
      'marketplace_bots',
      'pricingModel',
      'cp_pricing_model_lookups',
      'FK_marketplace_bots_pricing_model_lookup',
    );
    await this.addCodeForeignKey(
      queryRunner,
      'partners',
      'status',
      'cp_partner_status_lookups',
      'FK_partners_status_lookup',
    );
    await this.addCodeForeignKey(
      queryRunner,
      'partners',
      'revenueShareTier',
      'cp_revenue_share_tier_lookups',
      'FK_partners_revenue_share_tier_lookup',
    );
    await this.addCodeForeignKey(
      queryRunner,
      'revenue_share_records',
      'tier',
      'cp_revenue_share_tier_lookups',
      'FK_revenue_share_records_tier_lookup',
    );
    await this.addCodeForeignKey(
      queryRunner,
      'tickets',
      'status',
      'cp_ticket_status_lookups',
      'FK_tickets_status_lookup',
    );
    await this.addCodeForeignKey(
      queryRunner,
      'tickets',
      'priority',
      'cp_ticket_priority_lookups',
      'FK_tickets_priority_lookup',
    );
    await this.addCodeForeignKey(
      queryRunner,
      'leads',
      'status',
      'cp_lead_status_lookups',
      'FK_leads_status_lookup',
    );
    await this.addCodeForeignKey(
      queryRunner,
      'marketplace_subscriptions',
      'status',
      'cp_marketplace_subscription_status_lookups',
      'FK_marketplace_subscriptions_status_lookup',
    );
    await this.addCodeForeignKey(
      queryRunner,
      'marketplace_subscriptions',
      'pricingPlan',
      'cp_marketplace_subscription_plan_lookups',
      'FK_marketplace_subscriptions_pricing_plan_lookup',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const fkNames = [
      'FK_marketplace_bots_category_lookup',
      'FK_marketplace_bots_status_lookup',
      'FK_marketplace_bots_pricing_model_lookup',
      'FK_partners_status_lookup',
      'FK_partners_revenue_share_tier_lookup',
      'FK_revenue_share_records_tier_lookup',
      'FK_tickets_status_lookup',
      'FK_tickets_priority_lookup',
      'FK_leads_status_lookup',
      'FK_marketplace_subscriptions_status_lookup',
      'FK_marketplace_subscriptions_pricing_plan_lookup',
    ];

    const fkTables: Record<string, string> = {
      FK_marketplace_bots_category_lookup: 'marketplace_bots',
      FK_marketplace_bots_status_lookup: 'marketplace_bots',
      FK_marketplace_bots_pricing_model_lookup: 'marketplace_bots',
      FK_partners_status_lookup: 'partners',
      FK_partners_revenue_share_tier_lookup: 'partners',
      FK_revenue_share_records_tier_lookup: 'revenue_share_records',
      FK_tickets_status_lookup: 'tickets',
      FK_tickets_priority_lookup: 'tickets',
      FK_leads_status_lookup: 'leads',
      FK_marketplace_subscriptions_status_lookup: 'marketplace_subscriptions',
      FK_marketplace_subscriptions_pricing_plan_lookup: 'marketplace_subscriptions',
    };

    for (const fk of fkNames) {
      const table = fkTables[fk];
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${fk}') THEN
            ALTER TABLE "${table}" DROP CONSTRAINT "${fk}";
          END IF;
        END $$;
      `);
    }

    for (const table of LOOKUP_TABLES) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  }

  private async convertEnumColumnToVarchar(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    length: number,
  ): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = '${tableName}'
            AND column_name = '${columnName}'
        ) THEN
          EXECUTE 'ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" TYPE character varying(${length}) USING "${columnName}"::text';
        END IF;
      END $$;
    `);
  }

  private async addCodeForeignKey(
    queryRunner: QueryRunner,
    sourceTable: string,
    sourceColumn: string,
    lookupTable: string,
    constraintName: string,
  ): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = '${sourceTable}'
            AND column_name = '${sourceColumn}'
        )
        AND EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_name = '${lookupTable}'
        )
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}'
        ) THEN
          EXECUTE 'ALTER TABLE "${sourceTable}" ADD CONSTRAINT "${constraintName}" FOREIGN KEY ("${sourceColumn}") REFERENCES "${lookupTable}"("code") ON DELETE RESTRICT ON UPDATE CASCADE';
        END IF;
      END $$;
    `);
  }
}
