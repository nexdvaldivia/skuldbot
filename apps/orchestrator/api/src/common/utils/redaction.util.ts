const REDACTED_VALUE = '[REDACTED]';
const TRUNCATED_DEPTH_VALUE = '[TRUNCATED_DEPTH]';
const TRUNCATED_ITEMS_PREFIX = '[TRUNCATED_ITEMS:';
const CIRCULAR_REFERENCE_VALUE = '[CIRCULAR_REFERENCE]';

const SENSITIVE_KEY_REGEX =
  /(password|passphrase|passwd|pwd|secret|api[_-]?key|token|authorization|cookie|session|credential|private[_-]?key|access[_-]?key|client[_-]?secret|refresh[_-]?token|id[_-]?token|vault|connection[_-]?string)/i;

const MESSAGE_REPLACERS: Array<{ pattern: RegExp; replace: string }> = [
  {
    pattern:
      /((?:password|passphrase|secret|api[_-]?key|client[_-]?secret|token|authorization|access[_-]?key|private[_-]?key)\s*[:=]\s*)("[^"]+"|'[^']+'|[^\s,;]+)/gi,
    replace: `$1${REDACTED_VALUE}`,
  },
  {
    pattern:
      /([?&](?:token|access_token|id_token|refresh_token|api_key|apikey|secret|client_secret|password)=)([^&#\s]+)/gi,
    replace: `$1${encodeURIComponent(REDACTED_VALUE)}`,
  },
  {
    pattern: /(authorization\s*:\s*bearer\s+)[^\s,;]+/gi,
    replace: `$1${REDACTED_VALUE}`,
  },
  {
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g,
    replace: REDACTED_VALUE,
  },
];

export interface RedactionOptions {
  maxDepth?: number;
  maxEntries?: number;
}

interface InternalRedactionOptions {
  maxDepth: number;
  maxEntries: number;
  depth: number;
  seen: WeakSet<object>;
}

export function redactSensitiveData<T>(
  value: T,
  options: RedactionOptions = {},
): T {
  const internal: InternalRedactionOptions = {
    maxDepth: options.maxDepth ?? 8,
    maxEntries: options.maxEntries ?? 300,
    depth: 0,
    seen: new WeakSet<object>(),
  };

  return redactValue(value, internal) as T;
}

export function redactSensitiveString(value: string): string {
  let masked = value;
  for (const replacer of MESSAGE_REPLACERS) {
    masked = masked.replace(replacer.pattern, replacer.replace);
  }
  return masked;
}

function redactValue(value: unknown, state: InternalRedactionOptions): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactSensitiveString(value);
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return REDACTED_VALUE;
  }

  if (state.depth >= state.maxDepth) {
    return TRUNCATED_DEPTH_VALUE;
  }

  const objectValue = value;
  if (state.seen.has(objectValue)) {
    return CIRCULAR_REFERENCE_VALUE;
  }
  state.seen.add(objectValue);

  const nextState: InternalRedactionOptions = {
    ...state,
    depth: state.depth + 1,
  };

  if (Array.isArray(value)) {
    const sanitized: unknown[] = [];
    const maxItems = Math.min(value.length, state.maxEntries);
    for (let index = 0; index < maxItems; index += 1) {
      sanitized.push(redactValue(value[index], nextState));
    }

    if (value.length > maxItems) {
      sanitized.push(`${TRUNCATED_ITEMS_PREFIX}${value.length - maxItems}]`);
    }

    return sanitized;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const sanitized: Record<string, unknown> = {};
  const maxEntries = Math.min(entries.length, state.maxEntries);

  for (let index = 0; index < maxEntries; index += 1) {
    const [key, entryValue] = entries[index];
    if (isSensitiveKey(key)) {
      sanitized[key] = REDACTED_VALUE;
      continue;
    }
    sanitized[key] = redactValue(entryValue, nextState);
  }

  if (entries.length > maxEntries) {
    sanitized.__truncated__ = `${TRUNCATED_ITEMS_PREFIX}${entries.length - maxEntries}]`;
  }

  return sanitized;
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_REGEX.test(key);
}
