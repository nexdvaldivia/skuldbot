import { Play, Download, Upload, Trash2, Package, Settings, HelpCircle, Loader2, Home } from "lucide-react";
import { useState } from "react";
import { useFlowStore, FormTriggerConfig } from "../store/flowStore";
import { useToastStore } from "../store/toastStore";
import { useNavigationStore } from "../store/navigationStore";
import { SkuldLogoBox } from "./ui/SkuldLogo";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import FormTriggerModal from "./FormTriggerModal";

export default function Toolbar() {
  const { compileBot, runBot, generateDSL, deleteNode, selectedNode, nodes, botInfo, setBotInfo, requiresFormInput, getFormTriggerConfig } =
    useFlowStore();
  const toast = useToastStore();
  const { setView } = useNavigationStore();
  const [isCompiling, setIsCompiling] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [formConfig, setFormConfig] = useState<FormTriggerConfig | null>(null);

  const handleCompile = async () => {
    setIsCompiling(true);
    try {
      await compileBot();
    } finally {
      setIsCompiling(false);
    }
  };

  const handleRun = async () => {
    // Check if bot has a form trigger
    if (requiresFormInput()) {
      const config = getFormTriggerConfig();
      if (config) {
        setFormConfig(config);
        setShowFormModal(true);
        return;
      }
    }

    // No form trigger, run directly
    setIsRunning(true);
    try {
      await runBot();
    } finally {
      setIsRunning(false);
    }
  };

  const handleFormSubmit = async (formData: Record<string, any>) => {
    setIsRunning(true);
    try {
      await runBot(formData);
    } finally {
      setIsRunning(false);
      setShowFormModal(false);
    }
  };

  const handleExportDSL = () => {
    if (nodes.length === 0) {
      toast.warning("No hay nodos", "Agrega nodos antes de exportar");
      return;
    }

    const dsl = generateDSL();
    const blob = new Blob([JSON.stringify(dsl, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dsl.bot.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("DSL exportado");
  };

  const handleImportDSL = async () => {
    try {
      if (window.__TAURI__) {
        const { dialog, fs } = window.__TAURI__;

        const filePath = await dialog.open({
          filters: [{ name: "JSON", extensions: ["json"] }],
        });

        if (filePath && typeof filePath === "string") {
          const content = await fs.readTextFile(filePath);
          const dsl = JSON.parse(content);
          useFlowStore.getState().loadFromDSL(dsl);
          toast.success("DSL importado");
        }
      } else {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;

          try {
            const text = await file.text();
            const dsl = JSON.parse(text);
            useFlowStore.getState().loadFromDSL(dsl);
            toast.success("DSL importado");
          } catch (err) {
            toast.error("Error al importar");
          }
        };
        input.click();
      }
    } catch (error) {
      toast.error("Error al importar");
    }
  };

  const handleDeleteNode = () => {
    if (selectedNode) {
      deleteNode(selectedNode.id);
      toast.success("Nodo eliminado");
    }
  };

  return (
    <header className="h-14 bg-background border-b flex items-center justify-between px-4 flex-shrink-0">
      {/* Left: Logo & Bot Name */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setView("welcome")}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          title="Back to Home"
        >
          <SkuldLogoBox size="md" />
          <div>
            <span className="text-sm font-semibold leading-tight block">SkuldBot<sup className="text-[8px] font-normal align-super ml-0.5">TM</sup></span>
            <span className="text-[10px] text-muted-foreground -mt-0.5 block">Automation Designer</span>
          </div>
        </button>

        <div className="w-px h-6 bg-border" />

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setView("welcome")}
          title="Back to Home"
          className="text-muted-foreground hover:text-foreground"
        >
          <Home className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-border" />

        <Input
          type="text"
          value={botInfo.name}
          onChange={(e) => setBotInfo({ name: e.target.value })}
          className="h-8 w-[180px] text-sm"
          placeholder="Untitled Bot"
        />
      </div>

      {/* Right: All Actions */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCompile}
          disabled={isCompiling || nodes.length === 0}
          title="Build"
          className="text-muted-foreground hover:text-foreground"
        >
          {isCompiling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Package className="h-4 w-4" />
          )}
          Build
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleRun}
          disabled={isRunning || nodes.length === 0}
          title="Run"
          className="text-muted-foreground hover:text-foreground"
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Run
        </Button>

        <div className="w-px h-5 bg-border mx-1" />

        <Button variant="ghost" size="icon" onClick={handleImportDSL} title="Import DSL">
          <Upload className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="icon" onClick={handleExportDSL} disabled={nodes.length === 0} title="Export DSL">
          <Download className="h-4 w-4" />
        </Button>

        <div className="w-px h-5 bg-border mx-1" />

        <Button variant="destructive" size="icon" onClick={handleDeleteNode} disabled={!selectedNode} title="Delete Node">
          <Trash2 className="h-4 w-4" />
        </Button>

        <div className="w-px h-5 bg-border mx-1" />

        <Button variant="ghost" size="icon" title="Settings">
          <Settings className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="icon" title="Help">
          <HelpCircle className="h-4 w-4" />
        </Button>
      </div>

      {/* Form Trigger Modal */}
      {formConfig && (
        <FormTriggerModal
          isOpen={showFormModal}
          onClose={() => setShowFormModal(false)}
          onSubmit={handleFormSubmit}
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
