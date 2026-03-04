#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const sourceRoots = [
  'control-plane/api/src',
  'orchestrator/api/src',
  'control-plane/ui/src',
  'orchestrator/ui/src',
];

const ignoredDirNames = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  'target',
]);

const testFilePattern = /\.(spec|test)\.[tj]sx?$/i;
const findings = [];

const rules = [
  {
    id: 'NO_RUNTIME_MOCK_MARKERS',
    description:
      'Runtime source cannot include mock/fake/stub markers. Use fail-fast behavior instead.',
    regex: /\b(mock|mocks|mocked|fake|stub)\b/i,
  },
  {
    id: 'NO_SENSITIVE_ENV_FALLBACK_DEFAULTS',
    description:
      'Sensitive process.env keys cannot use literal fallback defaults.',
    regex:
      /process\.env\.[A-Z0-9_]*(SECRET|PASSWORD|TOKEN|KEY|DB_USERNAME|DB_PASSWORD|DATABASE_USER|DATABASE_PASSWORD)[A-Z0-9_]*\s*(\|\||\?\?)\s*['"`][^'"`]+['"`]/,
  },
];

function shouldSkipFile(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  if (testFilePattern.test(normalized)) {
    return true;
  }
  return normalized.includes('/__tests__/') || normalized.includes('/test/');
}

function walkFiles(absDir, relPrefix = '') {
  if (!fs.existsSync(absDir)) {
    return [];
  }

  const files = [];
  const entries = fs.readdirSync(absDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    if (ignoredDirNames.has(entry.name)) {
      continue;
    }

    const absPath = path.join(absDir, entry.name);
    const relPath = path.join(relPrefix, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkFiles(absPath, relPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(relPath);
    }
  }

  return files;
}

for (const sourceRoot of sourceRoots) {
  const absRoot = path.join(repoRoot, sourceRoot);
  const files = walkFiles(absRoot, sourceRoot);

  for (const relPath of files) {
    if (shouldSkipFile(relPath)) {
      continue;
    }

    const absPath = path.join(repoRoot, relPath);
    const content = fs.readFileSync(absPath, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const rule of rules) {
        if (!rule.regex.test(line)) {
          continue;
        }

        findings.push({
          file: relPath,
          line: index + 1,
          rule: rule.id,
          description: rule.description,
          snippet: line.trim(),
        });
      }
    });
  }
}

if (findings.length > 0) {
  console.error('Work control violations found:');
  for (const finding of findings) {
    console.error(
      `- [${finding.rule}] ${finding.file}:${finding.line} :: ${finding.description}`,
    );
    console.error(`  > ${finding.snippet}`);
  }
  process.exit(1);
}

console.log('Work controls passed.');

