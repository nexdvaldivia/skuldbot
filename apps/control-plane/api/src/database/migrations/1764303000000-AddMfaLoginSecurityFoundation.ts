import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMfaLoginSecurityFoundation1764303000000 implements MigrationInterface {
  name = 'AddMfaLoginSecurityFoundation1764303000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "mfa_backup_codes" jsonb,
      ADD COLUMN IF NOT EXISTS "last_login_ip" character varying(64),
      ADD COLUMN IF NOT EXISTS "login_count" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "locked_until" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_user_login_history" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "ip" character varying(64) NOT NULL,
        "user_agent" character varying(512),
        "success" boolean NOT NULL DEFAULT false,
        "failure_reason" character varying(120),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_user_login_history_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cp_user_login_history_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_user_password_history" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_user_password_history_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cp_user_password_history_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_user_login_history_user_id_created_at"
      ON "cp_user_login_history" ("user_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_user_password_history_user_id_created_at"
      ON "cp_user_password_history" ("user_id", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_user_password_history_user_id_created_at"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_user_login_history_user_id_created_at"');

    await queryRunner.query('DROP TABLE IF EXISTS "cp_user_password_history"');
    await queryRunner.query('DROP TABLE IF EXISTS "cp_user_login_history"');

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "locked_until",
      DROP COLUMN IF EXISTS "failed_login_attempts",
      DROP COLUMN IF EXISTS "password_changed_at",
      DROP COLUMN IF EXISTS "login_count",
      DROP COLUMN IF EXISTS "last_login_ip",
      DROP COLUMN IF EXISTS "mfa_backup_codes"
    `);
  }
}
