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

export class ConvertKeyColumnsToUuid1764090100000 implements MigrationInterface {
  name = 'ConvertKeyColumnsToUuid1764090100000';

  private readonly targets: ColumnTarget[] = [
    { table: 'roles', column: 'tenantId' },
    { table: 'users', column: 'tenantId' },
    { table: 'tenant_settings', column: 'tenantId' },
    { table: 'api_keys', column: 'tenantId' },
    { table: 'api_keys', column: 'userId' },
    { table: 'refresh_tokens', column: 'tenantId' },
    { table: 'refresh_tokens', column: 'userId' },
    { table: 'sessions', column: 'tenantId' },
    { table: 'sessions', column: 'userId' },
    { table: 'sessions', column: 'impersonatorId' },
    { table: 'sessions', column: 'refreshTokenId' },
    { table: 'audit_logs', column: 'tenantId' },
    { table: 'audit_logs', column: 'userId' },
    { table: 'audit_logs', column: 'impersonatorId' },
    { table: 'audit_logs', column: 'apiKeyId' },
    { table: 'audit_logs', column: 'runnerId' },
    { table: 'auditors', column: 'tenantId' },
    { table: 'auditors', column: 'createdById' },
    { table: 'auditor_access_logs', column: 'auditorId' },
    { table: 'auditor_access_logs', column: 'tenantId' },
    { table: 'bots', column: 'tenantId' },
    { table: 'bots', column: 'createdBy' },
    { table: 'bots', column: 'updatedBy' },
    { table: 'bots', column: 'currentVersionId' },
    { table: 'bots', column: 'draftVersionId' },
    { table: 'bots', column: 'defaultRunnerId' },
    { table: 'bots', column: 'runnerGroupId' },
    { table: 'bots', column: 'folderId' },
    { table: 'bots', column: 'archivedBy' },
    { table: 'bot_versions', column: 'botId' },
    { table: 'bot_versions', column: 'publishedBy' },
    { table: 'bot_versions', column: 'createdBy' },
    { table: 'bot_versions', column: 'updatedBy' },
    { table: 'bot_versions', column: 'deprecatedBy' },
    { table: 'runs', column: 'tenantId' },
    { table: 'runs', column: 'botId' },
    { table: 'runs', column: 'botVersionId' },
    { table: 'runs', column: 'runnerId' },
    { table: 'runs', column: 'runnerPoolId' },
    { table: 'runs', column: 'parentRunId' },
    { table: 'runs', column: 'rootRunId' },
    { table: 'runs', column: 'scheduleId' },
    { table: 'runs', column: 'scheduleExecutionId' },
    { table: 'run_events', column: 'tenantId' },
    { table: 'run_events', column: 'runId' },
    { table: 'run_logs', column: 'tenantId' },
    { table: 'run_logs', column: 'runId' },
    { table: 'run_artifacts', column: 'tenantId' },
    { table: 'run_artifacts', column: 'runId' },
    { table: 'hitl_requests', column: 'tenantId' },
    { table: 'hitl_requests', column: 'runId' },
    { table: 'hitl_requests', column: 'assignedTo' },
    { table: 'hitl_requests', column: 'escalatedTo' },
    { table: 'hitl_requests', column: 'resolvedBy' },
    { table: 'schedules', column: 'tenantId' },
    { table: 'schedules', column: 'botId' },
    { table: 'schedules', column: 'botVersionId' },
    { table: 'schedules', column: 'eventTriggerId' },
    { table: 'schedules', column: 'webhookTriggerId' },
    { table: 'schedules', column: 'targetPoolId' },
    { table: 'schedules', column: 'targetRunnerId' },
    { table: 'schedules', column: 'lastRunId' },
    { table: 'schedules', column: 'lastSuccessRunId' },
    { table: 'schedules', column: 'lastFailureRunId' },
    { table: 'schedules', column: 'createdBy' },
    { table: 'schedules', column: 'updatedBy' },
    { table: 'schedules', column: 'ownerId' },
    { table: 'schedule_executions', column: 'tenantId' },
    { table: 'schedule_executions', column: 'scheduleId' },
    { table: 'schedule_executions', column: 'runId' },
    { table: 'schedule_executions', column: 'botVersionId' },
    { table: 'event_triggers', column: 'tenantId' },
    { table: 'event_triggers', column: 'scheduleId' },
    { table: 'event_triggers', column: 'sourceBotId' },
    { table: 'event_triggers', column: 'createdBy' },
    { table: 'webhook_triggers', column: 'tenantId' },
    { table: 'webhook_triggers', column: 'scheduleId' },
    { table: 'webhook_triggers', column: 'createdBy' },
    { table: 'webhook_triggers', column: 'revokedBy' },
    { table: 'schedule_calendar_entries', column: 'scheduleId' },
    { table: 'schedule_calendar_entries', column: 'runId' },
    { table: 'schedule_calendar_entries', column: 'createdBy' },
    { table: 'schedule_groups', column: 'tenantId' },
    { table: 'schedule_groups', column: 'createdBy' },
    { table: 'runners', column: 'tenantId' },
    { table: 'runners', column: 'poolId' },
    { table: 'runners', column: 'currentJobId' },
    { table: 'runner_pools', column: 'tenantId' },
    { table: 'runner_pools', column: 'createdBy' },
    { table: 'runner_heartbeats', column: 'tenantId' },
    { table: 'runner_heartbeats', column: 'runnerId' },
    { table: 'runner_events', column: 'tenantId' },
    { table: 'runner_events', column: 'runnerId' },
    { table: 'usage_events', column: 'tenantId' },
    { table: 'usage_events', column: 'botId' },
    { table: 'usage_events', column: 'runId' },
    { table: 'usage_events', column: 'installationId' },
    { table: 'bot_installations', column: 'tenantId' },
    { table: 'bot_installations', column: 'marketplaceBotId' },
    { table: 'bot_installations', column: 'installedBy' },
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
