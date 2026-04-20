import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContractsFoundation1764202000000 implements MigrationInterface {
  name = 'CreateContractsFoundation1764202000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cp_contract_status_enum') THEN
          CREATE TYPE "cp_contract_status_enum" AS ENUM (
            'draft',
            'pending_signature',
            'signed',
            'declined',
            'cancelled',
            'expired'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cp_contract_signer_status_enum') THEN
          CREATE TYPE "cp_contract_signer_status_enum" AS ENUM (
            'pending',
            'sent',
            'viewed',
            'signed',
            'declined'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_contracts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "client_id" uuid NOT NULL,
        "tenant_id" uuid,
        "title" character varying(180) NOT NULL,
        "template_key" character varying(120) NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "status" "cp_contract_status_enum" NOT NULL DEFAULT 'draft',
        "variables" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "document_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "rendered_html" text,
        "pdf_path" character varying(512),
        "envelope_provider" character varying(80),
        "envelope_id" character varying(180),
        "signed_at" TIMESTAMP WITH TIME ZONE,
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_contracts_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cp_contracts_client_id"
          FOREIGN KEY ("client_id") REFERENCES "clients"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_contracts_tenant_id"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_contract_signers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "contract_id" uuid NOT NULL,
        "email" character varying(180) NOT NULL,
        "full_name" character varying(180) NOT NULL,
        "role_label" character varying(120) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "status" "cp_contract_signer_status_enum" NOT NULL DEFAULT 'pending',
        "sent_at" TIMESTAMP WITH TIME ZONE,
        "viewed_at" TIMESTAMP WITH TIME ZONE,
        "signed_at" TIMESTAMP WITH TIME ZONE,
        "declined_at" TIMESTAMP WITH TIME ZONE,
        "external_recipient_id" character varying(180),
        "signature_audit" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_contract_signers_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_cp_contract_signers_contract_email" UNIQUE ("contract_id", "email"),
        CONSTRAINT "FK_cp_contract_signers_contract_id"
          FOREIGN KEY ("contract_id") REFERENCES "cp_contracts"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_contract_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "contract_id" uuid NOT NULL,
        "event_type" character varying(120) NOT NULL,
        "event_source" character varying(80),
        "event_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_contract_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cp_contract_events_contract_id"
          FOREIGN KEY ("contract_id") REFERENCES "cp_contracts"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contracts_client_id"
      ON "cp_contracts" ("client_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contracts_tenant_id"
      ON "cp_contracts" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contracts_status"
      ON "cp_contracts" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_signers_contract_id"
      ON "cp_contract_signers" ("contract_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_events_contract_id"
      ON "cp_contract_events" ("contract_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_events_occurred_at"
      ON "cp_contract_events" ("occurred_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_events_occurred_at"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_events_contract_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_signers_contract_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contracts_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contracts_tenant_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contracts_client_id"');

    await queryRunner.query('DROP TABLE IF EXISTS "cp_contract_events"');
    await queryRunner.query('DROP TABLE IF EXISTS "cp_contract_signers"');
    await queryRunner.query('DROP TABLE IF EXISTS "cp_contracts"');

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cp_contract_signer_status_enum') THEN
          DROP TYPE "cp_contract_signer_status_enum";
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cp_contract_status_enum') THEN
          DROP TYPE "cp_contract_status_enum";
        END IF;
      END
      $$;
    `);
  }
}
