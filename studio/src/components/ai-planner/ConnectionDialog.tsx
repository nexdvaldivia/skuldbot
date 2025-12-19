/**
 * Connection Dialog
 * Modal for creating and editing LLM connections (n8n-style)
 */

import { useState, useEffect } from "react";
import { X, Key, Globe, Loader2, CheckCircle, AlertCircle, Plug } from "lucide-react";
import { Button } from "../ui/Button";
import { useConnectionsStore, ConnectionFormData, LLMConnection, maskApiKey } from "../../store/connectionsStore";
import { LLMProvider } from "../../types/ai-planner";
import { useToastStore } from "../../store/toastStore";

interface ConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editConnection?: LLMConnection | null;
}

const PROVIDERS: { value: LLMProvider; label: string; description: string }[] = [
  {
    value: "openai",
    label: "OpenAI",
    description: "GPT-4o, GPT-4 Turbo, GPT-3.5",
  },
  {
    value: "anthropic",
    label: "Anthropic",
    description: "Claude 3.5 Sonnet, Claude 3 Opus",
  },
  {
    value: "local",
    label: "Local LLM",
    description: "Ollama, LM Studio (OpenAI compatible)",
  },
];

export function ConnectionDialog({ isOpen, onClose, editConnection }: ConnectionDialogProps) {
  const { addConnection, updateConnection, testConnection } = useConnectionsStore();
  const toast = useToastStore();

  const [name, setName] = useState("");
  const [provider, setProvider] = useState<LLMProvider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when dialog opens or editConnection changes
  useEffect(() => {
    if (isOpen) {
      if (editConnection) {
        setName(editConnection.name);
        setProvider(editConnection.provider);
        setApiKey(""); // Don't show existing API key for security
        setBaseUrl(editConnection.baseUrl || "");
      } else {
        setName("");
        setProvider("openai");
        setApiKey("");
        setBaseUrl("");
      }
      setTestResult(null);
    }
  }, [isOpen, editConnection]);

  const handleProviderChange = (newProvider: LLMProvider) => {
    setProvider(newProvider);
    setTestResult(null);

    // Set default base URL for local
    if (newProvider === "local") {
      setBaseUrl("http://localhost:11434/v1");
    } else {
      setBaseUrl("");
    }
  };

  const handleTest = async () => {
    if (provider !== "local" && !apiKey.trim()) {
      setTestResult({ success: false, message: "Please enter an API key" });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testConnection({
        name,
        provider,
        apiKey,
        baseUrl: baseUrl || undefined,
      });
      setTestResult(result);
    } catch (error) {
      setTestResult({ success: false, message: String(error) });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.warning("Name Required", "Please enter a connection name");
      return;
    }

    if (provider !== "local" && !apiKey.trim() && !editConnection) {
      toast.warning("API Key Required", "Please enter an API key");
      return;
    }

    setIsSaving(true);

    try {
      const formData: ConnectionFormData = {
        name: name.trim(),
        provider,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
      };

      if (editConnection) {
        // Update existing connection
        // Only update apiKey if a new one was entered
        const updateData: Partial<ConnectionFormData> = {
          name: formData.name,
          provider: formData.provider,
          baseUrl: formData.baseUrl,
        };
        if (apiKey.trim()) {
          updateData.apiKey = apiKey.trim();
        }
        await updateConnection(editConnection.id, updateData);
        toast.success("Connection Updated", `"${name}" has been updated`);
      } else {
        // Create new connection
        await addConnection(formData);
        toast.success("Connection Created", `"${name}" is ready to use`);
      }

      onClose();
    } catch (error) {
      toast.error("Save Failed", String(error));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const isEditing = !!editConnection;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <Plug className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">
                {isEditing ? "Edit Connection" : "New Connection"}
              </h2>
              <p className="text-xs text-slate-500">
                {isEditing ? "Update your LLM credentials" : "Add credentials to use AI features"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Connection Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Connection Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My OpenAI Key"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              A friendly name to identify this connection
            </p>
          </div>

          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Provider
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => handleProviderChange(p.value)}
                  className={`p-3 border rounded-lg text-center transition-colors ${
                    provider === p.value
                      ? "border-primary-300 bg-primary-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span className="block font-medium text-sm text-slate-800">
                    {p.label}
                  </span>
                  <span className="block text-[10px] text-slate-500 mt-0.5">
                    {p.description.split(",")[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          {provider !== "local" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Key className="w-4 h-4 inline mr-1" />
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                }}
                placeholder={
                  isEditing
                    ? `Current: ${maskApiKey(editConnection?.apiKey || "")}`
                    : `Enter your ${provider === "openai" ? "OpenAI" : "Anthropic"} API key`
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
              {isEditing && (
                <p className="mt-1 text-xs text-slate-500">
                  Leave empty to keep the current API key
                </p>
              )}
            </div>
          )}

          {/* Base URL (for local LLM) */}
          {provider === "local" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Globe className="w-4 h-4 inline mr-1" />
                Base URL
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  setTestResult(null);
                }}
                placeholder="http://localhost:11434/v1"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                Ollama: http://localhost:11434/v1 | LM Studio: http://localhost:1234/v1
              </p>
            </div>
          )}

          {/* Test Connection Button */}
          <div>
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={isTesting}
              className="w-full"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing Connection...
                </>
              ) : (
                <>
                  <Plug className="w-4 h-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>

            {/* Test Result */}
            {testResult && (
              <div
                className={`mt-3 flex items-start gap-2 p-3 rounded-lg ${
                  testResult.success ? "bg-green-50" : "bg-red-50"
                }`}
              >
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                )}
                <p
                  className={`text-sm ${
                    testResult.success ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {testResult.message}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="default" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : isEditing ? (
              "Update Connection"
            ) : (
              "Create Connection"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ConnectionDialog;
