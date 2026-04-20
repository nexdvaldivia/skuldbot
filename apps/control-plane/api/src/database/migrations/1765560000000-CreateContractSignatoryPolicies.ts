import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContractSignatoryPolicies1765560000000 implements MigrationInterface {
  name = 'CreateContractSignatoryPolicies1765560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_contract_signatory_policies" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "contract_type" character varying(80) NOT NULL,
        "signatory_id" uuid NOT NULL,
        "priority" integer NOT NULL DEFAULT 100,
        "is_active" boolean NOT NULL DEFAULT true,
        "valid_from" TIMESTAMP WITH TIME ZONE,
        "valid_to" TIMESTAMP WITH TIME ZONE,
        "notes" text,
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_contract_signatory_policies_id" PRIMARY KEY ("id"),
        CONSTRAINT "ck_cp_contract_signatory_policy_valid_window"
          CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"),
        CONSTRAINT "FK_cp_contract_signatory_policies_contract_type"
          FOREIGN KEY ("contract_type") REFERENCES "cp_contract_type_lookups"("code")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_contract_signatory_policies_signatory_id"
          FOREIGN KEY ("signatory_id") REFERENCES "cp_contract_signatories"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_signatory_policies_contract_type"
      ON "cp_contract_signatory_policies" ("contract_type")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_signatory_policies_signatory_id"
      ON "cp_contract_signatory_policies" ("signatory_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_signatory_policies_is_active"
      ON "cp_contract_signatory_policies" ("is_active")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_signatory_policy_contract_priority"
      ON "cp_contract_signatory_policies" ("contract_type", "priority", "is_active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_cp_contract_signatory_policy_contract_priority"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_signatory_policies_is_active"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_cp_contract_signatory_policies_signatory_id"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_cp_contract_signatory_policies_contract_type"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "cp_contract_signatory_policies"');
  }
}
