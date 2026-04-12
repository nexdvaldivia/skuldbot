import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLicenseRuntimeDecisions1764111000000 implements MigrationInterface {
  name = 'CreateLicenseRuntimeDecisions1764111000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "license_runtime_decisions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "decision_type" character varying(32) NOT NULL,
        "resource_type" character varying(128) NOT NULL,
        "requested" numeric(18,6) NOT NULL DEFAULT 0,
        "projected" numeric(18,6) NOT NULL DEFAULT 0,
        "limit" numeric(18,6),
        "period" character varying(32),
        "state" character varying(32),
        "allowed" boolean NOT NULL,
        "consumed" boolean,
        "reason" character varying(255),
        "orchestrator_id" character varying(128),
        "trace_id" character varying(128),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_license_runtime_decisions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_license_runtime_decisions_tenant"
          FOREIGN KEY ("tenant_id")
          REFERENCES "tenants"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_license_runtime_decisions_tenant_created_at"
      ON "license_runtime_decisions" ("tenant_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_license_runtime_decisions_lookup"
      ON "license_runtime_decisions" ("tenant_id", "decision_type", "resource_type", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_license_runtime_decisions_lookup"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_license_runtime_decisions_tenant_created_at"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "license_runtime_decisions"');
  }
}
