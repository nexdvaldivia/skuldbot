#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const paths = {
  studio: 'apps/studio/src/data/nodeTemplates.ts',
  compiler: 'services/engine/skuldbot/compiler/templates/main_v2.robot.j2',
  registry: 'services/engine/skuldbot/nodes/registry.py',
};

function readFileOrFail(relPath) {
  const absPath = path.join(repoRoot, relPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Missing required file: ${relPath}`);
  }
  return fs.readFileSync(absPath, 'utf8');
}

const contents = {
  studio: readFileOrFail(paths.studio),
  compiler: readFileOrFail(paths.compiler),
  registry: readFileOrFail(paths.registry),
};

function extractStudioNodeTypes(prefix) {
  const regex = new RegExp(`type:\\s*"(${escapeRegex(prefix)}[a-z0-9_]+)"`, 'g');
  return new Set(Array.from(contents.studio.matchAll(regex), (m) => m[1]));
}

function extractRegistryNodeTypes(prefix) {
  const regex = new RegExp(`node_type="(${escapeRegex(prefix)}[a-z0-9_]+)"`, 'g');
  return new Set(Array.from(contents.registry.matchAll(regex), (m) => m[1]));
}

function extractCompilerVariants(kind) {
  const equalRegex = new RegExp(`${kind}_type\\s*==\\s*'([a-z0-9_]+)'`, 'g');
  const inRegex = new RegExp(`${kind}_type\\s+in\\s+\\[([\\s\\S]*?)\\]`, 'g');
  const quotedRegex = /'([a-z0-9_]+)'/g;

  const variants = new Set(Array.from(contents.compiler.matchAll(equalRegex), (m) => m[1]));

  for (const inMatch of contents.compiler.matchAll(inRegex)) {
    for (const variant of inMatch[1].matchAll(quotedRegex)) {
      variants.add(variant[1]);
    }
  }

  return variants;
}

function withPrefix(prefix, values) {
  return new Set(Array.from(values, (v) => `${prefix}${v}`));
}

function setDiff(a, b) {
  return Array.from(a).filter((x) => !b.has(x)).sort();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compareAndReport(label, expected, actual) {
  const missing = setDiff(expected, actual);
  const extra = setDiff(actual, expected);
  const ok = missing.length === 0 && extra.length === 0;

  console.log(
    `${label}: expected=${expected.size} actual=${actual.size} missing=${missing.length} extra=${extra.length}`,
  );

  if (!ok) {
    console.error(`\n${label} mismatch`);
    console.error(`- missing: ${JSON.stringify(missing)}`);
    console.error(`- extra: ${JSON.stringify(extra)}`);
  }

  return ok;
}

const studioTaps = extractStudioNodeTypes('data.tap.');
const compilerTaps = withPrefix('data.tap.', extractCompilerVariants('tap'));
const registryTaps = extractRegistryNodeTypes('data.tap.');

const studioTargets = extractStudioNodeTypes('data.target.');
const compilerTargets = withPrefix('data.target.', extractCompilerVariants('target'));
const registryTargets = extractRegistryNodeTypes('data.target.');

const checks = [
  compareAndReport('studio vs compiler taps', studioTaps, compilerTaps),
  compareAndReport('studio vs registry taps', studioTaps, registryTaps),
  compareAndReport('studio vs compiler targets', studioTargets, compilerTargets),
  compareAndReport('studio vs registry targets', studioTargets, registryTargets),
];

if (checks.every(Boolean)) {
  console.log('\nSinger parity guardrail passed.');
  process.exit(0);
}

console.error('\nSinger parity guardrail failed.');
process.exit(1);
