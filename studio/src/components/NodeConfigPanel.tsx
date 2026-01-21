import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { open } from "@tauri-apps/api/dialog";
import { invoke } from "@tauri-apps/api/tauri";
import { useFlowStore } from "../store/flowStore";
import { useProjectStore } from "../store/projectStore";
import { useNavigationStore } from "../store/navigationStore";
import { useTabsStore } from "../store/tabsStore";
import { useDebugStore } from "../store/debugStore";
import { getNodeTemplate } from "../data/nodeTemplates";
import { X, Info, Eye, Copy, Check, ChevronRight, ChevronDown, FolderOpen, Loader2, CheckCircle2, XCircle, Zap, Pin, PinOff } from "lucide-react";
import { Icon } from "./ui/Icon";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Textarea } from "./ui/textarea";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { FormBuilder } from "./FormBuilder";
import { FormPreview } from "./FormPreview";
import { ValidationBuilder } from "./ValidationBuilder";
import { ProtectionBuilder } from "./ProtectionBuilder";
import { FormFieldDefinition, OutputField, FlowNode, ValidationRule, ProtectionRule } from "../types/flow";

interface AvailableVariable {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  field: OutputField;
  expression: string;
}

// Tree node component for nested output display
interface OutputTreeNodeProps {
  label: string;
  type: "object" | "array";
  nodeLabel: string;
  fields: FormFieldDefinition[];
  copyExpression: (expr: string) => void;
  copiedExpression: string | null;
  isLast: boolean;
}

function OutputTreeNode({
  label,
  nodeLabel,
  fields,
  copyExpression,
  copiedExpression,
  isLast,
}: OutputTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="pl-4">
      {/* Object key line with toggle */}
      <div
        className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-slate-50 rounded -ml-3 pl-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-slate-400" />
        ) : (
          <ChevronRight className="w-3 h-3 text-slate-400" />
        )}
        <span className="text-orange-600">&quot;{label}&quot;</span>
        <span className="text-slate-400">:</span>
        <span className="text-slate-500 ml-1">{isExpanded ? "{" : "{...}"}</span>
        {!isExpanded && !isLast && <span className="text-slate-400">,</span>}
      </div>

      {/* Nested fields */}
      {isExpanded && (
        <>
          {fields.map((field, i) => {
            const expression = `\${${nodeLabel}.formData.${field.id}}`;
            const fieldIsLast = i === fields.length - 1;
            const fieldType = field.type === "number" ? "number" :
                             field.type === "checkbox" ? "boolean" : "string";

            return (
              <div
                key={field.id}
                className="group pl-4 py-0.5 hover:bg-emerald-50 rounded cursor-pointer flex items-center gap-1"
                onClick={() => copyExpression(expression)}
                title={field.label ? `${field.label}\nClick to copy: ${expression}` : `Click to copy: ${expression}`}
              >
                <span className="text-emerald-600">&quot;{field.id}&quot;</span>
                <span className="text-slate-400">:</span>
                <span className={`ml-1 ${
                  fieldType === "string" ? "text-green-600" :
                  fieldType === "number" ? "text-blue-600" :
                  fieldType === "boolean" ? "text-purple-600" :
                  "text-slate-600"
                }`}>
                  {fieldType === "string" ? `"${field.placeholder || '...'}"` :
                   fieldType === "number" ? "0" :
                   fieldType === "boolean" ? "false" :
                   "..."}
                </span>
                {!fieldIsLast && <span className="text-slate-400">,</span>}
                {copiedExpression === expression ? (
                  <Check className="w-3 h-3 text-green-500 ml-auto opacity-100" />
                ) : (
                  <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
                )}
              </div>
            );
          })}
          <div className="text-slate-500 pl-0">{"}"}{!isLast && ","}</div>
        </>
      )}
    </div>
  );
}

// Input tree node component for grouping variables by source node
interface InputNodeTreeProps {
  nodeLabel: string;
  regularFields: AvailableVariable[];
  formDataFields: AvailableVariable[];
  copyExpression: (expr: string) => void;
  copiedExpression: string | null;
}

// Live data tree component for showing real execution data (n8n-style)
interface LiveDataTreeProps {
  nodeLabel: string;
  data: any;
  copyExpression: (expr: string) => void;
  copiedExpression: string | null;
}

