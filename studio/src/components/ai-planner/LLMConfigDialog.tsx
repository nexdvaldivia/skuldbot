/**
 * LLM Config Dialog
 * Modal for configuring LLM provider settings with n8n-style connections
 */

import { useState, useEffect } from "react";
import { X, Thermometer, Info, Plus, Plug, ChevronDown, Trash2, Edit2, Star } from "lucide-react";
import { Button } from "../ui/Button";
import { useAIPlannerStore } from "../../store/aiPlannerStore";
import { useConnectionsStore, LLMConnection, maskApiKey } from "../../store/connectionsStore";
import { LLMProvider } from "../../types/ai-planner";
import ConnectionDialog from "./ConnectionDialog";

interface LLMConfigDialogProps {
  onClose: () => void;
}

const MODELS: Record<LLMProvider, { value: string; label: string }[]> = {
  openai: [
    { value: "gpt-4o", label: "GPT-4o (Recommended)" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "gpt-4", label: "GPT-4" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Faster)" },
  ],
  anthropic: [
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (Recommended)" },
    { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    { value: "claude-3-sonnet-20240229", label: "Claude 3 Sonnet" },
  ],
  local: [
    { value: "llama3.1", label: "Llama 3.1 (8B)" },
    { value: "llama3.1:70b", label: "Llama 3.1 (70B)" },
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

export function LLMConfigDialog({ onClose }: LLMConfigDialogProps) {
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
  const [showConnectionDropdown, setShowConnectionDropdown] = useState(false);
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
    setShowConnectionDropdown(false);
  };

  const handleDeleteConnection = async (conn: LLMConnection) => {
    if (confirm(`Delete connection "${conn.name}"?`)) {
      await deleteConnection(conn.id);
    }
  };

  const handleSetDefault = (conn: LLMConnection) => {
    setDefaultConnection(conn.id);
    setShowConnectionDropdown(false);
  };

  const handleConnectionDialogClose = () => {
    setShowConnectionDialog(false);
    setEditingConnection(null);
  };

  const handleNewConnection = () => {
    setEditingConnection(null);
    setShowConnectionDialog(true);
    setShowConnectionDropdown(false);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">LLM Settings</h2>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            {/* Connection Selector */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Plug className="w-4 h-4 inline mr-1" />
                Connection
              </label>

              <div className="relative">
                <button
                  onClick={() => setShowConnectionDropdown(!showConnectionDropdown)}
                  className="w-full flex items-center justify-between px-3 py-2.5 border border-slate-300 rounded-lg hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  {selectedConnection ? (
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          PROVIDER_COLORS[selectedConnection.provider]
                        }`}
                      >
                        {PROVIDER_LABELS[selectedConnection.provider]}
                      </span>
                      <span className="font-medium text-slate-800">
                        {selectedConnection.name}
                      </span>
                      {selectedConnection.isDefault && (
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-400">Select a connection...</span>
                  )}
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </button>

                {/* Dropdown */}
                {showConnectionDropdown && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                    {/* Connection List */}
                    <div className="max-h-60 overflow-y-auto">
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
                          <div
                            key={conn.id}
                            className={`flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 cursor-pointer ${
                              conn.id === selectedConnection?.id ? "bg-primary-50" : ""
                            }`}
                          >
                            <div
                              className="flex items-center gap-2 flex-1"
                              onClick={() => {
                                selectConnection(conn.id);
                                setShowConnectionDropdown(false);
                              }}
                            >
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  PROVIDER_COLORS[conn.provider]
                                }`}
                              >
                                {PROVIDER_LABELS[conn.provider]}
                              </span>
                              <span className="font-medium text-sm text-slate-800">
                                {conn.name}
                              </span>
                              {conn.isDefault && (
                                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {!conn.isDefault && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSetDefault(conn);
                                  }}
                                  className="p-1 text-slate-400 hover:text-amber-500 rounded"
                                  title="Set as default"
                                >
                                  <Star className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditConnection(conn);
                                }}
                                className="p-1 text-slate-400 hover:text-primary-500 rounded"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteConnection(conn);
                                }}
                                className="p-1 text-slate-400 hover:text-red-500 rounded"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* New Connection Button */}
                    <div className="border-t border-slate-200">
                      <button
                        onClick={handleNewConnection}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-primary-600 hover:bg-primary-50 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        New Connection
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick hint */}
              {connections.length > 0 && selectedConnection && (
                <p className="mt-1 text-xs text-slate-500">
                  API Key: {maskApiKey(selectedConnection.apiKey)}
                </p>
              )}
            </div>

            {/* Model Selection (only if connection selected) */}
            {selectedConnection && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {MODELS[selectedConnection.provider].map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>

                {model === "custom" && (
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="Enter model name"
                    className="mt-2 w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                )}
              </div>
            )}

            {/* Temperature */}
            {selectedConnection && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Thermometer className="w-4 h-4 inline mr-1" />
                  Temperature: {temperature.toFixed(1)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>Precise (0)</span>
                  <span>Creative (1)</span>
                </div>
              </div>
            )}

            {/* Info Box */}
            <div className="flex gap-2 p-3 bg-blue-50 rounded-lg">
              <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700">
                {connections.length === 0
                  ? "Create a connection to save your API credentials securely. Your keys are stored locally and never sent to our servers."
                  : "Lower temperature produces more predictable results. Higher values make the AI more creative but less consistent."}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
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
          </div>
        </div>
      </div>

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
