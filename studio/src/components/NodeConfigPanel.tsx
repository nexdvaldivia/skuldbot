import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { open } from "@tauri-apps/api/dialog";
import { invoke } from "@tauri-apps/api/tauri";
import { useFlowStore } from "../store/flowStore";
import { useProjectStore } from "../store/projectStore";
import { useNavigationStore } from "../store/navigationStore";
import { useTabsStore } from "../store/tabsStore";
import { getNodeTemplate } from "../data/nodeTemplates";
import { X, Info, Eye, Copy, Check, ChevronRight, ChevronDown, FolderOpen } from "lucide-react";
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
  const [showFormPreview, setShowFormPreview] = useState(false);
  const [copiedExpression, setCopiedExpression] = useState<string | null>(null);
  const [excelSheets, setExcelSheets] = useState<string[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);

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
  const hasInputPanel = !isTrigger && availableVariables.length > 0;
  const hasOutputPanel = template.outputSchema && template.outputSchema.length > 0;

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
          {hasInputPanel && (
            <div className="w-64 border-r bg-slate-50/80 flex flex-col flex-shrink-0">
              <div className="px-4 py-3 border-b bg-blue-50/80 flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Input</span>
                <span className="text-[10px] text-blue-500 ml-auto bg-blue-100 px-1.5 py-0.5 rounded-full">
                  {availableVariables.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {/* Group variables by node */}
                {predecessorNodes.map((predNode) => {
                  const nodeVars = availableVariables.filter(v => v.nodeId === predNode.id);
                  if (nodeVars.length === 0) return null;

                  // Separate regular fields from formData fields
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
                  <p className="text-[10px] text-slate-400">Click any field to copy expression</p>
                </div>
              </div>
            </div>
          )}

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

                return (
                <div key={field.name} className="space-y-2">
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
          {hasOutputPanel && (
            <div className="w-64 border-l bg-slate-50/80 flex flex-col flex-shrink-0">
              <div className="px-4 py-3 border-b bg-emerald-50/80 flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Output</span>
                <span className="text-[10px] text-emerald-500 ml-auto bg-emerald-100 px-1.5 py-0.5 rounded-full">
                  {(template.outputSchema?.length || 0) + dynamicFormFields.length + dynamicExcelColumns.length + dynamicSecrets.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {/* JSON Tree View */}
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
              </div>
            </div>
          )}
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
