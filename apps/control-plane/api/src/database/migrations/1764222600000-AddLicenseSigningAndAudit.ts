import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLicenseSigningAndAudit1764222600000 implements MigrationInterface {
  name = 'AddLicenseSigningAndAudit1764222600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "licenses"
      ADD COLUMN IF NOT EXISTS "signature_algorithm" varchar(30) NOT NULL DEFAULT 'ed25519'
    `);
    await queryRunner.query(`
      ALTER TABLE "licenses"
      ADD COLUMN IF NOT EXISTS "public_key_id" varchar(120)
    `);
    await queryRunner.query(`
      ALTER TABLE "licenses"
      ADD COLUMN IF NOT EXISTS "signature" text
    `);
    await queryRunner.query(`
      ALTER TABLE "licenses"
      ADD COLUMN IF NOT EXISTS "first_activated_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "licenses"
      ADD COLUMN IF NOT EXISTS "validation_count" int NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "licenses"
      ADD COLUMN IF NOT EXISTS "grace_period_days" int NOT NULL DEFAULT 30
    `);
    await queryRunner.query(`
      ALTER TABLE "licenses"
      ADD COLUMN IF NOT EXISTS "grace_period_ends_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "license_audit" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "license_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "action" varchar(80) NOT NULL,
        "ip_address" varchar(120),
        "user_agent" varchar(500),
        "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_license_audit_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "license_audit"
      ADD CONSTRAINT IF NOT EXISTS "FK_license_audit_license"
      FOREIGN KEY ("license_id")
      REFERENCES "licenses"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_license_audit_license_created"
      ON "license_audit" ("license_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_license_audit_tenant_created"
      ON "license_audit" ("tenant_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_license_audit_tenant_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_license_audit_license_created"`,
    );
    await queryRunner.query(`
      ALTER TABLE "license_audit"
      DROP CONSTRAINT IF EXISTS "FK_license_audit_license"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "license_audit"`);
    await queryRunner.query(
      `ALTER TABLE "licenses" DROP COLUMN IF EXISTS "grace_period_ends_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "licenses" DROP COLUMN IF EXISTS "grace_period_days"`,
    );
    await queryRunner.query(
      `ALTER TABLE "licenses" DROP COLUMN IF EXISTS "validation_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "licenses" DROP COLUMN IF EXISTS "first_activated_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "licenses" DROP COLUMN IF EXISTS "signature"`,
    );
    await queryRunner.query(
      `ALTER TABLE "licenses" DROP COLUMN IF EXISTS "public_key_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "licenses" DROP COLUMN IF EXISTS "signature_algorithm"`,
    );
  }
}
