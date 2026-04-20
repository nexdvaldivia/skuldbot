import { MigrationInterface, QueryRunner } from 'typeorm';

type ColumnTarget = {
  table: string;
  column: string;
};

type ForeignKeyConstraint = {
  table_name: string;
  constraint_name: string;
  definition: string;
};

export class ConvertKeyColumnsToUuid1764090000000 implements MigrationInterface {
  name = 'ConvertKeyColumnsToUuid1764090000000';

  private readonly targets: ColumnTarget[] = [
    { table: 'users', column: 'client_id' },
    { table: 'cp_roles', column: 'client_id' },
    { table: 'tenants', column: 'client_id' },
    { table: 'licenses', column: 'tenant_id' },
    { table: 'quota_policies', column: 'tenant_id' },
    { table: 'usage_counters', column: 'tenant_id' },
    { table: 'tickets', column: 'tenant_id' },
    { table: 'tickets', column: 'lead_id' },
    { table: 'leads', column: 'tenant_id' },
    { table: 'lead_intake_events', column: 'lead_id' },
    { table: 'lead_intake_events', column: 'tenant_id' },
    { table: 'orchestrator_instances', column: 'tenant_id' },
    { table: 'tenant_subscriptions', column: 'tenantId' },
    { table: 'payment_history', column: 'tenantId' },
    { table: 'payment_history', column: 'subscriptionId' },
    { table: 'revenue_share_records', column: 'partnerId' },
    { table: 'partner_payouts', column: 'partnerId' },
    { table: 'usage_records', column: 'tenantId' },
    { table: 'usage_records', column: 'botId' },
    { table: 'usage_records', column: 'installationId' },
    { table: 'usage_batches', column: 'tenantId' },
    { table: 'usage_ingest_events', column: 'tenantId' },
    { table: 'usage_ingest_dead_letters', column: 'tenantId' },
    { table: 'marketplace_bots', column: 'publisherId' },
    { table: 'marketplace_bot_versions', column: 'marketplaceBotId' },
    { table: 'provider_configs', column: 'tenantId' },
    { table: 'provider_configs', column: 'createdBy' },
    { table: 'provider_configs', column: 'updatedBy' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const targetTables = [...new Set(this.targets.map((target) => target.table))];
    const droppedForeignKeys = await this.dropForeignKeysForTables(queryRunner, targetTables);

    try {
      for (const target of this.targets) {
        await this.convertColumnToUuid(queryRunner, target.table, target.column);
      }
    } finally {
      await this.restoreForeignKeys(queryRunner, droppedForeignKeys);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const targetTables = [...new Set(this.targets.map((target) => target.table))];
    const droppedForeignKeys = await this.dropForeignKeysForTables(queryRunner, targetTables);

    try {
      for (const target of this.targets) {
        await this.convertColumnToVarchar(queryRunner, target.table, target.column);
      }
    } finally {
      await this.restoreForeignKeys(queryRunner, droppedForeignKeys);
    }
  }

  private async dropForeignKeysForTables(
    queryRunner: QueryRunner,
    tables: string[],
  ): Promise<ForeignKeyConstraint[]> {
    const constraints: ForeignKeyConstraint[] = await queryRunner.query(
      `
      SELECT
        cls.relname AS table_name,
        con.conname AS constraint_name,
        pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class cls ON cls.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      JOIN pg_class refcls ON refcls.oid = con.confrelid
      JOIN pg_namespace refns ON refns.oid = refcls.relnamespace
      WHERE con.contype = 'f'
        AND ns.nspname = 'public'
        AND refns.nspname = 'public'
        AND (cls.relname = ANY($1) OR refcls.relname = ANY($1))
      ORDER BY cls.relname, con.conname
      `,
      [tables],
    );

    for (const constraint of constraints) {
      await queryRunner.query(
        `ALTER TABLE "public"."${constraint.table_name}" DROP CONSTRAINT IF EXISTS "${constraint.constraint_name}"`,
      );
    }

    return constraints;
  }

  private async restoreForeignKeys(
    queryRunner: QueryRunner,
    constraints: ForeignKeyConstraint[],
  ): Promise<void> {
    for (const constraint of constraints) {
      await queryRunner.query(
        `ALTER TABLE "public"."${constraint.table_name}" ADD CONSTRAINT "${constraint.constraint_name}" ${constraint.definition}`,
      );
    }
  }

  private async convertColumnToUuid(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<void> {
    const columns = await queryRunner.query(
      `
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      `,
      [table, column],
    );

    if (columns.length === 0) {
      return;
    }

    const dataType: string = columns[0].data_type;
    if (dataType === 'uuid') {
      return;
    }

    if (!['character varying', 'character', 'text'].includes(dataType)) {
      return;
    }

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "public"."${table}"
          WHERE "${column}" IS NOT NULL
            AND NOT ("${column}"::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        ) THEN
          RAISE EXCEPTION 'Cannot convert %.% to uuid: non-uuid values detected', '${table}', '${column}';
        END IF;
      END
      $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "public"."${table}" ALTER COLUMN "${column}" TYPE uuid USING "${column}"::uuid`,
    );
  }

  private async convertColumnToVarchar(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<void> {
    const columns = await queryRunner.query(
      `
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      `,
      [table, column],
    );

    if (columns.length === 0) {
      return;
    }

    const dataType: string = columns[0].data_type;
    if (dataType !== 'uuid') {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "public"."${table}" ALTER COLUMN "${column}" TYPE character varying USING "${column}"::text`,
    );
  }
}
