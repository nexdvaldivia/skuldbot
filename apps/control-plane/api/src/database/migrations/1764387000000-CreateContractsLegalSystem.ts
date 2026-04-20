import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContractsLegalSystem1764387000000 implements MigrationInterface {
  name = 'CreateContractsLegalSystem1764387000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cp_contract_template_status_enum') THEN
          CREATE TYPE "cp_contract_template_status_enum" AS ENUM (
            'draft',
            'published',
            'deprecated',
            'archived'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cp_contract_envelope_status_enum') THEN
          CREATE TYPE "cp_contract_envelope_status_enum" AS ENUM (
            'draft',
            'sent',
            'completed',
            'declined',
            'expired',
            'cancelled'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cp_contract_envelope_recipient_status_enum') THEN
          CREATE TYPE "cp_contract_envelope_recipient_status_enum" AS ENUM (
            'pending',
            'sent',
            'viewed',
            'otp_pending',
            'otp_verified',
            'signed',
            'declined'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cp_contract_signature_type_enum') THEN
          CREATE TYPE "cp_contract_signature_type_enum" AS ENUM (
            'typed',
            'drawn',
            'upload'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cp_contract_acceptance_method_enum') THEN
          CREATE TYPE "cp_contract_acceptance_method_enum" AS ENUM (
            'clickwrap',
            'esign',
            'manual',
            'imported'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cp_contract_requirement_action_enum') THEN
          CREATE TYPE "cp_contract_requirement_action_enum" AS ENUM (
            'deploy_orchestrator',
            'license_create',
            'process_phi',
            'process_eu_pii'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_contract_templates" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "template_key" character varying(120) NOT NULL,
        "title" character varying(180) NOT NULL,
        "description" text,
        "status" "cp_contract_template_status_enum" NOT NULL DEFAULT 'draft',
        "active_version_id" uuid,
        "latest_version_number" integer NOT NULL DEFAULT 1,
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_contract_templates_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cp_contract_templates_template_key" UNIQUE ("template_key")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_contract_template_versions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "template_id" uuid NOT NULL,
        "version_number" integer NOT NULL,
        "supersedes_version_id" uuid,
        "status" "cp_contract_template_status_enum" NOT NULL DEFAULT 'draft',
        "document_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "variable_definitions" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "rendered_html" text,
        "change_log" text,
        "published_at" TIMESTAMP WITH TIME ZONE,
        "deprecated_at" TIMESTAMP WITH TIME ZONE,
        "archived_at" TIMESTAMP WITH TIME ZONE,
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_contract_template_versions_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_cp_contract_template_version_number" UNIQUE ("template_id", "version_number"),
        CONSTRAINT "FK_cp_contract_template_versions_template_id"
          FOREIGN KEY ("template_id") REFERENCES "cp_contract_templates"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_contract_template_versions_supersedes_version_id"
          FOREIGN KEY ("supersedes_version_id") REFERENCES "cp_contract_template_versions"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_cp_contract_templates_active_version_id'
            AND table_name = 'cp_contract_templates'
        ) THEN
          ALTER TABLE "cp_contract_templates"
          ADD CONSTRAINT "FK_cp_contract_templates_active_version_id"
          FOREIGN KEY ("active_version_id") REFERENCES "cp_contract_template_versions"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_contract_envelopes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "contract_id" uuid,
        "template_id" uuid,
        "template_version_id" uuid,
        "client_id" uuid NOT NULL,
        "tenant_id" uuid,
        "subject" character varying(220) NOT NULL,
        "status" "cp_contract_envelope_status_enum" NOT NULL DEFAULT 'draft',
        "external_provider" character varying(80),
        "external_envelope_id" character varying(180),
        "expires_at" TIMESTAMP WITH TIME ZONE,
        "sent_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "declined_at" TIMESTAMP WITH TIME ZONE,
        "cancelled_at" TIMESTAMP WITH TIME ZONE,
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_contract_envelopes_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cp_contract_envelopes_contract_id"
          FOREIGN KEY ("contract_id") REFERENCES "cp_contracts"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_contract_envelopes_template_id"
          FOREIGN KEY ("template_id") REFERENCES "cp_contract_templates"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_contract_envelopes_template_version_id"
          FOREIGN KEY ("template_version_id") REFERENCES "cp_contract_template_versions"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_contract_envelopes_client_id"
          FOREIGN KEY ("client_id") REFERENCES "clients"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_contract_envelopes_tenant_id"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_contract_envelope_recipients" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "envelope_id" uuid NOT NULL,
        "signer_id" uuid,
        "email" character varying(180) NOT NULL,
        "full_name" character varying(180) NOT NULL,
        "role_label" character varying(120) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "status" "cp_contract_envelope_recipient_status_enum" NOT NULL DEFAULT 'pending',
        "otp_code_hash" character varying(128),
        "otp_expires_at" TIMESTAMP WITH TIME ZONE,
        "otp_verified_at" TIMESTAMP WITH TIME ZONE,
        "otp_attempts" integer NOT NULL DEFAULT 0,
        "viewed_at" TIMESTAMP WITH TIME ZONE,
        "signed_at" TIMESTAMP WITH TIME ZONE,
        "declined_at" TIMESTAMP WITH TIME ZONE,
        "signature_type" "cp_contract_signature_type_enum",
        "signature_value" text,
        "signature_asset_path" character varying(512),
        "ip_address" character varying(45),
        "user_agent" character varying(500),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_contract_envelope_recipients_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_cp_contract_envelope_recipient_email" UNIQUE ("envelope_id", "email"),
        CONSTRAINT "FK_cp_contract_envelope_recipients_envelope_id"
          FOREIGN KEY ("envelope_id") REFERENCES "cp_contract_envelopes"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_contract_envelope_recipients_signer_id"
          FOREIGN KEY ("signer_id") REFERENCES "cp_contract_signers"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_contract_envelope_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "envelope_id" uuid NOT NULL,
        "recipient_id" uuid,
        "event_type" character varying(120) NOT NULL,
        "event_source" character varying(80),
        "event_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_contract_envelope_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cp_contract_envelope_events_envelope_id"
          FOREIGN KEY ("envelope_id") REFERENCES "cp_contract_envelopes"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_contract_envelope_events_recipient_id"
          FOREIGN KEY ("recipient_id") REFERENCES "cp_contract_envelope_recipients"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_contract_acceptances" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "contract_id" uuid NOT NULL,
        "envelope_id" uuid,
        "template_id" uuid,
        "template_version_id" uuid,
        "client_id" uuid NOT NULL,
        "tenant_id" uuid,
        "accepted_by_name" character varying(180) NOT NULL,
        "accepted_by_email" character varying(180) NOT NULL,
        "acceptance_method" "cp_contract_acceptance_method_enum" NOT NULL DEFAULT 'esign',
        "ip_address" character varying(45) NOT NULL,
        "user_agent" character varying(500),
        "accepted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_contract_acceptances_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cp_contract_acceptances_contract_id"
          FOREIGN KEY ("contract_id") REFERENCES "cp_contracts"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_contract_acceptances_envelope_id"
          FOREIGN KEY ("envelope_id") REFERENCES "cp_contract_envelopes"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_contract_acceptances_template_id"
          FOREIGN KEY ("template_id") REFERENCES "cp_contract_templates"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_contract_acceptances_template_version_id"
          FOREIGN KEY ("template_version_id") REFERENCES "cp_contract_template_versions"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_contract_acceptances_client_id"
          FOREIGN KEY ("client_id") REFERENCES "clients"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_contract_acceptances_tenant_id"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_contract_requirements" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "plan_code" character varying(80),
        "addon_code" character varying(80),
        "action" "cp_contract_requirement_action_enum" NOT NULL,
        "contract_type_code" character varying(80) NOT NULL,
        "is_required" boolean NOT NULL DEFAULT true,
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_contract_requirements_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_cp_contract_requirements_scope"
          UNIQUE ("plan_code", "addon_code", "action", "contract_type_code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_contract_signatories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "full_name" character varying(180) NOT NULL,
        "email" character varying(180) NOT NULL,
        "title" character varying(180),
        "is_active" boolean NOT NULL DEFAULT true,
        "is_default" boolean NOT NULL DEFAULT false,
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        "policies" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_contract_signatories_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_contract_legal_info" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "legal_name" character varying(220),
        "trade_name" character varying(220),
        "legal_address_line1" character varying(220),
        "legal_address_line2" character varying(220),
        "legal_city" character varying(120),
        "legal_state" character varying(120),
        "legal_postal_code" character varying(40),
        "legal_country" character varying(120),
        "representative_name" character varying(180),
        "representative_title" character varying(180),
        "representative_email" character varying(180),
        "website_url" character varying(300),
        "support_email" character varying(180),
        "support_phone" character varying(80),
        "updated_by_user_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_contract_legal_info_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_template_versions_template_id"
      ON "cp_contract_template_versions" ("template_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_envelopes_client_id"
      ON "cp_contract_envelopes" ("client_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_envelopes_tenant_id"
      ON "cp_contract_envelopes" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_envelopes_status"
      ON "cp_contract_envelopes" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_envelope_recipients_envelope_id"
      ON "cp_contract_envelope_recipients" ("envelope_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_envelope_events_envelope_id"
      ON "cp_contract_envelope_events" ("envelope_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_acceptances_client_id"
      ON "cp_contract_acceptances" ("client_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_acceptances_contract_id"
      ON "cp_contract_acceptances" ("contract_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_requirements_action"
      ON "cp_contract_requirements" ("action")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_signatories_email"
      ON "cp_contract_signatories" ("email")
    `);

    await queryRunner.query(`
      INSERT INTO "cp_contract_requirements" (
        "plan_code", "addon_code", "action", "contract_type_code", "is_required", "metadata"
      )
      VALUES
        (NULL, NULL, 'deploy_orchestrator', 'msa', true, '{}'::jsonb),
        (NULL, NULL, 'license_create', 'msa', true, '{}'::jsonb),
        (NULL, NULL, 'process_phi', 'baa', true, '{}'::jsonb),
        (NULL, NULL, 'process_eu_pii', 'dpa', true, '{}'::jsonb)
      ON CONFLICT ("plan_code", "addon_code", "action", "contract_type_code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_signatories_email"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_requirements_action"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_acceptances_contract_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_acceptances_client_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_envelope_events_envelope_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_envelope_recipients_envelope_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_envelopes_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_envelopes_tenant_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_envelopes_client_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_template_versions_template_id"');

    await queryRunner.query('DROP TABLE IF EXISTS "cp_contract_legal_info"');
    await queryRunner.query('DROP TABLE IF EXISTS "cp_contract_signatories"');
    await queryRunner.query('DROP TABLE IF EXISTS "cp_contract_requirements"');
    await queryRunner.query('DROP TABLE IF EXISTS "cp_contract_acceptances"');
    await queryRunner.query('DROP TABLE IF EXISTS "cp_contract_envelope_events"');
    await queryRunner.query('DROP TABLE IF EXISTS "cp_contract_envelope_recipients"');
    await queryRunner.query('DROP TABLE IF EXISTS "cp_contract_envelopes"');

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_cp_contract_templates_active_version_id'
            AND table_name = 'cp_contract_templates'
        ) THEN
          ALTER TABLE "cp_contract_templates"
          DROP CONSTRAINT "FK_cp_contract_templates_active_version_id";
        END IF;
      END
      $$;
    `);

    await queryRunner.query('DROP TABLE IF EXISTS "cp_contract_template_versions"');
    await queryRunner.query('DROP TABLE IF EXISTS "cp_contract_templates"');

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cp_contract_requirement_action_enum') THEN
          DROP TYPE "cp_contract_requirement_action_enum";
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cp_contract_acceptance_method_enum') THEN
          DROP TYPE "cp_contract_acceptance_method_enum";
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cp_contract_signature_type_enum') THEN
          DROP TYPE "cp_contract_signature_type_enum";
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cp_contract_envelope_recipient_status_enum') THEN
          DROP TYPE "cp_contract_envelope_recipient_status_enum";
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cp_contract_envelope_status_enum') THEN
          DROP TYPE "cp_contract_envelope_status_enum";
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cp_contract_template_status_enum') THEN
          DROP TYPE "cp_contract_template_status_enum";
        END IF;
      END
      $$;
    `);
  }
}