function LiveDataTree({
  nodeLabel,
  data,
  copyExpression,
  copiedExpression,
}: LiveDataTreeProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Count items if data is an array
  const itemCount = Array.isArray(data) ? data.length : null;

  // Render a value with clickable paths for copying expressions
  const renderValue = (value: any, path: string, _depth: number = 0): React.ReactNode => {
    if (value === null) return <span className="text-slate-400">null</span>;
    if (value === undefined) return <span className="text-slate-400">undefined</span>;

    if (typeof value === "string") {
      const displayValue = value.length > 50 ? value.substring(0, 50) + "..." : value;
      return (
        <span
          className="text-green-600 cursor-pointer hover:bg-green-100 rounded px-0.5"
          onClick={(e) => { e.stopPropagation(); copyExpression(`\${${nodeLabel}.${path}}`); }}
          title={`Click to copy: \${${nodeLabel}.${path}}`}
        >
          &quot;{displayValue}&quot;
          {copiedExpression === `\${${nodeLabel}.${path}}` && (
            <Check className="w-3 h-3 text-green-500 inline ml-1" />
          )}
        </span>
      );
    }

    if (typeof value === "number") {
      return (
        <span
          className="text-blue-600 cursor-pointer hover:bg-blue-100 rounded px-0.5"
          onClick={(e) => { e.stopPropagation(); copyExpression(`\${${nodeLabel}.${path}}`); }}
          title={`Click to copy: \${${nodeLabel}.${path}}`}
        >
          {value}
          {copiedExpression === `\${${nodeLabel}.${path}}` && (
            <Check className="w-3 h-3 text-green-500 inline ml-1" />
          )}
        </span>
      );
    }

    if (typeof value === "boolean") {
      return (
        <span
          className="text-purple-600 cursor-pointer hover:bg-purple-100 rounded px-0.5"
          onClick={(e) => { e.stopPropagation(); copyExpression(`\${${nodeLabel}.${path}}`); }}
          title={`Click to copy: \${${nodeLabel}.${path}}`}
        >
          {value.toString()}
          {copiedExpression === `\${${nodeLabel}.${path}}` && (
            <Check className="w-3 h-3 text-green-500 inline ml-1" />
          )}
        </span>
      );
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="text-slate-400">[]</span>;
      return (
        <span className="text-pink-600">
          [{value.length} items]
        </span>
      );
    }

    if (typeof value === "object") {
      const keys = Object.keys(value);
      if (keys.length === 0) return <span className="text-slate-400">{"{}"}</span>;
      return (
        <span className="text-orange-600">
          {"{"}...{"}"}
        </span>
      );
    }

    return <span className="text-slate-600">{String(value)}</span>;
  };

  // Render object entries recursively (limited depth)
  const renderObjectEntries = (obj: any, basePath: string, depth: number = 0): React.ReactNode[] => {
    if (depth > 2) return []; // Limit depth
    const entries = Object.entries(obj);

    return entries.slice(0, 10).map(([key, value], i) => {
      const path = basePath ? `${basePath}.${key}` : key;
      const isLast = i === Math.min(entries.length - 1, 9);

      return (
        <div key={key} className="pl-3 py-0.5 hover:bg-green-50 rounded">
          <span className="text-green-700">&quot;{key}&quot;</span>
          <span className="text-slate-400">: </span>
          {renderValue(value, path, depth)}
          {!isLast && <span className="text-slate-400">,</span>}
        </div>
      );
    }).concat(entries.length > 10 ? [
      <div key="more" className="pl-3 text-slate-400 text-[10px]">
        ... {entries.length - 10} more fields
      </div>
    ] : []);
  };

  return (
    <div className="mb-3 font-mono text-xs bg-green-50 rounded-lg border border-green-200 p-2">
      {/* Node header with LIVE badge */}
      <div
        className="flex items-center gap-1.5 cursor-pointer hover:bg-green-100 rounded p-1 -m-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-green-500" />
        )}
        <span className="text-green-700 font-semibold">{nodeLabel}</span>
        <span className="text-[9px] text-green-600 bg-green-200 px-1.5 py-0.5 rounded-full font-semibold">LIVE</span>
        {itemCount !== null && (
          <span className="text-[9px] text-green-500 ml-auto">{itemCount} items</span>
        )}
      </div>

      {isExpanded && (
        <div className="mt-1 pl-1 border-l-2 border-green-200 ml-1.5">
          {typeof data === "object" && data !== null ? (
            renderObjectEntries(data, "")
          ) : (
            <div className="pl-3 py-0.5">
              {renderValue(data, "output", 0)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InputNodeTree({
  nodeLabel,
  regularFields,
  formDataFields,
  copyExpression,
  copiedExpression,
}: InputNodeTreeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isFormDataExpanded, setIsFormDataExpanded] = useState(true);

  const totalFields = regularFields.length + formDataFields.length;

  return (
    <div className="mb-3 font-mono text-xs bg-white rounded-lg border border-slate-200 p-2">
      {/* Node header with toggle */}
      <div
        className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 rounded p-1 -m-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        )}
        <span className="text-blue-600 font-semibold">{nodeLabel}</span>
        <span className="text-slate-400 text-[10px] ml-auto">{totalFields}</span>
      </div>

      {isExpanded && (
        <div className="mt-1 pl-2 border-l-2 border-slate-100 ml-1.5">
          {/* Regular fields */}
          {regularFields.map((v, i) => {
            // Show the field name (not description) so users know the actual variable name
            const displayName = v.field.name;
            return (
              <div
                key={i}
                className="group py-0.5 hover:bg-blue-50 rounded cursor-pointer flex items-center gap-1 px-1"
                onClick={() => copyExpression(v.expression)}
                title={v.field.description ? `${v.field.description}\nClick to copy: ${v.expression}` : `Click to copy: ${v.expression}`}
              >
                <span className="text-blue-600">&quot;{displayName}&quot;</span>
                <span className="text-slate-400">:</span>
                <span className={`ml-1 ${
                  v.field.type === "string" ? "text-green-600" :
                  v.field.type === "number" ? "text-blue-600" :
                  v.field.type === "boolean" ? "text-purple-600" :
                  v.field.type === "object" ? "text-orange-600" :
                  v.field.type === "array" ? "text-pink-600" :
                  "text-slate-600"
                }`}>
                  {v.field.type === "string" ? '"..."' :
                   v.field.type === "number" ? "0" :
                   v.field.type === "boolean" ? "true" :
                   v.field.type === "object" ? "{...}" :
                   v.field.type === "array" ? "[...]" :
                   "..."}
                </span>
                {copiedExpression === v.expression ? (
                  <Check className="w-3 h-3 text-green-500 ml-auto" />
                ) : (
                  <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
                )}
              </div>
            );
          })}

          {/* Form data fields (nested) */}
          {formDataFields.length > 0 && (
            <div className="mt-1">
              <div
                className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-slate-50 rounded px-1"
                onClick={() => setIsFormDataExpanded(!isFormDataExpanded)}
              >
                {isFormDataExpanded ? (
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                )}
                <span className="text-orange-600">&quot;formData&quot;</span>
                <span className="text-slate-400">:</span>
                <span className="text-slate-500 ml-1">{isFormDataExpanded ? "{" : "{...}"}</span>
              </div>

              {isFormDataExpanded && (
                <div className="pl-4">
                  {formDataFields.map((v, i) => {
                    // Show the field ID (from name) so users know the actual variable name
                    // field.name is "formData.fieldId", so extract just the fieldId
                    const fieldId = v.field.name.replace('formData.', '');
                    return (
                      <div
                        key={i}
                        className="group py-0.5 hover:bg-blue-50 rounded cursor-pointer flex items-center gap-1 px-1"
                        onClick={() => copyExpression(v.expression)}
                        title={v.field.description ? `${v.field.description}\nClick to copy: ${v.expression}` : `Click to copy: ${v.expression}`}
                      >
                        <span className="text-blue-600">&quot;{fieldId}&quot;</span>
                        <span className="text-slate-400">:</span>
                        <span className={`ml-1 ${
                          v.field.type === "string" ? "text-green-600" :
                          v.field.type === "number" ? "text-blue-600" :
                          v.field.type === "boolean" ? "text-purple-600" :
                          "text-slate-600"
                        }`}>
                          {v.field.type === "string" ? '"..."' :
                           v.field.type === "number" ? "0" :
                           v.field.type === "boolean" ? "false" :
                           "..."}
                        </span>
                        {copiedExpression === v.expression ? (
                          <Check className="w-3 h-3 text-green-500 ml-auto" />
                        ) : (
                          <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
                        )}
                      </div>
                    );
                  })}
                  <div className="text-slate-500">{"}"}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function NodeConfigPanel() {
  const { currentView } = useNavigationStore();
  const flowStore = useFlowStore();
  const projectStore = useProjectStore();
  const { setTabDirty } = useTabsStore();
  const { sessionState, pinnedData, pinNodeData, unpinNodeData } = useDebugStore();
  const [showFormPreview, setShowFormPreview] = useState(false);
  const [copiedExpression, setCopiedExpression] = useState<string | null>(null);
  const [excelSheets, setExcelSheets] = useState<string[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Determine which store to use based on current view
  const isProjectMode = currentView === "project";

  // Get selectedNode from flowStore (shared between modes)
  const selectedNode = flowStore.selectedNode;
  const setSelectedNode = flowStore.setSelectedNode;

  // Get nodes and edges from appropriate store
  const activeBot = isProjectMode ? projectStore.bots.get(projectStore.activeBotId || "") : null;
  const activeBotId = projectStore.activeBotId;
  const nodes = isProjectMode ? (activeBot?.nodes || []) : flowStore.nodes;
  const edges = isProjectMode ? (activeBot?.edges || []) : flowStore.edges;

  // Update function depends on mode
  const updateNode = (id: string, data: Partial<FlowNode["data"]>) => {
    console.log("updateNode called", { id, data, isProjectMode, hasActiveBot: !!activeBot, activeBotId });
    if (isProjectMode && activeBot) {
      const updatedNodes = activeBot.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...data } } : node
      );
      projectStore.updateActiveBotNodes(updatedNodes);

      // Mark tab as dirty
      if (activeBotId) {
        console.log("Setting tab dirty:", `bot-${activeBotId}`);
        setTabDirty(`bot-${activeBotId}`, true);
      }

      // Also update selectedNode in flowStore
      if (selectedNode?.id === id) {
        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, ...data } });
      }
    } else {
      flowStore.updateNode(id, data);
    }
  };

  const node = selectedNode ? nodes.find(n => n.id === selectedNode.id) ?? null : null;

  // Get all predecessor nodes (nodes that come before this one in the flow)
  const predecessorNodes = useMemo(() => {
    if (!node) return [];

    const predecessors: FlowNode[] = [];
    const visited = new Set<string>();

    function findPredecessors(nodeId: string) {
      const incomingEdges = edges.filter(e => e.target === nodeId);

      for (const edge of incomingEdges) {
        if (!visited.has(edge.source)) {
          visited.add(edge.source);
          const sourceNode = nodes.find(n => n.id === edge.source);
          if (sourceNode) {
            predecessors.push(sourceNode);
            findPredecessors(edge.source);
          }
        }
      }
    }

    findPredecessors(node.id);
    return predecessors;
  }, [node, nodes, edges]);

  // Check if this node is connected via an error (orange) edge
  const hasErrorConnection = useMemo(() => {
    if (!node) return false;
    return edges.some(e => e.target === node.id && e.sourceHandle === "error");
  }, [node, edges]);

  // Get available variables from predecessor nodes
  const availableVariables = useMemo((): AvailableVariable[] => {
    const variables: AvailableVariable[] = [];

    // If connected via error edge, add error variables (global Robot Framework vars)
    if (hasErrorConnection) {
      variables.push({
        nodeId: "_system",
        nodeLabel: "Error Info",
        nodeType: "system.error",
        field: {
          name: "LAST_ERROR",
          type: "string",
          description: "The error message from the failed node",
        },
        expression: "${LAST_ERROR}",
      });
      variables.push({
        nodeId: "_system",
        nodeLabel: "Error Info",
        nodeType: "system.error",
        field: {
          name: "LAST_ERROR_NODE",
          type: "string",
          description: "The ID of the node that failed",
        },
        expression: "${LAST_ERROR_NODE}",
      });
      variables.push({
        nodeId: "_system",
        nodeLabel: "Error Info",
        nodeType: "system.error",
        field: {
          name: "LAST_ERROR_TYPE",
          type: "string",
          description: "The type of node that failed (e.g., excel.read_range)",
        },
        expression: "${LAST_ERROR_TYPE}",
      });
    }

    for (const predNode of predecessorNodes) {
      const template = getNodeTemplate(predNode.data.nodeType);

      // Add per-node state variables (output, error, status) for all nodes
      // These are stored in Robot Framework as &{NODE_<node_id>} dictionaries
      variables.push({
        nodeId: predNode.id,
        nodeLabel: predNode.data.label,
        nodeType: predNode.data.nodeType,
        field: {
          name: "output",
          type: "string",
          description: "Main output/result from this node",
        },
        expression: `\${${predNode.data.label}.output}`,
      });
      variables.push({
        nodeId: predNode.id,
        nodeLabel: predNode.data.label,
        nodeType: predNode.data.nodeType,
        field: {
          name: "error",
          type: "string",
          description: "Error message if node failed",
        },
        expression: `\${${predNode.data.label}.error}`,
      });
      variables.push({
        nodeId: predNode.id,
        nodeLabel: predNode.data.label,
        nodeType: predNode.data.nodeType,
        field: {
          name: "status",
          type: "string",
          description: "Node execution status (pending, success, error)",
        },
        expression: `\${${predNode.data.label}.status}`,
      });

      // Add template-defined output schema fields
      if (template?.outputSchema) {
        for (const field of template.outputSchema) {
          variables.push({
            nodeId: predNode.id,
            nodeLabel: predNode.data.label,
            nodeType: predNode.data.nodeType,
            field,
            expression: `\${${predNode.data.label}.${field.name}}`,
          });
        }
      }

      // For Form Trigger, also add dynamic fields
      if (predNode.data.nodeType === "trigger.form" && predNode.data.config.fields) {
        const formFields = predNode.data.config.fields as FormFieldDefinition[];
        for (const formField of formFields) {
          variables.push({
            nodeId: predNode.id,
            nodeLabel: predNode.data.label,
            nodeType: predNode.data.nodeType,
            field: {
              name: `formData.${formField.id}`,
              type: formField.type === "number" ? "number" : formField.type === "checkbox" ? "boolean" : "string",
              description: formField.label,
            },
            expression: `\${${predNode.data.label}.formData.${formField.id}}`,
          });
        }
      }

      // For Excel Read nodes, add dynamic column fields from column_names config
      const isExcelReadType = predNode.data.nodeType === "excel.read_range" || predNode.data.nodeType === "excel.read_csv";
      if (isExcelReadType && predNode.data.config?.column_names) {
        const columnNames = predNode.data.config.column_names as string;
        if (typeof columnNames === "string" && columnNames.trim()) {
          const columns = columnNames.split(",").map(c => c.trim()).filter(c => c.length > 0);
          for (const colName of columns) {
            variables.push({
              nodeId: predNode.id,
              nodeLabel: predNode.data.label,
              nodeType: predNode.data.nodeType,
              field: {
                name: `row.${colName}`,
                type: "string",
                description: `Column: ${colName}`,
              },
              expression: `\${${predNode.data.label}.row.${colName}}`,
            });
          }
        }
      }

      // For Secrets/Vault nodes, add dynamic vault variables from secrets config
      const isSecretsNode = predNode.data.nodeType.startsWith("secrets.");
      if (isSecretsNode && predNode.data.config?.secrets) {
        const secretsConfig = predNode.data.config.secrets as string;
        if (typeof secretsConfig === "string" && secretsConfig.trim()) {
          const secretNames = secretsConfig.split("\n").map(s => s.trim()).filter(s => s.length > 0);
          for (const secretName of secretNames) {
            // Extract just the secret name (last part after any slashes for AWS ARN-style paths)
            const displayName = secretName.includes("/") ? secretName.split("/").pop() || secretName : secretName;
            variables.push({
              nodeId: predNode.id,
              nodeLabel: predNode.data.label,
              nodeType: predNode.data.nodeType,
              field: {
                name: `vault.${displayName}`,
                type: "string",
                description: `Secret: ${secretName}`,
              },
              expression: `\${vault.${displayName}}`,
            });
          }
        }
      }
    }

    return variables;
  }, [predecessorNodes, hasErrorConnection]);

  // Check if this is an Excel node and load sheets when file path changes
  const isExcelNode = node?.data.nodeType?.startsWith("excel.");

  // Get Excel file path - either from this node or from a predecessor excel.open node
  const excelFilePath = useMemo(() => {
    if (!node) return null;

    // First check if this node has its own path configured
    const ownPath = node.data.config?.path || node.data.config?.file_path;
    if (ownPath) return ownPath;

    // If not, look for a predecessor excel.open node
    const excelOpenNode = predecessorNodes.find(n => n.data.nodeType === "excel.open");
    if (excelOpenNode) {
      return excelOpenNode.data.config?.path || excelOpenNode.data.config?.file_path;
    }

    return null;
  }, [node, predecessorNodes]);

  useEffect(() => {
    if (!isExcelNode || !excelFilePath) {
      setExcelSheets([]);
      return;
    }

    // Check if it's an Excel file
    const isExcelFile = /\.(xlsx?|xlsm|xlsb)$/i.test(excelFilePath);
    if (!isExcelFile) {
      setExcelSheets([]);
      return;
    }

    const loadSheets = async () => {
      setLoadingSheets(true);
      try {
        const sheets = await invoke<string[]>("get_excel_sheets", { filePath: excelFilePath });
        setExcelSheets(sheets);
      } catch (err) {
        console.error("Failed to load Excel sheets:", err);
        setExcelSheets([]);
      } finally {
        setLoadingSheets(false);
      }
    };

    loadSheets();
  }, [isExcelNode, excelFilePath]);

  // Get dynamic Excel column fields for output (from column_names config)
  // This must be before any early returns to follow Rules of Hooks
  const isExcelReadNode = node?.data.nodeType === "excel.read_range" || node?.data.nodeType === "excel.read_csv";
  const columnNamesConfig = node?.data.config?.column_names;
  const dynamicExcelColumns: { id: string; label: string }[] = useMemo(() => {
    if (!isExcelReadNode) return [];
    if (!columnNamesConfig || typeof columnNamesConfig !== "string") return [];

    return columnNamesConfig
      .split(",")
      .map(name => name.trim())
      .filter(name => name.length > 0)
      .map(name => ({
        id: name,
        label: name,
      }));
  }, [isExcelReadNode, columnNamesConfig]);

  // Get dynamic secrets fields for output (from secrets config in vault nodes)
  const isSecretsNode = node?.data.nodeType?.startsWith("secrets.");
  const secretsConfig = node?.data.config?.secrets;
  const dynamicSecrets: { id: string; label: string; fullPath: string }[] = useMemo(() => {
    if (!isSecretsNode) return [];
    if (!secretsConfig || typeof secretsConfig !== "string") return [];

    return secretsConfig
      .split("\n")
      .map(name => name.trim())
      .filter(name => name.length > 0)
      .map(name => {
        // Extract just the secret name (last part after any slashes for AWS ARN-style paths)
        const displayName = name.includes("/") ? name.split("/").pop() || name : name;
        return {
          id: displayName,
          label: displayName,
          fullPath: name,
        };
      });
  }, [isSecretsNode, secretsConfig]);

  if (!node) return null;

  const template = getNodeTemplate(node.data.nodeType);
  if (!template) return null;

  const isFormTrigger = node.data.nodeType === "trigger.form";
  const isTrigger = node.data.category === "trigger";

  // Config nodes that don't process data flow - they provide configuration only
  const isConfigNode = [
    "ai.model",
    "ai.embeddings",
    "vectordb.memory",
    "ms365.connection",
  ].includes(node.data.nodeType);

  const hasInputPanel = !isTrigger && !isConfigNode && availableVariables.length > 0;
  const hasOutputPanel = template.outputSchema && template.outputSchema.length > 0;

  // Get real output data from debug execution if available
  const nodeExecution = sessionState?.nodeExecutions?.[node.id];
  const realOutputData = nodeExecution?.output;
  const nodeError = nodeExecution?.error;
  const nodeStatus = nodeExecution?.status;

  const handleConfigChange = (field: string, value: any) => {
    updateNode(node.id, {
      config: {
        ...node.data.config,
        [field]: value,
      },
    });
  };

  const handleLabelChange = (label: string) => {
    updateNode(node.id, { label });
  };

  const copyExpression = (expression: string) => {
    navigator.clipboard.writeText(expression);
    setCopiedExpression(expression);
    setTimeout(() => setCopiedExpression(null), 2000);
  };

  // Test connection for connection nodes (MS365, etc.)
  const isConnectionNode = node.data.nodeType === "ms365.connection";
  const canTestConnection = isConnectionNode &&
    node.data.config.tenant_id &&
    node.data.config.client_id &&
    node.data.config.client_secret;

  const handleTestConnection = async () => {
    if (!canTestConnection) return;

    setTestingConnection(true);
    setConnectionTestResult(null);

    try {
      const result = await invoke<{ success: boolean; message: string }>("test_ms365_connection", {
        tenantId: node.data.config.tenant_id,
        clientId: node.data.config.client_id,
        clientSecret: node.data.config.client_secret,
      });

      setConnectionTestResult(result);

      // Update both values in a single call to avoid race condition
      updateNode(node.id, {
        config: {
          ...node.data.config,
          connectionTested: result.success,
          connectionTestedAt: result.success ? new Date().toISOString() : node.data.config.connectionTestedAt,
        },
      });
    } catch (err) {
      setConnectionTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Connection test failed",
      });
      updateNode(node.id, {
        config: {
          ...node.data.config,
          connectionTested: false,
        },
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // Get dynamic form fields for output
  const dynamicFormFields = isFormTrigger && node.data.config.fields
    ? (node.data.config.fields as FormFieldDefinition[])
    : [];

  const panel = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[9998]"
        onClick={() => setSelectedNode(null)}
      />

      {/* Modal Container - Centered with margins */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8 pointer-events-none">
        <div
          data-properties-panel="true"
          id="node-config-panel"
          className="bg-card border rounded-2xl shadow-2xl overflow-hidden pointer-events-auto flex w-full max-w-4xl"
          style={{ maxHeight: 'calc(100vh - 120px)' }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* INPUT PANEL - Variables from previous nodes (Tree View) */}
          {hasInputPanel && (() => {
            // Check if any predecessor has live data
            const hasLiveInputData = predecessorNodes.some(predNode =>
              sessionState?.nodeExecutions?.[predNode.id]?.output !== undefined
            );

            return (
              <div className="w-64 border-r bg-slate-50/80 flex flex-col flex-shrink-0">
                <div className={`px-4 py-3 border-b flex items-center gap-2 ${hasLiveInputData ? 'bg-green-50/80' : 'bg-blue-50/80'}`}>
                  <div className={`w-2.5 h-2.5 rounded-full ${hasLiveInputData ? 'bg-green-500 animate-pulse' : 'bg-blue-500'}`} />
                  <span className={`text-xs font-semibold uppercase tracking-wide ${hasLiveInputData ? 'text-green-700' : 'text-blue-700'}`}>Input</span>
                  {hasLiveInputData && (
                    <span className="text-[9px] text-green-600 bg-green-200 px-1.5 py-0.5 rounded-full font-semibold">LIVE</span>
                  )}
                  <span className={`text-[10px] ml-auto px-1.5 py-0.5 rounded-full ${hasLiveInputData ? 'text-green-500 bg-green-100' : 'text-blue-500 bg-blue-100'}`}>
                    {availableVariables.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  {/* Group variables by node - show LIVE data if available */}
                  {predecessorNodes.map((predNode) => {
                    const nodeVars = availableVariables.filter(v => v.nodeId === predNode.id);
                    const predExecution = sessionState?.nodeExecutions?.[predNode.id];
                    const hasLiveData = predExecution?.output !== undefined;

                    if (nodeVars.length === 0 && !hasLiveData) return null;

                    // Show LIVE data if available (n8n-style)
                    if (hasLiveData) {
                      return (
                        <LiveDataTree
                          key={predNode.id}
                          nodeLabel={predNode.data.label}
                          data={predExecution.output}
                          copyExpression={copyExpression}
                          copiedExpression={copiedExpression}
                        />
                      );
                    }

                    // Otherwise show schema
                    const regularFields = nodeVars.filter(v => !v.field.name.startsWith('formData.'));
                    const formDataFields = nodeVars.filter(v => v.field.name.startsWith('formData.'));

                    return (
                      <InputNodeTree
                        key={predNode.id}
                        nodeLabel={predNode.data.label}
                        regularFields={regularFields}
                        formDataFields={formDataFields}
                        copyExpression={copyExpression}
                        copiedExpression={copiedExpression}
                      />
                    );
                  })}

                  {/* Legend */}
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <p className="text-[10px] text-slate-400">
                      {hasLiveInputData ? 'Showing real execution data' : 'Click any field to copy expression'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Empty Input Panel placeholder for triggers */}
          {!hasInputPanel && !isTrigger && (
            <div className="w-48 border-r bg-slate-50/50 flex flex-col flex-shrink-0">
              <div className="px-4 py-3 border-b bg-blue-50/50 flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-300" />
                <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Input</span>
              </div>
              <div className="flex-1 flex items-center justify-center p-4">
                <div className="text-center text-slate-400">
                  <Icon name="GitBranch" size={24} className="mx-auto mb-2 opacity-40" />
                  <p className="text-xs">No variables</p>
                  <p className="text-[10px] mt-1 opacity-70">Connect previous nodes</p>
                </div>
              </div>
            </div>
          )}

          {/* MAIN CONFIG PANEL */}
          <div className="flex-1 flex flex-col min-w-0 bg-white">
            {/* Header */}
            <div className="px-5 py-4 border-b bg-white flex-shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    isTrigger ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-600"
                  }`}>
                    <Icon name={template.icon} size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-800">{template.label}</h3>
                    <p className="text-xs text-slate-400 font-mono">{template.type}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {isFormTrigger && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowFormPreview(true)}
                      className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                      title="Preview"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedNode(null)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Config Form - Scrollable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Node Label */}
              <div className="space-y-2">
                <Label htmlFor="node-name" className="text-sm font-medium">Node Name</Label>
                <Input
                  id="node-name"
                  type="text"
                  value={node.data.label}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  className="h-9"
                />
              </div>

              {/* Divider */}
              {template.configSchema.length > 0 && (
                <div className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Configuration</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
              )}

              {/* Config Fields */}
              {template.configSchema.map((field) => {
                // Hide column_names field if header is true (only show when header is false)
                if (field.name === "column_names" && node.data.config.header !== false) {
                  return null;
                }

                // Handle visibleWhen conditional visibility
                if (field.visibleWhen) {
                  const dependentFieldValue = node.data.config[field.visibleWhen.field];
                  const expectedValue = field.visibleWhen.value;

                  // Check if the dependent field matches the expected value
                  if (Array.isArray(expectedValue)) {
                    // If expectedValue is an array, check if current value is in the array
                    if (!expectedValue.includes(dependentFieldValue)) {
                      return null;
                    }
                  } else {
                    // Single value comparison
                    if (dependentFieldValue !== expectedValue) {
                      return null;
                    }
                  }
                }

                // Generate unique key for fields with same name but different visibleWhen
                const fieldKey = field.visibleWhen
                  ? `${field.name}-${Array.isArray(field.visibleWhen.value) ? field.visibleWhen.value.join('-') : field.visibleWhen.value}`
                  : field.name;

                return (
                <div key={fieldKey} className="space-y-2">
                  <Label htmlFor={field.name} className="text-sm font-medium">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>

                  {field.type === "text" && (
                    (() => {
                      const isPathField = /path|file|directory|folder/i.test(field.name) ||
                                         /path|file|directory|folder/i.test(field.label);
                      const isSheetField = isExcelNode && /^sheet$/i.test(field.name);

                      const handleBrowse = async () => {
                        try {
                          const selected = await open({
                            multiple: false,
                            directory: /directory|folder/i.test(field.name) || /directory|folder/i.test(field.label),
                            filters: isExcelNode ? [{ name: 'Excel', extensions: ['xlsx', 'xls', 'xlsm', 'xlsb'] }] : undefined,
                          });
                          if (selected && typeof selected === 'string') {
                            handleConfigChange(field.name, selected);
                          }
                        } catch (err) {
                          console.error('Failed to open file dialog:', err);
                        }
                      };

                      // Sheet field with dynamic sheets from Excel file
                      if (isSheetField && excelSheets.length > 0) {
                        return (
                          <Select
                            value={node.data.config[field.name] || ""}
                            onValueChange={(value) => handleConfigChange(field.name, value)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder={loadingSheets ? "Loading sheets..." : "Select sheet..."} />
                            </SelectTrigger>
                            <SelectContent>
                              {excelSheets.map((sheet) => (
                                <SelectItem key={sheet} value={sheet}>
                                  {sheet}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        );
                      }

                      // Sheet field but no sheets loaded yet - show input with hint
                      if (isSheetField) {
                        return (
                          <Input
                            id={field.name}
                            type="text"
                            value={node.data.config[field.name] || ""}
                            onChange={(e) => handleConfigChange(field.name, e.target.value)}
                            placeholder={loadingSheets ? "Loading sheets..." : "Select a file first or type sheet name"}
                            className="h-9"
                            disabled={loadingSheets}
                          />
                        );
                      }

                      return isPathField ? (
                        <div className="flex gap-2">
                          <Input
                            id={field.name}
                            type="text"
                            value={node.data.config[field.name] || ""}
                            onChange={(e) => handleConfigChange(field.name, e.target.value)}
                            placeholder={field.placeholder}
                            className="h-9 flex-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleBrowse}
                            className="h-9 w-9 flex-shrink-0"
                            title="Browse..."
                          >
                            <FolderOpen className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Input
                          id={field.name}
                          type="text"
                          value={node.data.config[field.name] || ""}
                          onChange={(e) => handleConfigChange(field.name, e.target.value)}
                          placeholder={field.placeholder}
                          className="h-9"
                        />
                      );
                    })()
                  )}

                  {field.type === "textarea" && (
                    <Textarea
                      id={field.name}
                      value={node.data.config[field.name] || ""}
                      onChange={(e) => handleConfigChange(field.name, e.target.value)}
                      placeholder={field.placeholder}
                      rows={3}
                      className="resize-none"
                    />
                  )}

                  {field.type === "number" && (
                    <Input
                      id={field.name}
                      type="number"
                      value={node.data.config[field.name] ?? 0}
                      onChange={(e) => handleConfigChange(field.name, parseFloat(e.target.value) || 0)}
                      placeholder={field.placeholder}
                      className="h-9"
                    />
                  )}

                  {field.type === "boolean" && (
                    <div className="flex items-center gap-3">
                      <Switch
                        id={field.name}
                        checked={node.data.config[field.name] ?? field.default ?? false}
                        onCheckedChange={(checked) => handleConfigChange(field.name, checked)}
                      />
                      <Label htmlFor={field.name} className="text-sm font-normal text-slate-500">
                        {(node.data.config[field.name] ?? field.default ?? false) ? "Enabled" : "Disabled"}
                      </Label>
                    </div>
                  )}

                  {field.type === "select" && field.options && (
                    <Select
                      value={node.data.config[field.name] ?? field.default}
                      onValueChange={(value) => handleConfigChange(field.name, value)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {field.type === "password" && (
                    <Input
                      id={field.name}
                      type="password"
                      value={node.data.config[field.name] || ""}
                      onChange={(e) => handleConfigChange(field.name, e.target.value)}
                      placeholder={field.placeholder}
                      className="h-9"
                    />
                  )}

                  {field.type === "form-builder" && (
                    <FormBuilder
                      value={(node.data.config[field.name] as FormFieldDefinition[]) || []}
                      onChange={(fields) => handleConfigChange(field.name, fields)}
                    />
                  )}

                  {field.type === "validation-builder" && (
                    <ValidationBuilder
                      value={(node.data.config[field.name] as ValidationRule[]) || []}
                      onChange={(rules) => handleConfigChange(field.name, rules)}
                      availableFields={availableVariables
                        .filter(v => !["output", "error", "status", "LAST_ERROR", "LAST_ERROR_NODE", "LAST_ERROR_TYPE"].includes(v.field.name))
                        .map(v => v.field.name)}
                    />
                  )}

                  {field.type === "protection-builder" && (
                    <ProtectionBuilder
                      value={(node.data.config[field.name] as ProtectionRule[]) || []}
                      onChange={(rules) => handleConfigChange(field.name, rules)}
                      availableFields={availableVariables
                        .filter(v => !["output", "error", "status", "LAST_ERROR", "LAST_ERROR_NODE", "LAST_ERROR_TYPE"].includes(v.field.name))
                        .map(v => v.field.name)}
                      dataType={node.data.nodeType.includes("phi") ? "phi" : "pii"}
                    />
                  )}
                </div>
                );
              })}

              {/* Test Connection Button for connection nodes */}
              {isConnectionNode && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                  <Button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={!canTestConnection || testingConnection}
                    className={`w-full ${
                      connectionTestResult?.success
                        ? "bg-emerald-500 hover:bg-emerald-600"
                        : node.data.config.connectionTested
                        ? "bg-emerald-500 hover:bg-emerald-600"
                        : ""
                    }`}
                  >
                    {testingConnection ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Testing Connection...
                      </>
                    ) : connectionTestResult?.success || node.data.config.connectionTested ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Connection Verified
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Test Connection
                      </>
                    )}
                  </Button>

                  {/* Connection test result message */}
                  {connectionTestResult && (
                    <div className={`p-3 rounded-lg text-sm ${
                      connectionTestResult.success
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}>
                      <div className="flex items-start gap-2">
                        {connectionTestResult.success ? (
                          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        )}
                        <span>{connectionTestResult.message}</span>
                      </div>
                    </div>
                  )}

                  {/* Show when last tested */}
                  {node.data.config.connectionTested && node.data.config.connectionTestedAt && !connectionTestResult && (
                    <p className="text-xs text-slate-500 text-center">
                      Last verified: {new Date(node.data.config.connectionTestedAt).toLocaleString()}
                    </p>
                  )}

                  {!canTestConnection && (
                    <p className="text-xs text-slate-400 text-center">
                      Fill in all required fields to test the connection
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t flex-shrink-0">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-500 leading-relaxed">{template.description}</p>
              </div>
            </div>
          </div>

          {/* OUTPUT PANEL - What this node produces (Tree View) */}
          {hasOutputPanel && (() => {
            const nodePinnedData = pinnedData.get(node.id);
            const isPinned = !!nodePinnedData;
            const displayData = isPinned ? nodePinnedData.data : realOutputData;
            const hasData = displayData !== undefined;
            const hasError = nodeStatus === "error" && nodeError;

            // Determine header style based on state
            const getHeaderStyle = () => {
              if (hasError) return 'bg-red-50/80';
              if (isPinned) return 'bg-amber-50/80';
              if (hasData) return 'bg-green-50/80';
              return 'bg-emerald-50/80';
            };

            const getDotStyle = () => {
              if (hasError) return 'bg-red-500';
              if (isPinned) return 'bg-amber-500';
              if (hasData) return 'bg-green-500 animate-pulse';
              return 'bg-emerald-500';
            };

            return (
            <div className="w-64 border-l bg-slate-50/80 flex flex-col flex-shrink-0">
              <div className={`px-4 py-3 border-b flex items-center gap-2 ${getHeaderStyle()}`}>
                <div className={`w-2.5 h-2.5 rounded-full ${getDotStyle()}`} />
                <span className={`text-xs font-semibold uppercase tracking-wide ${hasError ? 'text-red-700' : isPinned ? 'text-amber-700' : 'text-emerald-700'}`}>Output</span>
                {hasError && (
                  <span className="text-[9px] text-red-600 bg-red-200 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                    <XCircle className="w-2.5 h-2.5" />
                    ERROR
                  </span>
                )}
                {!hasError && isPinned && (
                  <span className="text-[9px] text-amber-600 bg-amber-200 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                    <Pin className="w-2.5 h-2.5" />
                    PINNED
                  </span>
                )}
                {!hasError && !isPinned && hasData && (
                  <span className="text-[9px] text-green-600 bg-green-200 px-1.5 py-0.5 rounded-full font-semibold">LIVE</span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  {/* Pin/Unpin button */}
                  {hasData && (
                    <button
                      onClick={() => {
                        if (isPinned) {
                          unpinNodeData(node.id);
                        } else {
                          pinNodeData(node.id, realOutputData, node.data.label);
                        }
                      }}
                      className={`p-1 rounded transition-colors ${
                        isPinned
                          ? 'text-amber-600 hover:bg-amber-100'
                          : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                      }`}
                      title={isPinned ? 'Unpin data (use live data)' : 'Pin data (freeze for testing)'}
                    >
                      {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isPinned ? 'text-amber-500 bg-amber-100' : 'text-emerald-500 bg-emerald-100'}`}>
                    {(template.outputSchema?.length || 0) + dynamicFormFields.length + dynamicExcelColumns.length + dynamicSecrets.length}
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {/* Show error details if node failed */}
                {hasError ? (
                  <div className="space-y-3">
                    {/* Error message */}
                    <div className="font-mono text-xs bg-red-50 rounded-lg border border-red-200 p-3">
                      <div className="font-semibold mb-2 text-[10px] uppercase flex items-center gap-1.5 text-red-700">
                        <XCircle className="w-3 h-3" />
                        Error Details
                      </div>
                      <pre className="whitespace-pre-wrap break-all text-[10px] text-red-800 max-h-32 overflow-y-auto">
                        {nodeError}
                      </pre>
                    </div>

                    {/* Error suggestions based on common patterns */}
                    {(() => {
                      const suggestions: string[] = [];
                      const errorLower = nodeError?.toLowerCase() || '';

                      if (errorLower.includes('file not found') || errorLower.includes('no such file')) {
                        suggestions.push('Check that the file path is correct and the file exists');
                        suggestions.push('Verify you have read permissions for the file');
                      }
                      if (errorLower.includes('permission') || errorLower.includes('access denied')) {
                        suggestions.push('Run with elevated permissions or check file/folder permissions');
                      }
                      if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
                        suggestions.push('The operation took too long - try increasing the timeout');
                        suggestions.push('Check network connectivity if accessing remote resources');
                      }
                      if (errorLower.includes('connection') || errorLower.includes('network')) {
                        suggestions.push('Check your network connection');
                        suggestions.push('Verify the server/service is running and accessible');
                      }
                      if (errorLower.includes('authentication') || errorLower.includes('unauthorized') || errorLower.includes('401')) {
                        suggestions.push('Verify your credentials are correct');
                        suggestions.push('Check if your token/API key has expired');
                      }
                      if (errorLower.includes('not found') || errorLower.includes('404')) {
                        suggestions.push('The requested resource does not exist');
                        suggestions.push('Check the URL or path is correct');
                      }
                      if (errorLower.includes('selector') || errorLower.includes('element')) {
                        suggestions.push('The element selector may be incorrect or the element doesn\'t exist');
                        suggestions.push('The page may not have loaded completely - add a wait');
                      }
                      if (errorLower.includes('json') || errorLower.includes('parse')) {
                        suggestions.push('The data format may be invalid - check the input');
                      }

                      if (suggestions.length === 0) {
                        suggestions.push('Review the error message for specific details');
                        suggestions.push('Check the node configuration');
                      }

                      return (
                        <div className="bg-amber-50 rounded-lg border border-amber-200 p-3">
                          <div className="font-semibold mb-2 text-[10px] uppercase text-amber-700">
                            Suggestions
                          </div>
                          <ul className="space-y-1">
                            {suggestions.map((suggestion, idx) => (
                              <li key={idx} className="text-[10px] text-amber-800 flex items-start gap-1.5">
                                <span className="text-amber-500 mt-0.5">•</span>
                                {suggestion}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}

                    {/* Execution timing if available */}
                    {nodeExecution?.startTime && nodeExecution?.endTime && (
                      <div className="text-[10px] text-slate-500 flex items-center gap-2">
                        <span>Failed after {((nodeExecution.endTime - nodeExecution.startTime) / 1000).toFixed(2)}s</span>
                      </div>
                    )}
                  </div>
                ) : displayData && typeof displayData === 'object' ? (
                  <div className={`font-mono text-xs rounded-lg border p-3 ${isPinned ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                    <div className={`font-semibold mb-2 text-[10px] uppercase flex items-center gap-1.5 ${isPinned ? 'text-amber-700' : 'text-green-700'}`}>
                      {isPinned && <Pin className="w-3 h-3" />}
                      {isPinned ? 'Pinned Data' : 'Live Data'}
                      {isPinned && nodePinnedData && (
                        <span className="text-[9px] font-normal text-amber-500 ml-1">
                          (pinned {new Date(nodePinnedData.pinnedAt).toLocaleTimeString()})
                        </span>
                      )}
                    </div>
                    <pre className={`whitespace-pre-wrap break-all text-[10px] max-h-64 overflow-y-auto ${isPinned ? 'text-amber-800' : 'text-green-800'}`}>
                      {JSON.stringify(displayData, null, 2)}
                    </pre>
                  </div>
                ) : displayData ? (
                  <div className={`font-mono text-xs rounded-lg border p-3 ${isPinned ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                    <div className={`font-semibold mb-2 text-[10px] uppercase flex items-center gap-1.5 ${isPinned ? 'text-amber-700' : 'text-green-700'}`}>
                      {isPinned && <Pin className="w-3 h-3" />}
                      {isPinned ? 'Pinned Data' : 'Live Data'}
                    </div>
                    <pre className={`whitespace-pre-wrap break-all text-[10px] ${isPinned ? 'text-amber-800' : 'text-green-800'}`}>
                      {String(displayData)}
                    </pre>
                  </div>
                ) : (
                  /* JSON Tree View - Schema only (no live data) */
                  <>
                    <div className="font-mono text-xs bg-white rounded-lg border border-slate-200 p-3">
                      {/* Root object */}
                      <div className="text-slate-500">{"{"}</div>

                    {/* Standard output fields */}
                    {template.outputSchema?.map((field, i) => {
                      const expression = `\${${node.data.label}.${field.name}}`;
                      const isLast = i === (template.outputSchema?.length || 0) - 1 && dynamicFormFields.length === 0 && dynamicExcelColumns.length === 0 && dynamicSecrets.length === 0;
                      return (
                        <div
                          key={i}
                          className="group pl-4 py-0.5 hover:bg-emerald-50 rounded cursor-pointer flex items-center gap-1"
                          onClick={() => copyExpression(expression)}
                          title={field.description ? `${field.description}\nClick to copy: ${expression}` : `Click to copy: ${expression}`}
                        >
                          <span className="text-emerald-600">&quot;{field.name}&quot;</span>
                          <span className="text-slate-400">:</span>
                          <span className={`ml-1 ${
                            field.type === "string" ? "text-green-600" :
                            field.type === "number" ? "text-blue-600" :
                            field.type === "boolean" ? "text-purple-600" :
                            field.type === "object" ? "text-orange-600" :
                            field.type === "array" ? "text-pink-600" :
                            "text-slate-600"
                          }`}>
                            {field.type === "string" ? `"${field.example || '...'}"` :
                             field.type === "number" ? (field.example || "0") :
                             field.type === "boolean" ? "true" :
                             field.type === "object" ? "{...}" :
                             field.type === "array" ? "[...]" :
                             "..."}
                          </span>
                          {!isLast && <span className="text-slate-400">,</span>}
                          {copiedExpression === expression ? (
                            <Check className="w-3 h-3 text-green-500 ml-auto opacity-100" />
                          ) : (
                            <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      );
                    })}

                  {/* Form Data (nested object for Form Trigger) */}
                  {dynamicFormFields.length > 0 && (
                    <OutputTreeNode
                      label="formData"
                      type="object"
                      nodeLabel={node.data.label}
                      fields={dynamicFormFields}
                      copyExpression={copyExpression}
                      copiedExpression={copiedExpression}
                      isLast={dynamicExcelColumns.length === 0 && dynamicSecrets.length === 0}
                    />
                  )}

                  {/* Excel Row Fields (nested object for Excel Read nodes) */}
                  {dynamicExcelColumns.length > 0 && (
                    <div className="pl-4">
                      {/* row object header */}
                      <div
                        className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-slate-50 rounded -ml-3 pl-1"
                      >
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                        <span className="text-orange-600">&quot;row&quot;</span>
                        <span className="text-slate-400">:</span>
                        <span className="text-slate-500 ml-1">{"{"}</span>
                      </div>
                      {/* Column fields */}
                      {dynamicExcelColumns.map((col, i) => {
                        const expression = `\${${node.data.label}.row.${col.id}}`;
                        const colIsLast = i === dynamicExcelColumns.length - 1;
                        return (
                          <div
                            key={col.id}
                            className="group pl-4 py-0.5 hover:bg-emerald-50 rounded cursor-pointer flex items-center gap-1"
                            onClick={() => copyExpression(expression)}
                            title={`Click to copy: ${expression}`}
                          >
                            <span className="text-emerald-600">&quot;{col.label}&quot;</span>
                            <span className="text-slate-400">:</span>
                            <span className="text-green-600 ml-1">&quot;...&quot;</span>
                            {!colIsLast && <span className="text-slate-400">,</span>}
                            {copiedExpression === expression ? (
                              <Check className="w-3 h-3 text-green-500 ml-auto opacity-100" />
                            ) : (
                              <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
                            )}
                          </div>
                        );
                      })}
                      <div className="text-slate-500 pl-0">{"}"}{dynamicSecrets.length > 0 && ","}</div>
                    </div>
                  )}

                  {/* Vault Secrets (for secrets.* nodes) */}
                  {dynamicSecrets.length > 0 && (
                    <div className="pl-4">
                      {/* vault object header */}
                      <div
                        className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-slate-50 rounded -ml-3 pl-1"
                      >
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                        <span className="text-yellow-600">&quot;vault&quot;</span>
                        <span className="text-slate-400">:</span>
                        <span className="text-slate-500 ml-1">{"{"}</span>
                      </div>
                      {/* Secret fields */}
                      {dynamicSecrets.map((secret, i) => {
                        const expression = `\${vault.${secret.id}}`;
                        const secretIsLast = i === dynamicSecrets.length - 1;
                        return (
                          <div
                            key={secret.id}
                            className="group pl-4 py-0.5 hover:bg-yellow-50 rounded cursor-pointer flex items-center gap-1"
                            onClick={() => copyExpression(expression)}
                            title={`Click to copy: ${expression}\nFull path: ${secret.fullPath}`}
                          >
                            <span className="text-yellow-600">&quot;{secret.label}&quot;</span>
                            <span className="text-slate-400">:</span>
                            <span className="text-green-600 ml-1">&quot;••••••&quot;</span>
                            {!secretIsLast && <span className="text-slate-400">,</span>}
                            {copiedExpression === expression ? (
                              <Check className="w-3 h-3 text-green-500 ml-auto opacity-100" />
                            ) : (
                              <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100" />
                            )}
                          </div>
                        );
                      })}
                      <div className="text-slate-500 pl-0">{"}"}</div>
                    </div>
                  )}

                      <div className="text-slate-500">{"}"}</div>
                    </div>

                    {/* Legend */}
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <p className="text-[10px] text-slate-400 mb-2">Click any field to copy expression</p>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">string</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">number</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">boolean</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">object</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
          })()}
        </div>
      </div>
    </>
  );

  return (
    <>
      {createPortal(panel, document.body)}
      {isFormTrigger && (
        <FormPreview
          isOpen={showFormPreview}
          onClose={() => setShowFormPreview(false)}
          formConfig={{
            title: node.data.config.formTitle || "Form",
            description: node.data.config.formDescription,
            fields: (node.data.config.fields as FormFieldDefinition[]) || [],
            submitButtonLabel: node.data.config.submitButtonLabel,
          }}
        />
      )}
    </>
  );
}
