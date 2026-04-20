import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContractRenewalRequirements1765580000000 implements MigrationInterface {
  name = 'CreateContractRenewalRequirements1765580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_contract_renewal_requirements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "client_id" uuid NOT NULL,
        "subscription_id" uuid,
        "old_acceptance_id" uuid,
        "new_template_version_id" uuid NOT NULL,
        "notified_at" TIMESTAMP WITH TIME ZONE,
        "notification_email" character varying(255),
        "reminder_sent_at" TIMESTAMP WITH TIME ZONE,
        "reminder_days_before" integer NOT NULL DEFAULT 5,
        "deadline" TIMESTAMP WITH TIME ZONE NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "accepted_at" TIMESTAMP WITH TIME ZONE,
        "new_acceptance_id" uuid,
        "renewal_blocked" boolean NOT NULL DEFAULT false,
        "blocked_at" TIMESTAMP WITH TIME ZONE,
        "blocked_reason" character varying(100),
        "waived_at" TIMESTAMP WITH TIME ZONE,
        "waived_by_user_id" uuid,
        "waiver_reason" text,
        "notes" text,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_contract_renewal_requirements" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_renewal_requirements_client_status"
      ON "cp_contract_renewal_requirements" ("client_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_renewal_requirements_deadline_status"
      ON "cp_contract_renewal_requirements" ("deadline", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_contract_renewal_requirements_template_status"
      ON "cp_contract_renewal_requirements" ("new_template_version_id", "status")
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_cp_contract_renewal_requirements_client'
        ) THEN
          ALTER TABLE "cp_contract_renewal_requirements"
          ADD CONSTRAINT "FK_cp_contract_renewal_requirements_client"
          FOREIGN KEY ("client_id")
          REFERENCES "clients"("id")
          ON DELETE CASCADE
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
          WHERE conname = 'FK_cp_contract_renewal_requirements_subscription'
        ) THEN
          ALTER TABLE "cp_contract_renewal_requirements"
          ADD CONSTRAINT "FK_cp_contract_renewal_requirements_subscription"
          FOREIGN KEY ("subscription_id")
          REFERENCES "subscriptions"("id")
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
          WHERE conname = 'FK_cp_contract_renewal_requirements_old_acceptance'
        ) THEN
          ALTER TABLE "cp_contract_renewal_requirements"
          ADD CONSTRAINT "FK_cp_contract_renewal_requirements_old_acceptance"
          FOREIGN KEY ("old_acceptance_id")
          REFERENCES "cp_contract_acceptances"("id")
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
          WHERE conname = 'FK_cp_contract_renewal_requirements_new_template_version'
        ) THEN
          ALTER TABLE "cp_contract_renewal_requirements"
          ADD CONSTRAINT "FK_cp_contract_renewal_requirements_new_template_version"
          FOREIGN KEY ("new_template_version_id")
          REFERENCES "cp_contract_template_versions"("id")
          ON DELETE CASCADE
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
          WHERE conname = 'FK_cp_contract_renewal_requirements_new_acceptance'
        ) THEN
          ALTER TABLE "cp_contract_renewal_requirements"
          ADD CONSTRAINT "FK_cp_contract_renewal_requirements_new_acceptance"
          FOREIGN KEY ("new_acceptance_id")
          REFERENCES "cp_contract_acceptances"("id")
          ON DELETE SET NULL
          ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cp_contract_renewal_requirements" DROP CONSTRAINT IF EXISTS "FK_cp_contract_renewal_requirements_new_acceptance"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cp_contract_renewal_requirements" DROP CONSTRAINT IF EXISTS "FK_cp_contract_renewal_requirements_new_template_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cp_contract_renewal_requirements" DROP CONSTRAINT IF EXISTS "FK_cp_contract_renewal_requirements_old_acceptance"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cp_contract_renewal_requirements" DROP CONSTRAINT IF EXISTS "FK_cp_contract_renewal_requirements_subscription"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cp_contract_renewal_requirements" DROP CONSTRAINT IF EXISTS "FK_cp_contract_renewal_requirements_client"`,
    );

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_renewal_requirements_template_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_renewal_requirements_deadline_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_contract_renewal_requirements_client_status"');

    await queryRunner.query('DROP TABLE IF EXISTS "cp_contract_renewal_requirements"');
  }
}
