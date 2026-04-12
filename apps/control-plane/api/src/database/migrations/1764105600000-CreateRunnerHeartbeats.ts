import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRunnerHeartbeats1764105600000 implements MigrationInterface {
  name = 'CreateRunnerHeartbeats1764105600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "runner_heartbeats" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenantId" uuid NOT NULL,
        "runnerId" uuid NOT NULL,
        "type" character varying(32) NOT NULL,
        "status" character varying(32) NOT NULL DEFAULT 'active',
        "orchestratorId" character varying(64),
        "heartbeatAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "metadata" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_runner_heartbeats_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_runner_heartbeats_tenant_runner"
          UNIQUE ("tenantId", "runnerId"),
        CONSTRAINT "FK_runner_heartbeats_tenant"
          FOREIGN KEY ("tenantId")
          REFERENCES "tenants"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_runner_heartbeats_tenant_heartbeat"
      ON "runner_heartbeats" ("tenantId", "heartbeatAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_runner_heartbeats_tenant_heartbeat"');
    await queryRunner.query('DROP TABLE IF EXISTS "runner_heartbeats"');
  }
}
