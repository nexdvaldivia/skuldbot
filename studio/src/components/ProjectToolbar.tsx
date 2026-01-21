import { Play, Download, Save, Package, Loader2, Undo, Redo } from "lucide-react";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { useProjectStore } from "../store/projectStore";
import { useTabsStore } from "../store/tabsStore";
import { useFlowStore, FormTriggerConfig } from "../store/flowStore";
import { useHistoryStore } from "../store/historyStore";
import { useToastStore } from "../store/toastStore";
import { useLogsStore } from "../store/logsStore";
import { SkuldLogoBox } from "./ui/SkuldLogo";
import { Button } from "./ui/Button";
import FormTriggerModal from "./FormTriggerModal";
import { FlowNode, FlowEdge, BotDSL, DSLNode } from "../types/flow";

// AI node types that can have a model connection
const AI_NODES_WITH_MODEL = [
  "ai.agent",
  "ai.llm_prompt",
  "ai.classify",
  "ai.summarize",
  "ai.translate",
  "ai.sentiment",
  "ai.extract",
  "ai.vision",
  "ai.generate_code",
  "ai.explain_code"
];

// Helper to convert nodes/edges to DSL
function generateDSL(
  botId: string,
  botName: string,
  description: string | undefined,
  nodes: FlowNode[],
  edges: FlowEdge[]
): BotDSL {
  const dslNodes: DSLNode[] = nodes.map((node) => {
    const successEdge = edges.find(
      (e) => e.source === node.id && e.sourceHandle === "success"
    );
    const errorEdge = edges.find(
      (e) => e.source === node.id && e.sourceHandle === "error"
    );

    const dslNode: DSLNode = {
      id: node.id,
      type: node.data.nodeType,
      config: node.data.config,
      outputs: {
        success: successEdge?.target || "END",
        error: errorEdge?.target || "END",
      },
      label: node.data.label,
    };

    // Check for AI Model connections for AI nodes
    if (AI_NODES_WITH_MODEL.includes(node.data.nodeType)) {
      const modelEdge = edges.find(
        (e) => e.target === node.id && e.targetHandle === "model" && e.data?.edgeType === "model"
      );

      if (modelEdge) {
        const modelNode = nodes.find((n) => n.id === modelEdge.source);
        if (modelNode && modelNode.data.nodeType === "ai.model") {
          const modConfig = modelNode.data.config || {};
          const model_config: Record<string, any> = {
            provider: modConfig.provider || "openai",
            model: modConfig.model || "gpt-4o",
            temperature: modConfig.temperature ?? 0.7,
          };

          if (modConfig.max_tokens) {
            model_config.max_tokens = modConfig.max_tokens;
          }
          if (modConfig.api_key) {
            model_config.api_key = modConfig.api_key;
          }
          if (modConfig.base_url) {
            model_config.base_url = modConfig.base_url;
          }
          if (modConfig.api_version) {
            model_config.api_version = modConfig.api_version;
          }

          // Use model_config_ to match Jinja2 template expectations
          dslNode.model_config_ = model_config as DSLNode["model_config_"];
          console.log(`[ProjectToolbar] Added model_config_ for ${node.id}:`, model_config);
        }
      }
    }

    return dslNode;
  });

  const triggerNodes = nodes.filter((node) => node.data.category === "trigger");
  const triggerIds = triggerNodes.map((node) => node.id);

  // Determinar start_node: preferir nodo trigger, sino el primer nodo
  let startNode: string | undefined;
  if (triggerNodes.length > 0) {
    startNode = triggerNodes[0].id;
  } else if (nodes.length > 0) {
    startNode = nodes[0].id;
  }

  return {
    version: "1.0",
    bot: {
      id: botId,
      name: botName,
      description,
    },
    nodes: dslNodes,
    triggers: triggerIds.length > 0 ? triggerIds : undefined,
    start_node: startNode,
  };
}

