import { Injectable } from '@nestjs/common';
import {
  NodeManifest,
  createUnknownNodeManifest,
} from '@skuldbot/compiler';

/**
 * Service for managing node manifests
 * In the future, these could come from a database or be loaded dynamically
 */
@Injectable()
export class ManifestsService {
  private manifests: Map<string, NodeManifest> = new Map();

  constructor() {
    this.registerBuiltInManifests();
  }

  /**
   * Get manifests for a list of node types
   */
  async getManifestsForTypes(
    types: string[],
  ): Promise<Record<string, NodeManifest>> {
    const result: Record<string, NodeManifest> = {};

    for (const type of types) {
      result[type] = this.getManifest(type);
    }

    return result;
  }

  /**
   * Get a single manifest by type
   */
  getManifest(type: string): NodeManifest {
    return this.manifests.get(type) ?? createUnknownNodeManifest(type);
  }

  /**
   * Register a manifest
   */
  registerManifest(manifest: NodeManifest): void {
    this.manifests.set(manifest.type, manifest);
  }

  /**
   * Get all registered manifests
   */
  getAllManifests(): NodeManifest[] {
    return Array.from(this.manifests.values());
  }

  /**
   * Register built-in manifests for core RPA nodes
   */
  private registerBuiltInManifests(): void {
    // Triggers
    this.registerManifest(createTriggerManifest('trigger.manual', 'Manual Trigger'));
    this.registerManifest(createTriggerManifest('trigger.schedule', 'Schedule Trigger'));
    this.registerManifest(createTriggerManifest('trigger.webhook', 'Webhook Trigger'));
    this.registerManifest(createTriggerManifest('trigger.form', 'Form Trigger'));

    // Browser automation
    this.registerManifest(createBrowserManifest('browser.open', 'Open Browser'));
    this.registerManifest(createBrowserManifest('browser.close', 'Close Browser'));
    this.registerManifest(createBrowserManifest('browser.navigate', 'Navigate'));
    this.registerManifest(createBrowserManifest('browser.click', 'Click Element'));
    this.registerManifest(createBrowserManifest('browser.fill', 'Fill Input'));
    this.registerManifest(createBrowserManifest('browser.get_text', 'Get Text'));
    this.registerManifest(createBrowserManifest('browser.screenshot', 'Screenshot'));
    this.registerManifest(createBrowserManifest('browser.wait', 'Wait for Element'));

    // Excel
    this.registerManifest(createExcelManifest('excel.open', 'Open Workbook'));
    this.registerManifest(createExcelManifest('excel.close', 'Close Workbook'));
    this.registerManifest(createExcelManifest('excel.read_range', 'Read Range'));
    this.registerManifest(createExcelManifest('excel.write_range', 'Write Range'));
    this.registerManifest(createExcelManifest('excel.get_sheets', 'Get Sheets'));

    // Files
    this.registerManifest(createFileManifest('files.read', 'Read File'));
    this.registerManifest(createFileManifest('files.write', 'Write File'));
    this.registerManifest(createFileManifest('files.delete', 'Delete File'));
    this.registerManifest(createFileManifest('files.move', 'Move File'));
    this.registerManifest(createFileManifest('files.copy', 'Copy File'));
    this.registerManifest(createFileManifest('files.list', 'List Files'));

    // HTTP/API
    this.registerManifest(createHttpManifest('http.request', 'HTTP Request'));
    this.registerManifest(createHttpManifest('http.get', 'HTTP GET'));
    this.registerManifest(createHttpManifest('http.post', 'HTTP POST'));

    // Email
    this.registerManifest(createEmailManifest('email.send', 'Send Email'));
    this.registerManifest(createEmailManifest('email.read', 'Read Emails'));

    // AI/LLM
    this.registerManifest(createAIManifest('ai.llm_prompt', 'LLM Prompt'));
    this.registerManifest(createAIManifest('ai.classify', 'AI Classify'));
    this.registerManifest(createAIManifest('ai.extract', 'AI Extract'));

    // Control flow
    this.registerManifest(createControlManifest('control.if', 'If/Else'));
    this.registerManifest(createControlManifest('control.loop', 'For Each Loop'));
    this.registerManifest(createControlManifest('control.while', 'While Loop'));
    this.registerManifest(createControlManifest('control.try_catch', 'Try/Catch'));
    this.registerManifest(createControlManifest('control.switch', 'Switch'));
    this.registerManifest(createControlManifest('control.parallel', 'Parallel'));
    this.registerManifest(createControlManifest('control.break', 'Break'));
    this.registerManifest(createControlManifest('control.continue', 'Continue'));

    // Data
    this.registerManifest(createDataManifest('data.set_variable', 'Set Variable'));
    this.registerManifest(createDataManifest('data.transform', 'Transform Data'));
    this.registerManifest(createDataManifest('data.filter', 'Filter Data'));
    this.registerManifest(createDataManifest('data.map', 'Map Data'));

    // Utility
    this.registerManifest(createUtilityManifest('utility.log', 'Log Message'));
    this.registerManifest(createUtilityManifest('utility.delay', 'Delay'));
    this.registerManifest(createUtilityManifest('utility.comment', 'Comment'));
  }
}

