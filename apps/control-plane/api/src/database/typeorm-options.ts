import * as path from 'path';
import { DataSourceOptions } from 'typeorm';
import { databaseEntities } from './entities';

function isTrue(value: string | undefined): boolean {
  return (value ?? '').toLowerCase() === 'true';
}

function isLocalRuntime(nodeEnv: string): boolean {
  return nodeEnv === 'development' || nodeEnv === 'local' || nodeEnv === 'test';
}

function requireEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  options?: { allowEmpty?: boolean },
): string {
  const value = env[key];
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  if (!options?.allowEmpty && value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function buildTypeOrmOptions(env: NodeJS.ProcessEnv): DataSourceOptions {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const synchronize = isTrue(env.DB_SYNCHRONIZE) && isLocalRuntime(nodeEnv);

  return {
    type: 'postgres',
    host: requireEnv(env, 'DB_HOST'),
    port: Number.parseInt(requireEnv(env, 'DB_PORT'), 10),
    username: requireEnv(env, 'DB_USERNAME'),
    password: requireEnv(env, 'DB_PASSWORD', { allowEmpty: true }),
    database: requireEnv(env, 'DB_DATABASE'),
    entities: databaseEntities,
    migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
    synchronize,
    logging: nodeEnv === 'development',
  };
}
