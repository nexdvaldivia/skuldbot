import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContractSignatorySignatureFields1765555000000 implements MigrationInterface {
  name = 'AddContractSignatorySignatureFields1765555000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      ADD COLUMN IF NOT EXISTS "company_name" character varying(255) NOT NULL DEFAULT 'Skuld, LLC'
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      ADD COLUMN IF NOT EXISTS "signature_storage_key" character varying(500)
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      ADD COLUMN IF NOT EXISTS "signature_content_type" character varying(120)
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      ADD COLUMN IF NOT EXISTS "signature_sha256" character varying(128)
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      ADD COLUMN IF NOT EXISTS "signature_uploaded_at" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      ADD COLUMN IF NOT EXISTS "initials_image" character varying(500)
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      ADD COLUMN IF NOT EXISTS "initials_storage_key" character varying(500)
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      ADD COLUMN IF NOT EXISTS "initials_content_type" character varying(120)
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      ADD COLUMN IF NOT EXISTS "initials_sha256" character varying(128)
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      ADD COLUMN IF NOT EXISTS "initials_uploaded_at" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      ADD COLUMN IF NOT EXISTS "signature_text" character varying(255)
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      DROP COLUMN IF EXISTS "deleted_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      DROP COLUMN IF EXISTS "signature_text"
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      DROP COLUMN IF EXISTS "initials_uploaded_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      DROP COLUMN IF EXISTS "initials_sha256"
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      DROP COLUMN IF EXISTS "initials_content_type"
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      DROP COLUMN IF EXISTS "initials_storage_key"
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      DROP COLUMN IF EXISTS "initials_image"
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      DROP COLUMN IF EXISTS "signature_uploaded_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      DROP COLUMN IF EXISTS "signature_sha256"
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      DROP COLUMN IF EXISTS "signature_content_type"
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      DROP COLUMN IF EXISTS "signature_storage_key"
    `);

    await queryRunner.query(`
      ALTER TABLE "cp_contract_signatories"
      DROP COLUMN IF EXISTS "company_name"
    `);
  }
}
