import { enforceEnvironmentPolicy } from './environment-policy';

describe('enforceEnvironmentPolicy (control-plane)', () => {
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
        DB_HOST: 'db.internal',
        DB_PORT: '5432',
        DB_USERNAME: 'skuld',
        DB_PASSWORD: 'replace-with-real-secret',
        DB_DATABASE: 'skuld_controlplane',
        JWT_SECRET: 'change-this-secret-in-production',
        JWT_REFRESH_SECRET: 'change-this-refresh-secret-in-production',
        CP_PUBLIC_LEADS_SHARED_SECRET: 'replace-with-secret',
      }),
    ).toThrow(/placeholder\/unsafe values detected/i);
  });
});

