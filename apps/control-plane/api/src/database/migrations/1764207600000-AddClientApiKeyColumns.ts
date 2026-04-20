import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientApiKeyColumns1764207600000 implements MigrationInterface {
  name = 'AddClientApiKeyColumns1764207600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clients"
      ADD COLUMN IF NOT EXISTS "api_key" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "clients"
      ADD COLUMN IF NOT EXISTS "api_key_rotated_at" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_clients_api_key_unique"
      ON "clients" ("api_key")
      WHERE api_key IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_clients_api_key_unique"');
    await queryRunner.query(`
      ALTER TABLE "clients"
      DROP COLUMN IF EXISTS "api_key_rotated_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "clients"
      DROP COLUMN IF EXISTS "api_key"
    `);
  }
}
