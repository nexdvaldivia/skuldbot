import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  decryptSecretAes256Gcm,
  encryptSecretAes256Gcm,
  hashSecretSha256,
  isEncryptedSecret,
} from '../../common/utils/secret-crypto.util';

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

    const seedConfig = this.resolveSeedConfig(process.env);
    const rows = (await queryRunner.query(`
      SELECT id, api_key, api_key_hash
      FROM "clients"
      WHERE api_key IS NOT NULL
    `)) as Array<{ id: string; api_key: string; api_key_hash: string | null }>;

    for (const row of rows) {
      const plaintext = this.tryResolvePlaintext(row.api_key, seedConfig.candidates);
      if (!plaintext) {
        throw new Error(
          `Unable to resolve plaintext client api_key for client ${row.id}; aborting migration to avoid insecure fallback.`,
        );
      }

      const encrypted = encryptSecretAes256Gcm(plaintext, seedConfig.primary);
      const hash = hashSecretSha256(plaintext);

      await queryRunner.query(
        `
          UPDATE "clients"
          SET "api_key" = $1, "api_key_hash" = $2
          WHERE "id" = $3
        `,
        [encrypted, hash, row.id],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_clients_api_key_hash_unique"');

    await queryRunner.query(`
      ALTER TABLE "clients"
      DROP COLUMN IF EXISTS "api_key_hash"
    `);
  }

  private resolveSeedConfig(env: NodeJS.ProcessEnv): { primary: string; candidates: string[] } {
    const blockedDefaults = new Set(['change-this-secret', 'changeme', 'default-secret', 'secret']);
    const isSecure = (value: string | null | undefined): value is string => {
      if (typeof value !== 'string') {
        return false;
      }
      const normalized = value.trim();
      return normalized.length > 0 && !blockedDefaults.has(normalized.toLowerCase());
    };

    const primary =
      env.CLIENT_API_KEY_ENCRYPTION_KEY_PRIMARY ??
      env.CLIENT_API_KEY_ENCRYPTION_KEY ??
      env.JWT_SECRET;
    const secondary = env.CLIENT_API_KEY_ENCRYPTION_KEY_SECONDARY ?? null;

    if (!isSecure(primary)) {
      throw new Error(
        'Migration requires CLIENT_API_KEY_ENCRYPTION_KEY_PRIMARY (or CLIENT_API_KEY_ENCRYPTION_KEY/JWT_SECRET) with a secure value.',
      );
    }

    const candidates = new Set<string>([primary]);
    if (isSecure(secondary)) {
      candidates.add(secondary);
    }

    return {
      primary,
      candidates: [...candidates],
    };
  }

  private tryResolvePlaintext(apiKeyValue: string, candidates: string[]): string | null {
    if (!isEncryptedSecret(apiKeyValue)) {
      return apiKeyValue;
    }

    for (const seed of candidates) {
      try {
        return decryptSecretAes256Gcm(apiKeyValue, seed);
      } catch {
        continue;
      }
    }

    return null;
  }
}
