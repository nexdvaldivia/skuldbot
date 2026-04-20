import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSigningDocuments1765570000000 implements MigrationInterface {
  name = 'CreateSigningDocuments1765570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_signing_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "envelope_id" uuid NOT NULL,
        "name" character varying(255) NOT NULL,
        "content_type" character varying(40) NOT NULL DEFAULT 'pdf',
        "content" text,
        "content_hash" character varying(64) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "template_id" uuid,
        "template_version_id" uuid,
        "variables" jsonb,
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_signing_documents_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cp_signing_documents_envelope_id" FOREIGN KEY ("envelope_id")
          REFERENCES "cp_contract_envelopes"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_signing_documents_template_id" FOREIGN KEY ("template_id")
          REFERENCES "cp_contract_templates"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_signing_documents_template_version_id" FOREIGN KEY ("template_version_id")
          REFERENCES "cp_contract_template_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_signing_documents_envelope_id"
      ON "cp_signing_documents" ("envelope_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_signing_documents_order"
      ON "cp_signing_documents" ("envelope_id", "sort_order")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_signing_documents_order"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_signing_documents_envelope_id"');
    await queryRunner.query('DROP TABLE IF EXISTS "cp_signing_documents"');
  }
}
