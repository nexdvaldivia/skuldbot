import { ExecutionErrorDetail, ExecutionResult } from "../types/execution";

const INVOKE_PREFIX = /^Error invoking [`'"]?[^`'"]+[`'"]?:?\s*/i;
const EXECUTION_ERROR_PREFIX = /^Execution error:\s*/i;
const TOAST_MAX_LENGTH = 320;

function truncateForToast(text: string): string {
  if (text.length <= TOAST_MAX_LENGTH) return text;
  return `${text.slice(0, TOAST_MAX_LENGTH - 1).trimEnd()}…`;
}

export function normalizeInvokeErrorMessage(error: unknown): string {
  const raw = String(error ?? "").trim();
  const cleaned = raw
    .replace(INVOKE_PREFIX, "")
    .replace(EXECUTION_ERROR_PREFIX, "")
    .trim();
  return cleaned || "Unknown execution error";
}

export function getExecutionFailureMessage(
  result?: Partial<ExecutionResult> | null,
  fallback = "Execution failed"
): string {
  const fromDetail = result?.errorDetail?.message?.trim();
  if (fromDetail) return fromDetail;
  const fromResult = result?.message?.trim();
  if (fromResult) return fromResult;
  return fallback;
}

export function getExecutionFailureLogDetails(
  result?: Partial<ExecutionResult> | null
): string | Record<string, unknown> {
  const detail = result?.errorDetail;
  if (!detail) {
    return getExecutionFailureMessage(result);
  }
  return {
    ...detail,
    fallbackMessage: result?.message,
  };
}

export function buildExecutionFailureToastDescription(
  result?: Partial<ExecutionResult> | null,
  fallback = "Execution failed"
): string {
  const detail = result?.errorDetail;
  const message = getExecutionFailureMessage(result, fallback);
  const parts: string[] = [];

  if (detail?.code) parts.push(`[${detail.code}]`);
  parts.push(message);
  if (detail?.nodeId) parts.push(`node: ${detail.nodeId}`);
  if (detail?.hint) parts.push(detail.hint);

  return truncateForToast(parts.filter(Boolean).join(" · "));
}

export function getExecutionErrorNodeId(
  result?: Partial<ExecutionResult> | null
): string | null {
  const nodeId = result?.errorDetail?.nodeId;
  return nodeId && nodeId.trim() ? nodeId.trim() : null;
}

export function mergeExecutionFailureContext(
  result?: Partial<ExecutionResult> | null,
  fallbackMessage?: string
): { message: string; toast: string; details: string | Record<string, unknown>; nodeId: string | null } {
  const merged: Partial<ExecutionResult> = {
    ...result,
    message: result?.message || fallbackMessage || "Execution failed",
  };
  return {
    message: getExecutionFailureMessage(merged, fallbackMessage || "Execution failed"),
    toast: buildExecutionFailureToastDescription(merged, fallbackMessage || "Execution failed"),
    details: getExecutionFailureLogDetails(merged),
    nodeId: getExecutionErrorNodeId(merged),
  };
}

export type { ExecutionErrorDetail };

