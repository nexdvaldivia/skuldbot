import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientApiKeyHash1764211200000 implements MigrationInterface {
  name = 'AddClientApiKeyHash1764211200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clients"
      ADD COLUMN IF NOT EXISTS "api_key_hash" character varying(64)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_clients_api_key_hash_unique"
      ON "clients" ("api_key_hash")
      WHERE api_key_hash IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_clients_api_key_hash_unique"');

    await queryRunner.query(`
      ALTER TABLE "clients"
      DROP COLUMN IF EXISTS "api_key_hash"
    `);
  }
}
