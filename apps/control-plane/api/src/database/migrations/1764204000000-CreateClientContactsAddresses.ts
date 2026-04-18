import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateClientContactsAddresses1764204000000 implements MigrationInterface {
  name = 'CreateClientContactsAddresses1764204000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "client_contacts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "client_id" uuid NOT NULL,
        "contact_type" character varying(20) NOT NULL,
        "first_name" character varying(100) NOT NULL,
        "last_name" character varying(100) NOT NULL,
        "email" character varying(255) NOT NULL,
        "phone" character varying(50),
        "mobile" character varying(50),
        "job_title" character varying(100),
        "department" character varying(100),
        "linkedin_url" character varying(255),
        "is_primary" boolean NOT NULL DEFAULT false,
        "is_contract_signer" boolean NOT NULL DEFAULT false,
        "is_installer" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "can_receive_marketing" boolean NOT NULL DEFAULT true,
        "can_receive_updates" boolean NOT NULL DEFAULT true,
        "preferred_language" character varying(10) DEFAULT 'en',
        "notes" text,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_client_contacts_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_client_contacts_client"
          FOREIGN KEY ("client_id")
          REFERENCES "clients"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "client_addresses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "client_id" uuid NOT NULL,
        "address_type" character varying(20) NOT NULL,
        "label" character varying(100),
        "address_line1" character varying(255) NOT NULL,
        "address_line2" character varying(255),
        "city" character varying(100) NOT NULL,
        "state_province" character varying(100),
        "postal_code" character varying(20),
        "country" character varying(100) NOT NULL,
        "is_primary" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "notes" text,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_client_addresses_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_client_addresses_client"
          FOREIGN KEY ("client_id")
          REFERENCES "clients"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_client_contacts_client_type_active"
      ON "client_contacts" ("client_id", "contact_type", "is_active")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_client_contacts_client_deleted"
      ON "client_contacts" ("client_id", "deleted_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_client_contacts_email"
      ON "client_contacts" ("email")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_client_addresses_client_type_active"
      ON "client_addresses" ("client_id", "address_type", "is_active")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_client_addresses_client_deleted"
      ON "client_addresses" ("client_id", "deleted_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_client_addresses_country"
      ON "client_addresses" ("country")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_client_addresses_country"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_client_addresses_client_deleted"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_client_addresses_client_type_active"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_client_contacts_email"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_client_contacts_client_deleted"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_client_contacts_client_type_active"');

    await queryRunner.query('DROP TABLE IF EXISTS "client_addresses"');
    await queryRunner.query('DROP TABLE IF EXISTS "client_contacts"');
  }
}
