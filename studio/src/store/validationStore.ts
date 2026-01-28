import { create } from "zustand";
import { FlowNode, FlowEdge } from "../types/flow";
import { getNodeTemplate } from "../data/nodeTemplates";

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  id: string;
  nodeId?: string;
  edgeId?: string;
  severity: ValidationSeverity;
  message: string;
  field?: string;
}

interface ValidationState {
  issues: ValidationIssue[];
  isValidating: boolean;

  // Actions
  validate: (nodes: FlowNode[], edges: FlowEdge[]) => ValidationIssue[];
  clearIssues: () => void;
  getNodeIssues: (nodeId: string) => ValidationIssue[];
  hasErrors: () => boolean;
  hasWarnings: () => boolean;
}

// Validation rules
const validateNodes = (nodes: FlowNode[], edges: FlowEdge[]): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  const AI_NODES_WITH_MODEL = new Set([
    "ai.agent",
    "ai.extract_data",
    "ai.summarize",
    "ai.classify",
    "ai.translate",
    "ai.sentiment",
    "ai.vision",
    "ai.repair_data",
    "ai.suggest_repairs",
  ]);

  const isMs365Action = (type: string) => type.startsWith("ms365.") && type !== "ms365.connection";

  const validateRequiredField = (
    nodeId: string,
    field: string,
    label: string,
    value: unknown,
    severity: ValidationSeverity = "error"
  ) => {
    if (!value) {
      issues.push({
        id: `${nodeId}-${field}`,
        nodeId,
        severity,
        message: `${label} is required`,
        field,
      });
      return false;
    }
    return true;
  };

  const isMissingValue = (value: unknown) => {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
    return false;
  };

  const hasFieldIssue = (nodeId: string, field: string) =>
    issues.some((issue) => issue.nodeId === nodeId && issue.field === field);

  // Check for empty flow
  if (nodes.length === 0) {
    issues.push({
      id: "empty-flow",
      severity: "warning",
      message: "The flow is empty. Add nodes to create your bot.",
    });
    return issues;
  }

  // Check for trigger node
  const triggerNodes = nodes.filter((n) => n.data.category === "trigger");
  if (triggerNodes.length === 0) {
    issues.push({
      id: "no-trigger",
      severity: "info",
      message: "No trigger node found. A Manual Trigger will be added automatically.",
    });
  }

  // Check each node
  nodes.forEach((node) => {
    const nodeType = node.data.nodeType;
    const config = node.data.config || {};

    // Check for disconnected nodes (no incoming edges)
    const hasIncoming = edges.some((e) => e.target === node.id);
    const isTrigger = node.data.category === "trigger";
    // Config nodes that only provide output (no flow input needed)
    const isConfigNode = [
      "ms365.connection",
      "ai.model",
      "ai.embeddings",
      "vectordb.memory",
    ].includes(nodeType);

    if (!isTrigger && !isConfigNode && !hasIncoming) {
      issues.push({
        id: `disconnected-${node.id}`,
        nodeId: node.id,
        severity: "warning",
        message: `Node "${node.data.label}" has no incoming connections`,
      });
    }

    // Validate specific node types
    switch (nodeType) {
      case "browser.open":
      case "web.open_browser":
        if (!config.url) {
          issues.push({
            id: `${node.id}-url`,
            nodeId: node.id,
            severity: "error",
            message: `URL is required`,
            field: "url",
          });
        }
        break;

      case "browser.click":
      case "web.click":
      case "browser.get_text":
      case "web.get_text":
      case "browser.wait":
      case "web.wait_element":
        if (!config.selector) {
          issues.push({
            id: `${node.id}-selector`,
            nodeId: node.id,
            severity: "error",
            message: `Selector is required`,
            field: "selector",
          });
        }
        break;

      case "browser.fill":
        if (!config.selector) {
          issues.push({
            id: `${node.id}-selector`,
            nodeId: node.id,
            severity: "error",
            message: `Selector is required`,
            field: "selector",
          });
        }
        if (!config.value && !config.variable) {
          issues.push({
            id: `${node.id}-value`,
            nodeId: node.id,
            severity: "warning",
            message: `Value or variable should be specified`,
            field: "value",
          });
        }
        break;

      case "web.type":
        if (!config.selector) {
          issues.push({
            id: `${node.id}-selector`,
            nodeId: node.id,
            severity: "error",
            message: `Selector is required`,
            field: "selector",
          });
        }
        if (!config.text) {
          issues.push({
            id: `${node.id}-text`,
            nodeId: node.id,
            severity: "error",
            message: `Text is required`,
            field: "text",
          });
        }
        break;

      case "browser.navigate":
      case "web.navigate":
        if (!config.url) {
          issues.push({
            id: `${node.id}-url`,
            nodeId: node.id,
            severity: "error",
            message: `URL is required`,
            field: "url",
          });
        }
        break;

      case "file.read":
      case "file.write":
      case "file.delete":
      case "files.read":
      case "files.write":
      case "files.delete":
        if (!config.path) {
          issues.push({
            id: `${node.id}-path`,
            nodeId: node.id,
            severity: "error",
            message: `File path is required`,
            field: "path",
          });
        }
        break;

      case "var.set":
      case "control.set_variable":
        if (!config.name) {
          issues.push({
            id: `${node.id}-name`,
            nodeId: node.id,
            severity: "error",
            message: `Variable name is required`,
            field: "name",
          });
        }
        break;

      case "http.get":
      case "http.post":
      case "http.put":
      case "http.delete":
      case "api.http_request":
      case "api.rest_get":
      case "api.rest_post":
        if (!config.url) {
          issues.push({
            id: `${node.id}-url`,
            nodeId: node.id,
            severity: "error",
            message: `URL is required`,
            field: "url",
          });
        }
        break;

      case "web.execute_js":
        if (!config.script) {
          issues.push({
            id: `${node.id}-script`,
            nodeId: node.id,
            severity: "error",
            message: `JavaScript code is required`,
            field: "script",
          });
        }
        break;

      case "web.get_attribute":
        if (!config.selector) {
          issues.push({
            id: `${node.id}-selector`,
            nodeId: node.id,
            severity: "error",
            message: `Selector is required`,
            field: "selector",
          });
        }
        if (!config.attribute) {
          issues.push({
            id: `${node.id}-attribute`,
            nodeId: node.id,
            severity: "error",
            message: `Attribute is required`,
            field: "attribute",
          });
        }
        break;

      case "web.select_option":
        if (!config.selector) {
          issues.push({
            id: `${node.id}-selector`,
            nodeId: node.id,
            severity: "error",
            message: `Selector is required`,
            field: "selector",
          });
        }
        if (!config.value) {
          issues.push({
            id: `${node.id}-value`,
            nodeId: node.id,
            severity: "error",
            message: `Value is required`,
            field: "value",
          });
        }
        break;

      case "web.scroll":
        if (config.direction === "to_element" && !config.selector) {
          issues.push({
            id: `${node.id}-selector`,
            nodeId: node.id,
            severity: "error",
            message: `Selector is required for scroll to element`,
            field: "selector",
          });
        }
        break;

      case "desktop.click":
        if (!config.locator && (config.x === undefined || config.y === undefined)) {
          issues.push({
            id: `${node.id}-target`,
            nodeId: node.id,
            severity: "error",
            message: `Element locator or X/Y coordinates are required`,
            field: "locator",
          });
        }
        break;

      case "web.download_file":
        if (!config.url) {
          issues.push({
            id: `${node.id}-url`,
            nodeId: node.id,
            severity: "error",
            message: `URL is required`,
            field: "url",
          });
        }
        if (!config.path) {
          issues.push({
            id: `${node.id}-path`,
            nodeId: node.id,
            severity: "error",
            message: `Save path is required`,
            field: "path",
          });
        }
        break;

      case "email.send_smtp":
        if (!config.to) {
          issues.push({
            id: `${node.id}-to`,
            nodeId: node.id,
            severity: "error",
            message: `Recipient email is required`,
            field: "to",
          });
        }
        if (!config.subject) {
          issues.push({
            id: `${node.id}-subject`,
            nodeId: node.id,
            severity: "warning",
            message: `Subject is recommended`,
            field: "subject",
          });
        }
        break;

      case "trigger.form":
        const fields = config.fields || [];
        if (fields.length === 0) {
          issues.push({
            id: `${node.id}-fields`,
            nodeId: node.id,
            severity: "warning",
            message: `Form trigger has no fields defined`,
            field: "fields",
          });
        }
        break;

      case "control.if":
        if (!config.condition) {
          issues.push({
            id: `${node.id}-condition`,
            nodeId: node.id,
            severity: "error",
            message: `Condition is required`,
            field: "condition",
          });
        }
        break;

      case "control.loop":
        if (!config.count && !config.items) {
          issues.push({
            id: `${node.id}-count`,
            nodeId: node.id,
            severity: "error",
            message: `Loop count or items are required`,
            field: "count",
          });
        }
        break;

      case "db.connect":
      case "database.connect":
        if (!config.connectionString && !config.host) {
          issues.push({
            id: `${node.id}-connection`,
            nodeId: node.id,
            severity: "error",
            message: `Database connection details are required`,
            field: "connectionString",
          });
        }
        break;

      case "db.query":
      case "database.query":
        if (!config.query) {
          issues.push({
            id: `${node.id}-query`,
            nodeId: node.id,
            severity: "error",
            message: `SQL query is required`,
            field: "query",
          });
        }
        break;

      // Connection/Config nodes - validate required fields
      case "trigger.ms365_email": {
        // Check if MS365 Connection is connected
        const hasMS365Connection = edges.some(
          (e) => e.target === node.id && e.targetHandle === "connection" && e.data?.edgeType === "connection"
        );
        if (!hasMS365Connection) {
          issues.push({
            id: `${node.id}-no-connection`,
            nodeId: node.id,
            severity: "error",
            message: `Connect an MS365 Connection node to provide credentials`,
          });
        }
        break;
      }

      case "ms365.connection":
        if (!config.tenant_id) {
          issues.push({
            id: `${node.id}-tenant`,
            nodeId: node.id,
            severity: "error",
            message: `Tenant ID is required`,
            field: "tenant_id",
          });
        }
        if (!config.client_id) {
          issues.push({
            id: `${node.id}-client`,
            nodeId: node.id,
            severity: "error",
            message: `Client ID is required`,
            field: "client_id",
          });
        }
        if (!config.client_secret) {
          issues.push({
            id: `${node.id}-secret`,
            nodeId: node.id,
            severity: "error",
            message: `Client Secret is required`,
            field: "client_secret",
          });
        }
        // Check if connection was tested
        if (config.tenant_id && config.client_id && config.client_secret && !config.connectionTested) {
          issues.push({
            id: `${node.id}-untested`,
            nodeId: node.id,
            severity: "warning",
            message: `Connection not tested. Click "Test Connection" to verify credentials.`,
          });
        }
        break;

      case "ai.model":
        if (!config.provider) {
          issues.push({
            id: `${node.id}-provider`,
            nodeId: node.id,
            severity: "error",
            message: `AI provider is required`,
            field: "provider",
          });
        }
        if (!config.model) {
          issues.push({
            id: `${node.id}-model`,
            nodeId: node.id,
            severity: "error",
            message: `Model is required`,
            field: "model",
          });
        }
        if (config.model === "custom" && !config.custom_model) {
          issues.push({
            id: `${node.id}-custom-model`,
            nodeId: node.id,
            severity: "error",
            message: `Custom model name is required`,
            field: "custom_model",
          });
        }
        break;

      case "ai.embeddings":
        if (!config.provider) {
          issues.push({
            id: `${node.id}-provider`,
            nodeId: node.id,
            severity: "error",
            message: `Embeddings provider is required`,
            field: "provider",
          });
        }
        break;

      case "voice.speak":
        validateRequiredField(node.id, "azure_speech_key", "Azure Speech Key", config.azure_speech_key);
        validateRequiredField(node.id, "text", "Text", config.text);
        break;

      case "voice.listen":
        validateRequiredField(node.id, "azure_speech_key", "Azure Speech Key", config.azure_speech_key);
        validateRequiredField(node.id, "audio_path", "Audio File Path", config.audio_path);
        break;
    }

    if (AI_NODES_WITH_MODEL.has(nodeType)) {
      const hasModelConnection = edges.some(
        (e) =>
          e.target === node.id &&
          e.targetHandle === "model" &&
          e.data?.edgeType === "model"
      );
      if (!hasModelConnection) {
        issues.push({
          id: `${node.id}-model-connection`,
          nodeId: node.id,
          severity: "error",
          message: `Connect an AI Model node to "${node.data.label}"`,
        });
      }
    }

    if (isMs365Action(nodeType)) {
      const hasMS365Connection = edges.some(
        (e) =>
          e.target === node.id &&
          e.targetHandle === "connection" &&
          e.data?.edgeType === "connection"
      );
      if (!hasMS365Connection) {
        issues.push({
          id: `${node.id}-no-connection`,
          nodeId: node.id,
          severity: "error",
          message: `Connect an MS365 Connection node to "${node.data.label}"`,
        });
      }
    }

    if (nodeType.startsWith("data.tap.")) {
      const tapType = nodeType.replace("data.tap.", "");
      if (["sqlserver", "oracle", "postgres", "mysql", "db2", "snowflake"].includes(tapType)) {
        if (tapType === "snowflake") {
          validateRequiredField(node.id, "account", "Account Identifier", config.account);
        } else {
          validateRequiredField(node.id, "host", "Host", config.host);
        }
        validateRequiredField(node.id, "database", "Database", config.database);
        validateRequiredField(node.id, "username", "Username", config.username);
        validateRequiredField(node.id, "password", "Password", config.password);
        if (!config.query && !config.table) {
          issues.push({
            id: `${node.id}-query-table`,
            nodeId: node.id,
            severity: "error",
            message: "SQL Query or Table is required",
            field: "query",
          });
        }
      } else if (tapType === "csv" || tapType === "excel") {
        validateRequiredField(node.id, "path", "File Path", config.path);
      } else if (tapType === "s3") {
        validateRequiredField(node.id, "bucket", "Bucket Name", config.bucket);
        validateRequiredField(node.id, "key", "Object Key", config.key);
        validateRequiredField(node.id, "aws_access_key", "AWS Access Key", config.aws_access_key);
        validateRequiredField(node.id, "aws_secret_key", "AWS Secret Key", config.aws_secret_key);
      } else if (tapType === "sftp") {
        validateRequiredField(node.id, "host", "Host", config.host);
        validateRequiredField(node.id, "path", "File Path", config.path);
        validateRequiredField(node.id, "username", "Username", config.username);
        if (!config.password && !config.private_key) {
          issues.push({
            id: `${node.id}-auth`,
            nodeId: node.id,
            severity: "error",
            message: "Password or Private Key is required",
            field: "password",
          });
        }
      } else if (tapType === "salesforce") {
        validateRequiredField(node.id, "username", "Username", config.username);
        validateRequiredField(node.id, "password", "Password", config.password);
        validateRequiredField(node.id, "security_token", "Security Token", config.security_token);
        validateRequiredField(node.id, "query", "SOQL Query", config.query);
      } else if (tapType === "rest_api") {
        validateRequiredField(node.id, "url", "API URL", config.url);
      }
    }

    if (nodeType.startsWith("data.target.")) {
      const targetType = nodeType.replace("data.target.", "");
      const hasRecords = validateRequiredField(node.id, "records", "Records", config.records);
      if (["sqlserver", "oracle", "postgres", "mysql", "db2", "snowflake"].includes(targetType)) {
        if (targetType === "snowflake") {
          validateRequiredField(node.id, "account", "Account Identifier", config.account);
        } else {
          validateRequiredField(node.id, "host", "Host", config.host);
        }
        validateRequiredField(node.id, "database", "Database", config.database);
        validateRequiredField(node.id, "username", "Username", config.username);
        validateRequiredField(node.id, "password", "Password", config.password);
        validateRequiredField(node.id, "table", "Table", config.table);
        if (!hasRecords) {
          issues.push({
            id: `${node.id}-records-helper`,
            nodeId: node.id,
            severity: "info",
            message: "Connect a tap node and map records via ${Tap.records}",
            field: "records",
          });
        }
      } else if (targetType === "bigquery") {
        validateRequiredField(node.id, "project", "Project", config.project);
        validateRequiredField(node.id, "dataset", "Dataset", config.dataset);
        validateRequiredField(node.id, "table", "Table", config.table);
        validateRequiredField(node.id, "credentials_json", "Credentials JSON", config.credentials_json);
      } else if (targetType === "csv" || targetType === "excel") {
        validateRequiredField(node.id, "path", "File Path", config.path);
      } else if (targetType === "s3") {
        validateRequiredField(node.id, "bucket", "Bucket Name", config.bucket);
        validateRequiredField(node.id, "key", "Object Key", config.key);
        validateRequiredField(node.id, "aws_access_key", "AWS Access Key", config.aws_access_key);
        validateRequiredField(node.id, "aws_secret_key", "AWS Secret Key", config.aws_secret_key);
      } else if (targetType === "sftp") {
        validateRequiredField(node.id, "host", "Host", config.host);
        validateRequiredField(node.id, "path", "File Path", config.path);
        validateRequiredField(node.id, "username", "Username", config.username);
        if (!config.password && !config.private_key) {
          issues.push({
            id: `${node.id}-auth`,
            nodeId: node.id,
            severity: "error",
            message: "Password or Private Key is required",
            field: "password",
          });
        }
      }
    }

    const template = getNodeTemplate(nodeType);
    if (template?.configSchema?.length) {
      template.configSchema.forEach((field) => {
        if (!field.required) return;
        if (hasFieldIssue(node.id, field.name)) return;
        const hasDefault =
          field.default !== undefined ||
          (template.defaultConfig &&
            Object.prototype.hasOwnProperty.call(template.defaultConfig, field.name));
        if (hasDefault && (config[field.name] === undefined || config[field.name] === null)) return;
        if (isMissingValue(config[field.name])) {
          issues.push({
            id: `${node.id}-${field.name}`,
            nodeId: node.id,
            severity: "error",
            message: `${field.label || field.name} is required`,
            field: field.name,
          });
        }
      });
    }
  });

  // Check for cycles (simple detection)
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const hasCycle = (nodeId: string): boolean => {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const outgoingEdges = edges.filter((e) => e.source === nodeId);
    for (const edge of outgoingEdges) {
      if (!visited.has(edge.target)) {
        if (hasCycle(edge.target)) return true;
      } else if (recursionStack.has(edge.target)) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  };

  // Start from trigger nodes or first node
  const startNodes = triggerNodes.length > 0
    ? triggerNodes
    : nodes.slice(0, 1);

  for (const startNode of startNodes) {
    if (hasCycle(startNode.id)) {
      issues.push({
        id: "cycle-detected",
        severity: "warning",
        message: "Possible infinite loop detected in the flow. This may be intentional if you have proper exit conditions.",
      });
      break;
    }
  }

  return issues;
};

export const useValidationStore = create<ValidationState>((set, get) => ({
  issues: [],
  isValidating: false,

  validate: (nodes, edges) => {
    set({ isValidating: true });
    const issues = validateNodes(nodes, edges);
    set({ issues, isValidating: false });
    return issues;
  },

  clearIssues: () => {
    set({ issues: [] });
  },

  getNodeIssues: (nodeId) => {
    return get().issues.filter((i) => i.nodeId === nodeId);
  },

  hasErrors: () => {
    return get().issues.some((i) => i.severity === "error");
  },

  hasWarnings: () => {
    return get().issues.some((i) => i.severity === "warning");
  },
}));
