#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const failures = [];

function read(relPath) {
  const abs = path.join(repoRoot, relPath);
  if (!fs.existsSync(abs)) {
    failures.push(`Missing required file: ${relPath}`);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

const templatesPath = "apps/studio/src/data/nodeTemplates.ts";
const tokensPath = "apps/studio/src/lib/design-tokens.ts";

const templates = read(templatesPath);
const tokens = read(tokensPath);

function asSet(matches) {
  return new Set(matches);
}

const templateCategoryMatches = [...templates.matchAll(/\{\s*type:\s*"[^"]+",\s*category:\s*"([a-z0-9_]+)"/g)];
const templateCategories = asSet(templateCategoryMatches.map((m) => m[1]));

const categoryOrderBlock = tokens.match(/export const categoryOrder: NodeCategory\[] = \[([\s\S]*?)\];/);
const categoryOrder = asSet(
  categoryOrderBlock ? [...categoryOrderBlock[1].matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]) : [],
);

const categoryNamesBlock = tokens.match(/export const categoryNames: Record<NodeCategory, string> = \{([\s\S]*?)\};/);
const categoryNames = asSet(
  categoryNamesBlock ? [...categoryNamesBlock[1].matchAll(/^\s{2}([a-z0-9_]+):\s*"/gm)].map((m) => m[1]) : [],
);

const categoryIconsBlock = tokens.match(/export const categoryIcons: Record<NodeCategory, string> = \{([\s\S]*?)\};/);
const categoryIcons = asSet(
  categoryIconsBlock ? [...categoryIconsBlock[1].matchAll(/^\s{2}([a-z0-9_]+):\s*"/gm)].map((m) => m[1]) : [],
);

const categoryColorsBlock = tokens.match(/export const categoryColors: Record<NodeCategory, \{([\s\S]*?)\n\};/);
const categoryColors = asSet(
  categoryColorsBlock ? [...categoryColorsBlock[1].matchAll(/^\s{2}([a-z0-9_]+):\s*\{/gm)].map((m) => m[1]) : [],
);

const missingInOrder = [...templateCategories].filter((c) => !categoryOrder.has(c)).sort();
const missingInNames = [...templateCategories].filter((c) => !categoryNames.has(c)).sort();
const missingInIcons = [...templateCategories].filter((c) => !categoryIcons.has(c)).sort();
const missingInColors = [...templateCategories].filter((c) => !categoryColors.has(c)).sort();

if (missingInOrder.length > 0) {
  failures.push(`categoryOrder missing categories used by node templates: ${JSON.stringify(missingInOrder)}`);
}
if (missingInNames.length > 0) {
  failures.push(`categoryNames missing categories used by node templates: ${JSON.stringify(missingInNames)}`);
}
if (missingInIcons.length > 0) {
  failures.push(`categoryIcons missing categories used by node templates: ${JSON.stringify(missingInIcons)}`);
}
if (missingInColors.length > 0) {
  failures.push(`categoryColors missing categories used by node templates: ${JSON.stringify(missingInColors)}`);
}

const prefixExpected = {
  trigger: "trigger",
  web: "web",
  desktop: "desktop",
  storage: "storage",
  files: "files",
  excel: "excel",
  email: "email",
  api: "api",
  database: "database",
  document: "document",
  ai: "ai",
  vectordb: "vectordb",
  code: "code",
  python: "python",
  control: "control",
  logging: "logging",
  security: "security",
  human: "human",
  compliance: "compliance",
  dataquality: "dataquality",
  data: "data",
  bot: "bot",
  voice: "voice",
  insurance: "insurance",
  ms365: "ms365",
};

const nodeTypeMatches = [...templates.matchAll(/\{\s*type:\s*"([a-z0-9_.]+)",\s*category:\s*"([a-z0-9_]+)"/g)];
const mismatches = [];
for (const [, type, category] of nodeTypeMatches) {
  const prefix = type.split(".")[0];
  const expected = prefixExpected[prefix];
  if (expected && expected !== category) {
    mismatches.push({ type, category, expected });
  }
}

if (mismatches.length > 0) {
  failures.push(`node type prefix/category mismatches: ${JSON.stringify(mismatches.slice(0, 20))}`);
}

if (failures.length > 0) {
  console.error("Node category classification guardrails failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Node category classification guardrails passed (${templateCategories.size} categories, ${nodeTypeMatches.length} templates).`,
);