export default function ProjectToolbar() {
  const { project, activeBotId, saveBot, getActiveBot, updateActiveBotNodes, updateActiveBotEdges } = useProjectStore();
  const { tabs, setTabDirty } = useTabsStore();
  useFlowStore(); // Keep store reference for potential future use
  const { undo, redo, canUndo, canRedo } = useHistoryStore();
  const toast = useToastStore();
  const logs = useLogsStore();

  const [isCompiling, setIsCompiling] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [formConfig, setFormConfig] = useState<FormTriggerConfig | null>(null);

  const activeBot = getActiveBot();
  const activeTab = tabs.find((t) => t.botId === activeBotId);
  const hasNodes = (activeBot?.nodes.length || 0) > 0;
  const isDirty = activeTab?.isDirty || false;

  // Handle undo
  const handleUndo = () => {
    if (!canUndo()) return;
    const previousState = undo();
    if (previousState) {
      updateActiveBotNodes(previousState.nodes);
      updateActiveBotEdges(previousState.edges);
      if (activeBotId) {
        setTabDirty(`bot-${activeBotId}`, true);
      }
    }
  };

  // Handle redo
  const handleRedo = () => {
    if (!canRedo()) return;
    const nextState = redo();
    if (nextState) {
      updateActiveBotNodes(nextState.nodes);
      updateActiveBotEdges(nextState.edges);
      if (activeBotId) {
        setTabDirty(`bot-${activeBotId}`, true);
      }
    }
  };

  // Check if bot requires form input
  const requiresFormInput = () => {
    if (!activeBot) return false;
    return activeBot.nodes.some((n) => n.data.nodeType === "trigger.form");
  };

  // Get form trigger config
  const getFormTriggerConfig = (): FormTriggerConfig | null => {
    if (!activeBot) return null;
    const formTrigger = activeBot.nodes.find(
      (n) => n.data.nodeType === "trigger.form"
    );
    if (!formTrigger) return null;

    const config = formTrigger.data.config || {};
    return {
      formTitle: config.formTitle || "Form Input",
      formDescription: config.formDescription || "",
      submitButtonLabel: config.submitButtonLabel || "Run Bot",
      fields: config.fields || [],
    };
  };

  const handleSave = async () => {
    if (!activeBotId) return;

    setIsSaving(true);
    try {
      await saveBot(activeBotId);
      setTabDirty(`bot-${activeBotId}`, false);
      // Note: saveBot already shows a toast, no need to show another one
    } catch (error) {
      toast.error("Save failed", String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompile = async () => {
    if (!activeBot || !hasNodes) return;

    setIsCompiling(true);
    logs.info("Starting compilation...");
    logs.openPanel();

    try {
      // Generate DSL with auto-trigger if needed
      let dsl = generateDSL(
        activeBot.id,
        activeBot.name,
        activeBot.description,
        activeBot.nodes,
        activeBot.edges
      );

      // Auto-add manual trigger if none exists
      const hasTrigger = activeBot.nodes.some(
        (n) => n.data.category === "trigger"
      );

      if (!hasTrigger) {
        const manualTriggerId = `trigger-manual-${Date.now()}`;
        const firstNodeId = dsl.nodes[0]?.id;

        const manualTriggerNode: DSLNode = {
          id: manualTriggerId,
          type: "trigger.manual",
          config: {},
          outputs: {
            success: firstNodeId || "END",
            error: "END",
          },
          label: "Manual Trigger",
        };

        dsl.nodes.unshift(manualTriggerNode);
        dsl.triggers = [manualTriggerId];
        dsl.start_node = manualTriggerId;

        logs.info("Auto-added Manual Trigger");
      }

      const result = await invoke<{ success: boolean; message: string; bot_path?: string }>(
        "compile_dsl",
        { dsl: JSON.stringify(dsl) }
      );

      logs.success("Bot compiled successfully", result.bot_path);
      toast.success("Bot compiled", "Package generated");
    } catch (error) {
      logs.error("Compilation error", String(error));
      toast.error("Compilation failed", String(error).substring(0, 100));
    } finally {
      setIsCompiling(false);
    }
  };

  const handleRun = async (formData?: Record<string, any>) => {
    if (!activeBot || !hasNodes) return;

    // Check for form trigger
    if (!formData && requiresFormInput()) {
      const config = getFormTriggerConfig();
      if (config) {
        setFormConfig(config);
        setShowFormModal(true);
        return;
      }
    }

    setIsRunning(true);
    logs.info("Starting bot execution...");
    logs.openPanel();

    try {
      // Generate DSL
      let dsl = generateDSL(
        activeBot.id,
        activeBot.name,
        activeBot.description,
        activeBot.nodes,
        activeBot.edges
      );

      // Auto-add manual trigger if none exists
      const hasTrigger = activeBot.nodes.some(
        (n) => n.data.category === "trigger"
      );

      if (!hasTrigger) {
        const manualTriggerId = `trigger-manual-${Date.now()}`;
        const firstNodeId = dsl.nodes[0]?.id;

        const manualTriggerNode: DSLNode = {
          id: manualTriggerId,
          type: "trigger.manual",
          config: {},
          outputs: {
            success: firstNodeId || "END",
            error: "END",
          },
          label: "Manual Trigger",
        };

        dsl.nodes.unshift(manualTriggerNode);
        dsl.triggers = [manualTriggerId];
        dsl.start_node = manualTriggerId;
      }

      // Add form data to DSL if provided
      if (formData && Object.keys(formData).length > 0) {
        dsl.variables = {
          ...dsl.variables,
          formData: {
            type: "json",
            value: formData,
          },
        };
        logs.info("Form data received", JSON.stringify(formData));
      }

      const result = await invoke<{ success: boolean; message: string; output?: string; logs?: string[] }>(
        "run_bot",
        { dsl: JSON.stringify(dsl) }
      );

      // Parse and show logs
      if (result.logs && Array.isArray(result.logs)) {
        result.logs.forEach((log: string) => {
          if (log.includes("ERROR")) {
            logs.error(log);
          } else if (log.includes("WARNING")) {
            logs.warning(log);
          } else if (log.includes("SUCCESS")) {
            logs.success(log);
          } else {
            logs.info(log);
          }
        });
      }

      if (result.success) {
        logs.success("Bot executed successfully");
        toast.success("Execution successful");
      } else {
        logs.error("Bot failed during execution");
        toast.error("Execution failed", "Check logs for details");
      }
    } catch (error) {
      logs.error("Execution error", String(error));
      toast.error("Execution failed", String(error).substring(0, 100));
    } finally {
      setIsRunning(false);
      setShowFormModal(false);
    }
  };

  const handleExportDSL = () => {
    if (!activeBot || !hasNodes) return;

    const dsl = generateDSL(
      activeBot.id,
      activeBot.name,
      activeBot.description,
      activeBot.nodes,
      activeBot.edges
    );

    const blob = new Blob([JSON.stringify(dsl, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeBot.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success("DSL exported");
  };

  return (
    <header className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-4 flex-shrink-0">
      {/* Left: Logo & Project Name */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <SkuldLogoBox size="sm" />
          <div>
            <span className="text-sm font-semibold text-slate-700 leading-tight block">
              {project?.project.name || <>SkuldBot<sup className="text-[8px] font-normal align-super ml-0.5">TM</sup></>}
            </span>
            <span className="text-[10px] text-slate-400 -mt-0.5 block">Automation Designer</span>
          </div>
        </div>

        {activeBot && (
          <>
            <div className="w-px h-5 bg-slate-200" />
            <span className="text-sm text-slate-600">
              {activeBot.name}
              {isDirty && <span className="text-primary-500 ml-1">*</span>}
            </span>
          </>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        {/* Save */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          title="Save (Ctrl+S)"
          className="text-slate-500 hover:text-slate-700"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          <span className="ml-1">Save</span>
        </Button>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* Build */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCompile}
          disabled={isCompiling || !hasNodes}
          title="Build"
          className="text-slate-500 hover:text-slate-700"
        >
          {isCompiling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Package className="h-4 w-4" />
          )}
          <span className="ml-1">Build</span>
        </Button>

        {/* Run */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleRun()}
          disabled={isRunning || !hasNodes}
          title="Run"
          className="text-slate-500 hover:text-slate-700"
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          <span className="ml-1">Run</span>
        </Button>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* Export */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleExportDSL}
          disabled={!hasNodes}
          title="Export DSL"
        >
          <Download className="h-4 w-4" />
        </Button>

        {/* Undo/Redo */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleUndo}
          disabled={!canUndo()}
          title="Undo (Ctrl+Z)"
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRedo}
          disabled={!canRedo()}
          title="Redo (Ctrl+Y)"
        >
          <Redo className="h-4 w-4" />
        </Button>
      </div>

      {/* Form Trigger Modal */}
      {formConfig && (
        <FormTriggerModal
          isOpen={showFormModal}
          onClose={() => setShowFormModal(false)}
          onSubmit={handleRun}
          isLoading={isRunning}
          formConfig={{
            title: formConfig.formTitle,
            description: formConfig.formDescription,
            fields: formConfig.fields,
            submitButtonLabel: formConfig.submitButtonLabel,
          }}
        />
      )}
    </header>
  );
}
