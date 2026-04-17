import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContractAcceptanceComplianceFields1765565000000 implements MigrationInterface {
  name = 'AddContractAcceptanceComplianceFields1765565000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "accepted_by_title" character varying(180)
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "content_snapshot_hash" character varying(64)
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "content_snapshot" text
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "signature_hash" character varying(64)
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "countersigned_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "countersigned_by" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "skuld_signatory_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "skuld_signatory_name" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "skuld_signatory_title" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "skuld_signatory_email" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "skuld_signature_hash" character varying(64)
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "skuld_resolution_source" character varying(20)
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "skuld_resolved_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "signed_pdf_url" character varying(500)
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "signed_pdf_hash" character varying(64)
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "variables_used" jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "effective_date" TIMESTAMP WITH TIME ZONE DEFAULT now()
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "expiration_date" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "superseded_by_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      ADD COLUMN IF NOT EXISTS "revocation_reason" text
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_cp_contract_acceptances_skuld_signatory_id'
        ) THEN
          ALTER TABLE "cp_contract_acceptances"
          ADD CONSTRAINT "FK_cp_contract_acceptances_skuld_signatory_id"
          FOREIGN KEY ("skuld_signatory_id")
          REFERENCES "cp_contract_signatories"("id")
          ON DELETE SET NULL
          ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_cp_contract_acceptances_superseded_by_id'
        ) THEN
          ALTER TABLE "cp_contract_acceptances"
          ADD CONSTRAINT "FK_cp_contract_acceptances_superseded_by_id"
          FOREIGN KEY ("superseded_by_id")
          REFERENCES "cp_contract_acceptances"("id")
          ON DELETE SET NULL
          ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_acceptances_revoked_at"
      ON "cp_contract_acceptances" ("revoked_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_acceptances_client_active"
      ON "cp_contract_acceptances" ("client_id", "revoked_at", "expiration_date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_acceptances_client_active"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_acceptances_revoked_at"');

    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      DROP CONSTRAINT IF EXISTS "FK_cp_contract_acceptances_superseded_by_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "cp_contract_acceptances"
      DROP CONSTRAINT IF EXISTS "FK_cp_contract_acceptances_skuld_signatory_id"
    `);

    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "revocation_reason"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "revoked_at"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "superseded_by_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "expiration_date"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "effective_date"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "variables_used"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "signed_pdf_hash"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "signed_pdf_url"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "skuld_resolved_at"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "skuld_resolution_source"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "skuld_signature_hash"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "skuld_signatory_email"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "skuld_signatory_title"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "skuld_signatory_name"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "skuld_signatory_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "countersigned_by"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "countersigned_at"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "signature_hash"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "content_snapshot"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "content_snapshot_hash"',
    );
    await queryRunner.query(
      'ALTER TABLE "cp_contract_acceptances" DROP COLUMN IF EXISTS "accepted_by_title"',
    );
  }
}

