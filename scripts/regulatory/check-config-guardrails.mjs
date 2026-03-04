#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const failures = [];

function read(relPath) {
  const abs = path.join(repoRoot, relPath);
  if (!fs.existsSync(abs)) {
    failures.push(`Missing required file: ${relPath}`);
    return '';
  }
  return fs.readFileSync(abs, 'utf8');
}

function requireMatch(content, relPath, regex, message) {
  if (!regex.test(content)) {
    failures.push(`${relPath}: ${message}`);
  }
}

function forbidMatch(content, relPath, regex, message) {
  if (regex.test(content)) {
    failures.push(`${relPath}: ${message}`);
  }
}

const cpAppModulePath = 'control-plane/api/src/app.module.ts';
const cpTypeormPath = 'control-plane/api/src/database/typeorm-options.ts';
const cpEnvExamplePath = 'control-plane/api/.env.example';

const orAppModulePath = 'orchestrator/api/src/app.module.ts';
const orTypeormPath = 'orchestrator/api/src/database/typeorm-options.ts';
const orConfigPath = 'orchestrator/api/src/config/configuration.ts';
const orEnvExamplePath = 'orchestrator/api/.env.example';

const cpAppModule = read(cpAppModulePath);
const cpTypeorm = read(cpTypeormPath);
const cpEnvExample = read(cpEnvExamplePath);

const orAppModule = read(orAppModulePath);
const orTypeorm = read(orTypeormPath);
const orConfig = read(orConfigPath);
const orEnvExample = read(orEnvExamplePath);

requireMatch(
  cpAppModule,
  cpAppModulePath,
  /enforceEnvironmentPolicy\(process\.env\)/,
  'must call enforceEnvironmentPolicy(process.env) at module bootstrap.',
);
requireMatch(
  orAppModule,
  orAppModulePath,
  /enforceEnvironmentPolicy\(process\.env\)/,
  'must call enforceEnvironmentPolicy(process.env) at module bootstrap.',
);

requireMatch(
  cpAppModule,
  cpAppModulePath,
  /ignoreEnvFile:\s*process\.env\.ALLOW_DOTENV\s*!==\s*'true'/,
  'must gate dotenv loading with ALLOW_DOTENV.',
);
requireMatch(
  orAppModule,
  orAppModulePath,
  /ignoreEnvFile:\s*process\.env\.ALLOW_DOTENV\s*!==\s*'true'/,
  'must gate dotenv loading with ALLOW_DOTENV.',
);

forbidMatch(
  cpTypeorm,
  cpTypeormPath,
  /DB_USERNAME\s*\?\?|DB_PASSWORD\s*\?\?|DB_DATABASE\s*\?\?/,
  'must not use fallback defaults for DB credentials/database.',
);
forbidMatch(
  cpTypeorm,
  cpTypeormPath,
  /['"]skuld['"]|['"]skuldbot['"]/,
  'must not contain hardcoded DB credential defaults.',
);
requireMatch(
  cpTypeorm,
  cpTypeormPath,
  /requireEnv\(env,\s*'DB_USERNAME'\)/,
  'must require DB_USERNAME via requireEnv.',
);
requireMatch(
  cpTypeorm,
  cpTypeormPath,
  /requireEnv\(env,\s*'DB_PASSWORD'/,
  'must require DB_PASSWORD via requireEnv.',
);

forbidMatch(
  orTypeorm,
  orTypeormPath,
  /DATABASE_USER\s*\?\?|DATABASE_PASSWORD\s*\?\?|DATABASE_NAME\s*\?\?/,
  'must not use fallback defaults for DB credentials/database.',
);
forbidMatch(
  orTypeorm,
  orTypeormPath,
  /['"]skuldbot['"]/,
  'must not contain hardcoded DB credential defaults.',
);
requireMatch(
  orTypeorm,
  orTypeormPath,
  /requireEnv\(env,\s*'DATABASE_USER'\)/,
  'must require DATABASE_USER via requireEnv.',
);
requireMatch(
  orTypeorm,
  orTypeormPath,
  /requireEnv\(env,\s*'DATABASE_PASSWORD'/,
  'must require DATABASE_PASSWORD via requireEnv.',
);

forbidMatch(
  orConfig,
  orConfigPath,
  /DATABASE_USER\s*\|\||DATABASE_PASSWORD\s*\|\||JWT_SECRET\s*\|\|/,
  'must not use fallback defaults for sensitive settings.',
);

requireMatch(
  cpEnvExample,
  cpEnvExamplePath,
  /ALLOW_DOTENV=false/,
  'must document ALLOW_DOTENV=false in regulated policy section.',
);
requireMatch(
  orEnvExample,
  orEnvExamplePath,
  /ALLOW_DOTENV=false/,
  'must document ALLOW_DOTENV=false in regulated policy section.',
);

if (failures.length > 0) {
  console.error('Regulatory config guardrails failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Regulatory config guardrails passed.');

