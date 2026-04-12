const LOCAL_ENVS = new Set(['development', 'local', 'test']);

function isLocalRuntime(nodeEnv: string): boolean {
  return LOCAL_ENVS.has(nodeEnv);
}

function isUnset(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

function isPlaceholder(value: string | undefined): boolean {
  if (isUnset(value)) {
    return true;
  }

  const normalized = (value ?? '').trim().toLowerCase();
  return (
    normalized.includes('change-this') ||
    normalized.includes('replace-with') ||
    normalized.includes('example.com') ||
    normalized === 'skuld' ||
    normalized === 'skuldbot' ||
    normalized === 'skuld-control-plane-jwt-secret-change-in-production' ||
    normalized === 'skuld-control-plane-refresh-secret-change-in-production'
  );
}

export function enforceEnvironmentPolicy(env: NodeJS.ProcessEnv): void {
  const nodeEnv = (env.NODE_ENV ?? 'development').toLowerCase();
  const allowDotenv = (env.ALLOW_DOTENV ?? 'false').toLowerCase() === 'true';

  if (isLocalRuntime(nodeEnv)) {
    return;
  }

  if (allowDotenv) {
    throw new Error(
      'Regulated policy violation: ALLOW_DOTENV=true is forbidden outside local/test runtimes.',
    );
  }

  const requiredKeys = [
    'DB_HOST',
    'DB_PORT',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_DATABASE',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'CP_PUBLIC_LEADS_SHARED_SECRET',
  ] as const;

  const missing = requiredKeys.filter((key) => isUnset(env[key]));
  if (missing.length > 0) {
    throw new Error(
      `Regulated policy violation: missing required environment keys: ${missing.join(', ')}`,
    );
  }

  const placeholderKeys = [
    'DB_USERNAME',
    'DB_PASSWORD',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'CP_PUBLIC_LEADS_SHARED_SECRET',
  ] as const;

  const insecure = placeholderKeys.filter((key) => isPlaceholder(env[key]));
  if (insecure.length > 0) {
    throw new Error(
      `Regulated policy violation: placeholder/unsafe values detected for: ${insecure.join(', ')}`,
    );
  }
}
