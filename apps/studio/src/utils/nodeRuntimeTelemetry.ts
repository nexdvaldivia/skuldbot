export type NodeRuntimeChannel = "input" | "envelope" | "output";

export interface ParsedNodeRuntimeTelemetry {
  channel: NodeRuntimeChannel;
  nodeId: string | null;
  data: unknown;
}

function parsePayloadWithOptionalNodeId(payloadRaw: string): {
  nodeId: string | null;
  payload: string;
} {
  const trimmed = payloadRaw.trim();
  if (!trimmed) {
    return { nodeId: null, payload: "" };
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith('"')) {
    return { nodeId: null, payload: trimmed };
  }

  const firstColon = trimmed.indexOf(":");
  if (firstColon === -1) {
    return { nodeId: null, payload: trimmed };
  }

  const maybeNodeId = trimmed.slice(0, firstColon).trim();
  const maybePayload = trimmed.slice(firstColon + 1).trim();
  if (!maybeNodeId || !maybePayload) {
    return { nodeId: null, payload: trimmed };
  }

  return { nodeId: maybeNodeId, payload: maybePayload };
}

function safeParseJson(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

export function parseNodeRuntimeTelemetryLine(logLine: string): ParsedNodeRuntimeTelemetry | null {
  const inputPrefix = "NODE_INPUT:";
  const envelopePrefix = "NODE_ENVELOPE:";
  const outputPrefix = "NODE_OUTPUT:";

  const inputIdx = logLine.indexOf(inputPrefix);
  if (inputIdx >= 0) {
    const raw = logLine.slice(inputIdx + inputPrefix.length).trim();
    const { nodeId, payload } = parsePayloadWithOptionalNodeId(raw);
    if (!payload) return null;
    return {
      channel: "input",
      nodeId,
      data: safeParseJson(payload),
    };
  }

  const envelopeIdx = logLine.indexOf(envelopePrefix);
  if (envelopeIdx >= 0) {
    const raw = logLine.slice(envelopeIdx + envelopePrefix.length).trim();
    const { nodeId, payload } = parsePayloadWithOptionalNodeId(raw);
    if (!payload) return null;
    return {
      channel: "envelope",
      nodeId,
      data: safeParseJson(payload),
    };
  }

  const outputIdx = logLine.indexOf(outputPrefix);
  if (outputIdx >= 0) {
    const raw = logLine.slice(outputIdx + outputPrefix.length).trim();
    const { nodeId, payload } = parsePayloadWithOptionalNodeId(raw);
    if (!payload) return null;
    return {
      channel: "output",
      nodeId,
      data: safeParseJson(payload),
    };
  }

  return null;
}

export function extractLatestNodeRuntimeTelemetry(rawOutput?: string): ParsedNodeRuntimeTelemetry | null {
  if (!rawOutput) return null;

  let latestEnvelope: ParsedNodeRuntimeTelemetry | null = null;
  let latestOutput: ParsedNodeRuntimeTelemetry | null = null;

  for (const line of rawOutput.split("\n")) {
    const parsed = parseNodeRuntimeTelemetryLine(line);
    if (!parsed) continue;
    if (parsed.channel === "envelope") {
      latestEnvelope = parsed;
    } else if (parsed.channel === "output") {
      latestOutput = parsed;
    }
  }

  return latestEnvelope || latestOutput;
}

export function extractLatestNodeInputTelemetry(rawOutput?: string): ParsedNodeRuntimeTelemetry | null {
  if (!rawOutput) return null;

  let latestInput: ParsedNodeRuntimeTelemetry | null = null;
  for (const line of rawOutput.split("\n")) {
    const parsed = parseNodeRuntimeTelemetryLine(line);
    if (!parsed || parsed.channel !== "input") continue;
    latestInput = parsed;
  }
  return latestInput;
}

export function getSchemaCandidateFromNodeData(data: unknown): unknown {
  if (data === null || data === undefined) return null;

  if (typeof data !== "object") return data;

  if (
    "json" in (data as Record<string, unknown>) &&
    typeof (data as Record<string, unknown>).json === "object" &&
    (data as Record<string, unknown>).json !== null
  ) {
    return (data as Record<string, unknown>).json;
  }

  if ("items" in (data as Record<string, unknown>) && Array.isArray((data as Record<string, unknown>).items)) {
    const items = (data as Record<string, unknown>).items as unknown[];
    if (items.length > 0) {
      const first = items[0];
      if (
        first &&
        typeof first === "object" &&
        "json" in (first as Record<string, unknown>) &&
        typeof (first as Record<string, unknown>).json === "object" &&
        (first as Record<string, unknown>).json !== null
      ) {
        return (first as Record<string, unknown>).json;
      }
    }
    return items;
  }

  if (
    "result" in (data as Record<string, unknown>) &&
    Object.keys(data as Record<string, unknown>).length === 1
  ) {
    return (data as Record<string, unknown>).result;
  }

  return data;
}
