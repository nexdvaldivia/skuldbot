import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePartnerTypesAndOnboardingStates1765800000000 implements MigrationInterface {
  name = 'CreatePartnerTypesAndOnboardingStates1765800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "partner_types" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(100) NOT NULL,
        "slug" character varying(50) NOT NULL,
        "description" character varying(500),
        "color" character varying(20) DEFAULT '#3b82f6',
        "icon" character varying(50),
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_partner_types_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_partner_types_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_partner_types_active_sort"
      ON "partner_types" ("isActive", "sortOrder")
    `);

    await queryRunner.query(`
      ALTER TABLE "partners"
      ADD COLUMN IF NOT EXISTS "partnerTypeId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "partners"
      ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "partners"
      ADD COLUMN IF NOT EXISTS "reviewedBy" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "partners"
      ADD COLUMN IF NOT EXISTS "reviewNotes" text
    `);
    await queryRunner.query(`
      ALTER TABLE "partners"
      ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "partners"
      ADD COLUMN IF NOT EXISTS "rejectedBy" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "partners"
      ADD COLUMN IF NOT EXISTS "rejectionReason" text
    `);
    await queryRunner.query(`
      ALTER TABLE "partners"
      ADD COLUMN IF NOT EXISTS "activatedAt" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "partners"
      ADD COLUMN IF NOT EXISTS "activatedBy" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "partners"
      ADD COLUMN IF NOT EXISTS "suspendedBy" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "partners"
      ADD COLUMN IF NOT EXISTS "terminatedAt" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "partners"
      ADD COLUMN IF NOT EXISTS "terminatedBy" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "partners"
      ADD COLUMN IF NOT EXISTS "terminationReason" text
    `);
    await queryRunner.query(`
      ALTER TABLE "partners"
      ADD COLUMN IF NOT EXISTS "sortOrder" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_partners_partner_type_id"
      ON "partners" ("partnerTypeId")
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_partners_partner_type'
        ) THEN
          ALTER TABLE "partners"
          ADD CONSTRAINT "FK_partners_partner_type"
          FOREIGN KEY ("partnerTypeId")
          REFERENCES "partner_types"("id")
          ON DELETE SET NULL
          ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      INSERT INTO "cp_partner_status_lookups" ("code", "name", "description", "sortOrder", "isActive")
      VALUES ('active', 'Active', 'Active partner account', 25, true)
      ON CONFLICT ("code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "cp_partner_status_lookups"
      WHERE "code" = 'active'
    `);

    await queryRunner.query(`
      ALTER TABLE "partners"
      DROP CONSTRAINT IF EXISTS "FK_partners_partner_type"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_partners_partner_type_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "partners" DROP COLUMN IF EXISTS "terminationReason"
    `);
    await queryRunner.query(`
      ALTER TABLE "partners" DROP COLUMN IF EXISTS "terminatedBy"
    `);
    await queryRunner.query(`
      ALTER TABLE "partners" DROP COLUMN IF EXISTS "terminatedAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "partners" DROP COLUMN IF EXISTS "sortOrder"
    `);
    await queryRunner.query(`
      ALTER TABLE "partners" DROP COLUMN IF EXISTS "suspendedBy"
    `);
    await queryRunner.query(`
      ALTER TABLE "partners" DROP COLUMN IF EXISTS "activatedBy"
    `);
    await queryRunner.query(`
      ALTER TABLE "partners" DROP COLUMN IF EXISTS "activatedAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "partners" DROP COLUMN IF EXISTS "rejectionReason"
    `);
    await queryRunner.query(`
      ALTER TABLE "partners" DROP COLUMN IF EXISTS "rejectedBy"
    `);
    await queryRunner.query(`
      ALTER TABLE "partners" DROP COLUMN IF EXISTS "rejectedAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "partners" DROP COLUMN IF EXISTS "reviewNotes"
    `);
    await queryRunner.query(`
      ALTER TABLE "partners" DROP COLUMN IF EXISTS "reviewedBy"
    `);
    await queryRunner.query(`
      ALTER TABLE "partners" DROP COLUMN IF EXISTS "reviewedAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "partners" DROP COLUMN IF EXISTS "partnerTypeId"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_partner_types_active_sort"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "partner_types"
    `);
  }
}
