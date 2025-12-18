import { create } from "zustand";
import { FlowNode, FlowEdge } from "../types/flow";

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

    if (!isTrigger && !hasIncoming) {
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
      case "browser.get_text":
      case "browser.wait":
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

      case "browser.navigate":
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
