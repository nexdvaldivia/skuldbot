import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateClientContacts1765461000000 implements MigrationInterface {
  name = 'CreateClientContacts1765461000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_client_contacts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "client_id" uuid NOT NULL,
        "full_name" character varying(180) NOT NULL,
        "email" character varying(180) NOT NULL,
        "phone" character varying(60),
        "title" character varying(180),
        "department" character varying(120),
        "role_codes" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "is_primary" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_client_contacts_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_cp_client_contacts_client_email" UNIQUE ("client_id", "email"),
        CONSTRAINT "FK_cp_client_contacts_client_id"
          FOREIGN KEY ("client_id") REFERENCES "clients"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_client_contacts_client_id"
      ON "cp_client_contacts" ("client_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_client_contacts_email"
      ON "cp_client_contacts" ("email")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_client_contacts_is_primary"
      ON "cp_client_contacts" ("is_primary")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_client_contacts_is_primary"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_client_contacts_email"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_client_contacts_client_id"');
    await queryRunner.query('DROP TABLE IF EXISTS "cp_client_contacts"');
  }
}
