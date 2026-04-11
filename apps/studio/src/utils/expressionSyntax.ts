import type { FlowNode } from "../types/flow";

type Primitive = string | number | boolean | null | undefined;

interface ExpressionNormalizationIndex {
  knownNodeIds: Set<string>;
  nodeIdByLabelExact: Map<string, string>;
  nodeIdByLabelLower: Map<string, string>;
}

interface ExpressionNormalizationContext {
  currentNodeId: string;
  index: ExpressionNormalizationIndex;
}

function unescapeQuoted(value: string): string {
  return value.replace(/\\(["'\\])/g, "$1");
}

function isIdentifier(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(token);
}

function parsePathTokens(path: string): string[] | null {
  const tokens: string[] = [];
  let i = 0;

  while (i < path.length) {
    const ch = path[i];

    if (ch === ".") {
      i += 1;
      continue;
    }

    if (ch === "[") {
      const end = path.indexOf("]", i + 1);
      if (end === -1) return null;

      const raw = path.slice(i + 1, end).trim();
      if (!raw) return null;

      let token = raw;
      const startsWithQuote =
        (raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'"));
      if (startsWithQuote && raw.length >= 2) {
        token = unescapeQuoted(raw.slice(1, -1));
      }
      if (!token) return null;

      tokens.push(token);
      i = end + 1;
      continue;
    }

    let j = i;
    while (j < path.length && path[j] !== "." && path[j] !== "[") {
      j += 1;
    }
    const token = path.slice(i, j).trim();
    if (!token) return null;

    tokens.push(token);
    i = j;
  }

  return tokens;
}

function tokensToCanonicalPath(tokens: string[]): string {
  let out = "";
  tokens.forEach((token, idx) => {
    if (idx === 0 && isIdentifier(token)) {
      out += token;
      return;
    }
    if (isIdentifier(token)) {
      out += `.${token}`;
      return;
    }
    out += `[${token}]`;
  });
  return out;
}

function normalizeJsPath(path: string | undefined): string | null {
  if (!path || !path.trim()) return "";
  const tokens = parsePathTokens(path.trim());
  if (!tokens) return null;
  return tokensToCanonicalPath(tokens);
}

function resolveNodeId(nodeRef: string, ctx: ExpressionNormalizationContext): string | null {
  const ref = unescapeQuoted(nodeRef.trim());
  if (!ref) return null;

  if (ctx.index.knownNodeIds.has(ref)) return ref;

  const byExact = ctx.index.nodeIdByLabelExact.get(ref);
  if (byExact) return byExact;

  const byLower = ctx.index.nodeIdByLabelLower.get(ref.toLowerCase());
  if (byLower) return byLower;

  return null;
}

function normalizeSingleN8nExpression(
  expressionBody: string,
  ctx: ExpressionNormalizationContext
): string | null {
  const body = expressionBody.trim();
  if (!body.startsWith("$")) return null;

  const jsonMatch = body.match(/^\$json(?<path>(?:\.|\[).*)?$/);
  if (jsonMatch) {
    const normalizedPath = normalizeJsPath(jsonMatch.groups?.path);
    if (normalizedPath === null) return null;
    const path = normalizedPath ? `input.${normalizedPath}` : "input";
    return `\${node:${ctx.currentNodeId}|${path}}`;
  }

  const binaryMatch = body.match(/^\$binary(?<path>(?:\.|\[).*)?$/);
  if (binaryMatch) {
    const normalizedPath = normalizeJsPath(binaryMatch.groups?.path);
    if (normalizedPath === null) return null;
    const path = normalizedPath ? `inputBinary.${normalizedPath}` : "inputBinary";
    return `\${node:${ctx.currentNodeId}|${path}}`;
  }

  const inputJsonMatch = body.match(/^\$input(?:\.item)?\.json(?<path>(?:\.|\[).*)?$/);
  if (inputJsonMatch) {
    const normalizedPath = normalizeJsPath(inputJsonMatch.groups?.path);
    if (normalizedPath === null) return null;
    const path = normalizedPath ? `input.${normalizedPath}` : "input";
    return `\${node:${ctx.currentNodeId}|${path}}`;
  }

  const nodeMatch = body.match(/^\$node\[(["'])(?<node>.+?)\1\](?<path>(?:\.|\[).*)$/);
  if (nodeMatch?.groups?.node) {
    const resolvedNodeId = resolveNodeId(nodeMatch.groups.node, ctx);
    if (!resolvedNodeId) return null;

    const normalizedPath = normalizeJsPath(nodeMatch.groups.path);
    if (normalizedPath === null || !normalizedPath) return null;
    return `\${node:${resolvedNodeId}|${normalizedPath}}`;
  }

  const envMatch = body.match(/^\$env\.([A-Za-z_][A-Za-z0-9_]*)$/);
  if (envMatch) {
    return `\${env.${envMatch[1]}}`;
  }

  const vaultMatch = body.match(/^\$vault\.([A-Za-z_][A-Za-z0-9_]*)$/);
  if (vaultMatch) {
    return `\${vault.${vaultMatch[1]}}`;
  }

  return null;
}

export function buildExpressionNormalizationIndex(nodes: FlowNode[]): ExpressionNormalizationIndex {
  const knownNodeIds = new Set<string>();
  const nodeIdByLabelExact = new Map<string, string>();
  const nodeIdByLabelLower = new Map<string, string>();

  nodes.forEach((node) => {
    knownNodeIds.add(node.id);
    const label = node.data?.label?.trim();
    if (!label) return;

    if (!nodeIdByLabelExact.has(label)) {
      nodeIdByLabelExact.set(label, node.id);
    }
    const lower = label.toLowerCase();
    if (!nodeIdByLabelLower.has(lower)) {
      nodeIdByLabelLower.set(lower, node.id);
    }
  });

  return { knownNodeIds, nodeIdByLabelExact, nodeIdByLabelLower };
}

function createContext(
  index: ExpressionNormalizationIndex,
  currentNodeId: string
): ExpressionNormalizationContext {
  return { currentNodeId, index };
}

export function normalizeN8nExpressionsInText(
  text: string,
  index: ExpressionNormalizationIndex,
  currentNodeId: string
): string {
  if (!text.includes("{{")) return text;

  const ctx = createContext(index, currentNodeId);
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_full, body: string) => {
    const normalized = normalizeSingleN8nExpression(body, ctx);
    return normalized ?? `{{${body}}}`;
  });
}

export function normalizeN8nExpressionsInValue<T>(
  value: T,
  index: ExpressionNormalizationIndex,
  currentNodeId: string
): T {
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return normalizeN8nExpressionsInText(value, index, currentNodeId) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      normalizeN8nExpressionsInValue(item, index, currentNodeId)
    ) as T;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, Primitive | unknown>;
    const out: Record<string, Primitive | unknown> = {};
    Object.entries(obj).forEach(([key, nested]) => {
      out[key] = normalizeN8nExpressionsInValue(nested, index, currentNodeId);
    });
    return out as T;
  }

  return value;
}
