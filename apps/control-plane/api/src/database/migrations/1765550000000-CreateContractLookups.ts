import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContractLookups1765550000000 implements MigrationInterface {
  name = 'CreateContractLookups1765550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_contract_type_lookups" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "code" character varying(80) NOT NULL,
        "label" character varying(180) NOT NULL,
        "description" character varying(500),
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_contract_type_lookups_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_cp_contract_type_lookups_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_contract_jurisdiction_lookups" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "code" character varying(80) NOT NULL,
        "label" character varying(180) NOT NULL,
        "description" character varying(500),
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_contract_jurisdiction_lookups_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_cp_contract_jurisdiction_lookups_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_contract_compliance_framework_lookups" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "code" character varying(80) NOT NULL,
        "label" character varying(180) NOT NULL,
        "description" character varying(500),
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_contract_compliance_framework_lookups_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_cp_contract_compliance_framework_lookups_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_type_lookups_is_active"
      ON "cp_contract_type_lookups" ("is_active")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_jurisdiction_lookups_is_active"
      ON "cp_contract_jurisdiction_lookups" ("is_active")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_compliance_framework_lookups_is_active"
      ON "cp_contract_compliance_framework_lookups" ("is_active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_cp_contract_compliance_framework_lookups_is_active"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_jurisdiction_lookups_is_active"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_type_lookups_is_active"');

    await queryRunner.query('DROP TABLE IF EXISTS "cp_contract_compliance_framework_lookups"');
    await queryRunner.query('DROP TABLE IF EXISTS "cp_contract_jurisdiction_lookups"');
    await queryRunner.query('DROP TABLE IF EXISTS "cp_contract_type_lookups"');
  }
}
