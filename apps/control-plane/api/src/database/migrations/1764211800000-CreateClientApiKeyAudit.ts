import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateClientApiKeyAudit1764211800000 implements MigrationInterface {
  name = 'CreateClientApiKeyAudit1764211800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "client_api_key_audit" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "client_id" uuid NOT NULL,
        "old_key_prefix" character varying(32),
        "new_key_prefix" character varying(32) NOT NULL,
        "rotated_by" character varying(255) NOT NULL,
        "rotated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "rotated_from_ip" character varying(64),
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_client_api_key_audit_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "client_api_key_audit"
      ADD CONSTRAINT IF NOT EXISTS "FK_client_api_key_audit_client"
      FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_client_api_key_audit_client_rotated_at"
      ON "client_api_key_audit" ("client_id", "rotated_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_client_api_key_audit_client_rotated_at"');
    await queryRunner.query(`
      ALTER TABLE "client_api_key_audit"
      DROP CONSTRAINT IF EXISTS "FK_client_api_key_audit_client"
    `);
    await queryRunner.query('DROP TABLE IF EXISTS "client_api_key_audit"');
  }
}
