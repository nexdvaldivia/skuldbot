import { enforceEnvironmentPolicy } from './environment-policy';

describe('enforceEnvironmentPolicy (orchestrator)', () => {
  it('allows local runtime with ALLOW_DOTENV=true', () => {
    expect(() =>
      enforceEnvironmentPolicy({
        NODE_ENV: 'development',
        ALLOW_DOTENV: 'true',
      }),
    ).not.toThrow();
  });

  it('rejects ALLOW_DOTENV=true outside local runtimes', () => {
    expect(() =>
      enforceEnvironmentPolicy({
        NODE_ENV: 'production',
        ALLOW_DOTENV: 'true',
      }),
    ).toThrow(/ALLOW_DOTENV=true is forbidden/i);
  });

  it('rejects missing required keys in production', () => {
    expect(() =>
      enforceEnvironmentPolicy({
        NODE_ENV: 'production',
        ALLOW_DOTENV: 'false',
      }),
    ).toThrow(/missing required environment keys/i);
  });

  it('rejects placeholder secrets in production', () => {
    expect(() =>
      enforceEnvironmentPolicy({
        NODE_ENV: 'production',
        ALLOW_DOTENV: 'false',
        DATABASE_HOST: 'db.internal',
        DATABASE_PORT: '5432',
        DATABASE_USER: 'skuldbot',
        DATABASE_PASSWORD: 'replace-with-real-secret',
        DATABASE_NAME: 'skuldbot_orchestrator',
        JWT_SECRET: 'change-me-in-production',
        ENCRYPTION_MASTER_KEY: 'replace-with-key',
      }),
    ).toThrow(/placeholder\/unsafe values detected/i);
  });
});
