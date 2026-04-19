import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAvatarColumns1764215400000 implements MigrationInterface {
  name = 'AddUserAvatarColumns1764215400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS avatar_storage_key VARCHAR(255),
      ADD COLUMN IF NOT EXISTS avatar_content_type VARCHAR(120),
      ADD COLUMN IF NOT EXISTS avatar_sha256 VARCHAR(64),
      ADD COLUMN IF NOT EXISTS avatar_uploaded_at TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS avatar_uploaded_at,
      DROP COLUMN IF EXISTS avatar_sha256,
      DROP COLUMN IF EXISTS avatar_content_type,
      DROP COLUMN IF EXISTS avatar_storage_key
    `);
  }
}
