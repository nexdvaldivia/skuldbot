/**
 * LLM Config Dialog
 * Modal for configuring LLM provider settings with n8n-style connections
 * Using shadcn/ui components
 */

import { useState, useEffect } from "react";
import { Thermometer, Info, Plus, Plug, Trash2, Edit2, Star } from "lucide-react";
import { Button } from "../ui/Button";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Slider } from "../ui/slider";
import { Input } from "../ui/Input";
import { Card, CardContent } from "../ui/card";
import { useAIPlannerStore } from "../../store/aiPlannerStore";
import { useConnectionsStore, LLMConnection, maskApiKey } from "../../store/connectionsStore";
import { LLMProvider } from "../../types/ai-planner";
import ConnectionDialog from "./ConnectionDialog";

interface LLMConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const MODELS: Record<LLMProvider, { value: string; label: string }[]> = {
  openai: [
    { value: "gpt-4o", label: "GPT-4o (Recommended)" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini (Faster)" },
    { value: "o1", label: "o1 (Reasoning)" },
    { value: "o1-mini", label: "o1 Mini (Reasoning)" },
    { value: "o1-preview", label: "o1 Preview" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "gpt-4", label: "GPT-4" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Legacy)" },
  ],
  anthropic: [
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (Recommended)" },
    { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    { value: "claude-3-sonnet-20240229", label: "Claude 3 Sonnet" },
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku (Faster)" },
  ],
  local: [
    { value: "llama3.1", label: "Llama 3.1 (8B)" },
    { value: "llama3.1:70b", label: "Llama 3.1 (70B)" },
    { value: "llama3.2", label: "Llama 3.2" },
    { value: "mistral", label: "Mistral" },
    { value: "codellama", label: "CodeLlama" },
    { value: "custom", label: "Custom Model" },
  ],
};

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  local: "Local",
};

const PROVIDER_COLORS: Record<LLMProvider, string> = {
  openai: "bg-green-100 text-green-700",
  anthropic: "bg-orange-100 text-orange-700",
  local: "bg-blue-100 text-blue-700",
};

export function LLMConfigDialog({ isOpen, onClose }: LLMConfigDialogProps) {
  const { llmConfig, setLLMConfig } = useAIPlannerStore();
  const {
    connections,
    selectedConnectionId,
    selectConnection,
    deleteConnection,
    setDefaultConnection,
    loadConnections,
  } = useConnectionsStore();

  const [model, setModel] = useState(llmConfig.model);
  const [temperature, setTemperature] = useState(llmConfig.temperature);
  const [customModel, setCustomModel] = useState("");
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [editingConnection, setEditingConnection] = useState<LLMConnection | null>(null);

  // Load connections on mount
  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // Get selected connection
  const selectedConnection = connections.find((c) => c.id === selectedConnectionId) ||
    connections.find((c) => c.isDefault) ||
    connections[0];

  // Update model when connection changes
  useEffect(() => {
    if (selectedConnection) {
      const providerModels = MODELS[selectedConnection.provider];
      const hasCurrentModel = providerModels.some((m) => m.value === model);
      if (!hasCurrentModel) {
        setModel(providerModels[0]?.value || "");
      }
    }
  }, [selectedConnection?.id]);

  const handleSave = () => {
    if (!selectedConnection) {
      return;
    }

    setLLMConfig({
      provider: selectedConnection.provider,
      model: model === "custom" ? customModel : model,
      apiKey: selectedConnection.apiKey,
      baseUrl: selectedConnection.baseUrl,
      temperature,
      connectionId: selectedConnection.id,
    });

    onClose();
  };

  const handleEditConnection = (conn: LLMConnection) => {
    setEditingConnection(conn);
    setShowConnectionDialog(true);
  };

  const handleDeleteConnection = async (conn: LLMConnection) => {
    if (confirm(`Delete connection "${conn.name}"?`)) {
      await deleteConnection(conn.id);
    }
  };

  const handleSetDefault = (conn: LLMConnection) => {
    setDefaultConnection(conn.id);
  };

  const handleConnectionDialogClose = () => {
    setShowConnectionDialog(false);
    setEditingConnection(null);
  };

  const handleNewConnection = () => {
    setEditingConnection(null);
    setShowConnectionDialog(true);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>LLM Settings</DialogTitle>
            <DialogDescription>
              Configure your AI connection and model preferences.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Connection Selector */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Plug className="w-4 h-4" />
                Connection
              </Label>

              <Select
                value={selectedConnection?.id || ""}
                onValueChange={(value) => {
                  if (value === "new") {
                    handleNewConnection();
                  } else {
                    selectConnection(value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a connection...">
                    {selectedConnection && (
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            PROVIDER_COLORS[selectedConnection.provider]
                          }`}
                        >
                          {PROVIDER_LABELS[selectedConnection.provider]}
                        </span>
                        <span className="font-medium">
                          {selectedConnection.name}
                        </span>
                        {selectedConnection.isDefault && (
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                        )}
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {connections.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <Plug className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="text-sm text-slate-500">No connections yet</p>
                      <p className="text-xs text-slate-400">
                        Create one to get started
                      </p>
                    </div>
                  ) : (
                    connections.map((conn) => (
                      <SelectItem key={conn.id} value={conn.id}>
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                PROVIDER_COLORS[conn.provider]
                              }`}
                            >
                              {PROVIDER_LABELS[conn.provider]}
                            </span>
                            <span className="font-medium text-sm">
                              {conn.name}
                            </span>
                            {conn.isDefault && (
                              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                            )}
                          </div>
                        </div>
                      </SelectItem>
                    ))
                  )}
                  <div className="border-t border-slate-200 mt-1 pt-1">
                    <SelectItem value="new" className="text-primary-600">
                      <div className="flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        New Connection
                      </div>
                    </SelectItem>
                  </div>
                </SelectContent>
              </Select>

              {/* Connection Actions */}
              {selectedConnection && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    API Key: {maskApiKey(selectedConnection.apiKey)}
                  </p>
                  <div className="flex items-center gap-1">
                    {!selectedConnection.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetDefault(selectedConnection)}
                        title="Set as default"
                        className="h-7 w-7 p-0"
                      >
                        <Star className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditConnection(selectedConnection)}
                      title="Edit"
                      className="h-7 w-7 p-0"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteConnection(selectedConnection)}
                      title="Delete"
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Model Selection */}
            {selectedConnection && (
              <div className="space-y-2">
                <Label>Model</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS[selectedConnection.provider].map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {model === "custom" && (
                  <Input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="Enter model name"
                    className="mt-2"
                  />
                )}
              </div>
            )}

            {/* Temperature */}
            {selectedConnection && (
              <div className="space-y-3">
                <Label className="flex items-center gap-1.5">
                  <Thermometer className="w-4 h-4" />
                  Temperature: {temperature.toFixed(1)}
                </Label>
                <Slider
                  value={[temperature]}
                  onValueChange={([value]) => setTemperature(value)}
                  min={0}
                  max={1}
                  step={0.1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Precise (0)</span>
                  <span>Creative (1)</span>
                </div>
              </div>
            )}

            {/* Info Box */}
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="flex gap-2 p-3">
                <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700">
                  {connections.length === 0
                    ? "Create a connection to save your API credentials securely. Your keys are stored locally and never sent to our servers."
                    : "Lower temperature produces more predictable results. Higher values make the AI more creative but less consistent."}
                </p>
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleSave}
              disabled={!selectedConnection}
            >
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Connection Dialog */}
      <ConnectionDialog
        isOpen={showConnectionDialog}
        onClose={handleConnectionDialogClose}
        editConnection={editingConnection}
      />
    </>
  );
}

export default LLMConfigDialog;
