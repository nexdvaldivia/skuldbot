export interface ExecutionErrorDetail {
  code: string;
  layer: string;
  message: string;
  hint?: string;
  nodeId?: string;
  nodeType?: string;
  retryable: boolean;
  causes?: string[];
  raw?: string;
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  output?: string;
  logs?: string[];
  errorDetail?: ExecutionErrorDetail;
  evidencePackPath?: string;
}

