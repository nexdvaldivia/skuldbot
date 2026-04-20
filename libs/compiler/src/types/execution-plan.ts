import { Classification, ControlType } from './classification';

/**
 * Execution Plan - What the runner receives
 * Compiled from DSL + manifests + policies
 */
export interface ExecutionPlan {
  planVersion: string;
  run: {
    runId: string;
    tenantId: string;
    botId: string;
    botVersion: string;
    startedAt: string;
  };
  entryStepId: string;
  steps: ExecutionStep[];
  policy: {
    blocks: Array<{
      nodeId: string;
      ruleId: string;
      message: string;
      severity: string;
    }>;
    warnings: Array<{
      nodeId: string;
      ruleId: string;
      message: string;
      severity: string;
    }>;
  };
}

/**
 * Execution Step - Individual step in the plan
 */
export interface ExecutionStep {
  stepId: string;
  nodeId: string;
  type: string;
  resolvedConfig: Record<string, any>;
  controls: ControlType[];
  classification: {
    in: Classification;
    out: Classification;
  };
  runtime: {
    idempotent: boolean;
    retry: {
      max: number;
      backoffMs: number;
    };
    timeoutMs: number;
  };
  jumps: Jump[];
}

/**
 * Jump - Where to go next based on result
 */
export interface Jump {
  on: string; // "success" | "error" | "done" | "then" | "else" | "case_*" | "branch_*"
  toStepId: string | 'END';
}

/**
 * Node classification info (in/out)
 */
export interface NodeClassInfo {
  in: Classification;
  out: Classification;
}