// Helper functions to create manifests

function createTriggerManifest(type: string, label: string): NodeManifest {
  return {
    type,
    category: 'trigger',
    label,
    description: `${label} node`,
    icon: 'Play',
    defaultConfig: {},
    configSchema: [],
    data: {
      consumes: ['UNCLASSIFIED'],
      produces: ['UNCLASSIFIED'],
      propagation: 'NONE',
    },
    capabilities: {
      egress: 'NONE',
      writes: 'NONE',
      deletes: false,
      privilegedAccess: false,
    },
    controls: {
      requires: [],
      supports: ['AUDIT_LOG'],
    },
    runtime: {
      idempotent: true,
      retryable: false,
      defaultRetry: { max: 0, backoffMs: 0 },
      timeoutMs: 5000,
    },
  };
}

function createBrowserManifest(type: string, label: string): NodeManifest {
  return {
    type,
    category: 'browser',
    label,
    description: `${label} - Browser automation`,
    icon: 'Globe',
    defaultConfig: {},
    configSchema: [],
    data: {
      consumes: ['UNCLASSIFIED', 'PII', 'PHI'],
      produces: ['UNCLASSIFIED', 'PII'],
      propagation: 'PASS_THROUGH',
    },
    capabilities: {
      egress: 'EXTERNAL',
      writes: 'NONE',
      deletes: false,
      privilegedAccess: false,
    },
    controls: {
      requires: ['AUDIT_LOG'],
      supports: ['DLP_SCAN', 'MASK', 'REDACT'],
    },
    runtime: {
      idempotent: false,
      retryable: true,
      defaultRetry: { max: 3, backoffMs: 1000 },
      timeoutMs: 30000,
    },
  };
}

function createExcelManifest(type: string, label: string): NodeManifest {
  const isWrite = type.includes('write');
  return {
    type,
    category: 'excel',
    label,
    description: `${label} - Excel operations`,
    icon: 'FileSpreadsheet',
    defaultConfig: {},
    configSchema: [],
    data: {
      consumes: ['UNCLASSIFIED', 'PII', 'PHI', 'PCI'],
      produces: isWrite ? ['UNCLASSIFIED'] : ['UNCLASSIFIED', 'PII', 'PHI', 'PCI'],
      propagation: isWrite ? 'NONE' : 'DERIVE',
    },
    capabilities: {
      egress: 'NONE',
      writes: isWrite ? 'INTERNAL' : 'NONE',
      deletes: false,
      privilegedAccess: false,
    },
    controls: {
      requires: [],
      supports: ['AUDIT_LOG', 'ARTIFACT_ENCRYPTION', 'DLP_SCAN'],
    },
    runtime: {
      idempotent: !isWrite,
      retryable: true,
      defaultRetry: { max: 2, backoffMs: 500 },
      timeoutMs: 60000,
    },
  };
}

function createFileManifest(type: string, label: string): NodeManifest {
  const isWrite = type.includes('write');
  const isDelete = type.includes('delete');
  return {
    type,
    category: 'files',
    label,
    description: `${label} - File operations`,
    icon: 'File',
    defaultConfig: {},
    configSchema: [],
    data: {
      consumes: ['UNCLASSIFIED', 'PII', 'PHI', 'PCI', 'CREDENTIALS'],
      produces: ['UNCLASSIFIED', 'PII', 'PHI', 'PCI'],
      propagation: 'PASS_THROUGH',
    },
    capabilities: {
      egress: 'NONE',
      writes: isWrite ? 'INTERNAL' : 'NONE',
      deletes: isDelete,
      privilegedAccess: false,
    },
    controls: {
      requires: [],
      supports: ['AUDIT_LOG', 'ARTIFACT_ENCRYPTION', 'DLP_SCAN'],
    },
    runtime: {
      idempotent: !isWrite && !isDelete,
      retryable: true,
      defaultRetry: { max: 2, backoffMs: 500 },
      timeoutMs: 30000,
    },
  };
}

function createHttpManifest(type: string, label: string): NodeManifest {
  return {
    type,
    category: 'http',
    label,
    description: `${label} - HTTP/API calls`,
    icon: 'Send',
    defaultConfig: {},
    configSchema: [],
    data: {
      consumes: ['UNCLASSIFIED', 'PII', 'PHI', 'PCI', 'CREDENTIALS'],
      produces: ['UNCLASSIFIED', 'PII', 'PHI', 'PCI'],
      propagation: 'PASS_THROUGH',
    },
    capabilities: {
      egress: 'EXTERNAL',
      writes: 'EXTERNAL',
      deletes: false,
      privilegedAccess: false,
    },
    controls: {
      requires: ['AUDIT_LOG'],
      supports: ['DLP_SCAN', 'RATE_LIMIT', 'TIMEOUT_GUARD', 'REDACT', 'TOKENIZE'],
    },
    runtime: {
      idempotent: type === 'http.get',
      retryable: true,
      defaultRetry: { max: 3, backoffMs: 1000 },
      timeoutMs: 30000,
    },
  };
}

function createEmailManifest(type: string, label: string): NodeManifest {
  const isSend = type.includes('send');
  return {
    type,
    category: 'email',
    label,
    description: `${label} - Email operations`,
    icon: 'Mail',
    defaultConfig: {},
    configSchema: [],
    data: {
      consumes: ['UNCLASSIFIED', 'PII', 'PHI'],
      produces: isSend ? ['UNCLASSIFIED'] : ['UNCLASSIFIED', 'PII', 'PHI'],
      propagation: isSend ? 'NONE' : 'DERIVE',
    },
    capabilities: {
      egress: isSend ? 'EXTERNAL' : 'NONE',
      writes: 'NONE',
      deletes: false,
      privilegedAccess: false,
    },
    controls: {
      requires: ['AUDIT_LOG'],
      supports: ['DLP_SCAN', 'HITL_APPROVAL', 'REDACT'],
    },
    runtime: {
      idempotent: false,
      retryable: !isSend,
      defaultRetry: { max: isSend ? 0 : 2, backoffMs: 1000 },
      timeoutMs: 30000,
    },
  };
}

function createAIManifest(type: string, label: string): NodeManifest {
  return {
    type,
    category: 'ai',
    label,
    description: `${label} - AI/LLM operations`,
    icon: 'Brain',
    defaultConfig: {},
    configSchema: [],
    data: {
      consumes: ['UNCLASSIFIED', 'PII', 'PHI'],
      produces: ['UNCLASSIFIED'],
      propagation: 'TRANSFORM',
    },
    capabilities: {
      egress: 'EXTERNAL',
      writes: 'NONE',
      deletes: false,
      privilegedAccess: false,
    },
    controls: {
      requires: ['AUDIT_LOG'],
      supports: ['REDACT', 'PROMPT_GUARD', 'DLP_SCAN', 'RATE_LIMIT', 'TIMEOUT_GUARD'],
    },
    runtime: {
      idempotent: false,
      retryable: true,
      defaultRetry: { max: 2, backoffMs: 2000 },
      timeoutMs: 120000,
    },
  };
}

function createControlManifest(type: string, label: string): NodeManifest {
  return {
    type,
    category: 'control',
    label,
    description: `${label} - Control flow`,
    icon: 'GitBranch',
    defaultConfig: {},
    configSchema: [],
    data: {
      consumes: ['UNCLASSIFIED', 'PII', 'PHI', 'PCI', 'CREDENTIALS'],
      produces: ['UNCLASSIFIED'],
      propagation: 'PASS_THROUGH',
    },
    capabilities: {
      egress: 'NONE',
      writes: 'NONE',
      deletes: false,
      privilegedAccess: false,
    },
    controls: {
      requires: [],
      supports: ['AUDIT_LOG'],
    },
    runtime: {
      idempotent: true,
      retryable: false,
      defaultRetry: { max: 0, backoffMs: 0 },
      timeoutMs: 5000,
    },
  };
}

function createDataManifest(type: string, label: string): NodeManifest {
  return {
    type,
    category: 'data',
    label,
    description: `${label} - Data manipulation`,
    icon: 'Database',
    defaultConfig: {},
    configSchema: [],
    data: {
      consumes: ['UNCLASSIFIED', 'PII', 'PHI', 'PCI', 'CREDENTIALS'],
      produces: ['UNCLASSIFIED', 'PII', 'PHI', 'PCI'],
      propagation: 'PASS_THROUGH',
    },
    capabilities: {
      egress: 'NONE',
      writes: 'NONE',
      deletes: false,
      privilegedAccess: false,
    },
    controls: {
      requires: [],
      supports: ['AUDIT_LOG', 'REDACT', 'MASK', 'TOKENIZE'],
    },
    runtime: {
      idempotent: true,
      retryable: true,
      defaultRetry: { max: 1, backoffMs: 100 },
      timeoutMs: 10000,
    },
  };
}

function createUtilityManifest(type: string, label: string): NodeManifest {
  return {
    type,
    category: 'utility',
    label,
    description: `${label} - Utility node`,
    icon: 'Tool',
    defaultConfig: {},
    configSchema: [],
    data: {
      consumes: ['UNCLASSIFIED', 'PII', 'PHI', 'PCI', 'CREDENTIALS'],
      produces: ['UNCLASSIFIED'],
      propagation: 'NONE',
    },
    capabilities: {
      egress: 'NONE',
      writes: 'NONE',
      deletes: false,
      privilegedAccess: false,
    },
    controls: {
      requires: [],
      supports: ['AUDIT_LOG', 'LOG_REDACTION'],
    },
    runtime: {
      idempotent: true,
      retryable: true,
      defaultRetry: { max: 0, backoffMs: 0 },
      timeoutMs: 5000,
    },
  };
}
