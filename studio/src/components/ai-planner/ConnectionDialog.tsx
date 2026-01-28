/**
 * Connection Dialog
 * Modal for creating and editing LLM connections with provider-specific configurations
 */

import { useState, useEffect } from "react";
import { X, Key, Globe, Loader2, CheckCircle, AlertCircle, Plug, ChevronDown } from "lucide-react";
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
  { value: "openai", label: "OpenAI", description: "GPT-4o, o1, GPT-4 Turbo" },
  { value: "anthropic", label: "Anthropic", description: "Claude 3.5 Sonnet, Claude 3 Opus" },
  { value: "azure-foundry", label: "Azure AI Foundry", description: "GPT-4, Llama 3, Phi-3 (HIPAA)" },
  { value: "aws-bedrock", label: "AWS Bedrock", description: "Claude 3.5, Llama 3 (HIPAA)" },
  { value: "vertex-ai", label: "Google Vertex AI", description: "Gemini Pro, PaLM 2 (HIPAA)" },
  { value: "ollama", label: "Ollama", description: "Local: Llama 3, Mistral, Phi-3" },
  { value: "vllm", label: "vLLM", description: "Self-hosted high-performance" },
  { value: "tgi", label: "Text Gen Inference", description: "HuggingFace TGI" },
  { value: "llamacpp", label: "llama.cpp", description: "CPU/GPU optimized" },
  { value: "lmstudio", label: "LM Studio", description: "Local desktop LLM" },
  { value: "localai", label: "LocalAI", description: "OpenAI-compatible local" },
  { value: "custom", label: "Custom OpenAI API", description: "Any compatible endpoint" },
];

export function ConnectionDialog({ isOpen, onClose, editConnection }: ConnectionDialogProps) {
  const { addConnection, updateConnection, testConnection } = useConnectionsStore();
  const toast = useToastStore();

  const [name, setName] = useState("");
  const [provider, setProvider] = useState<LLMProvider>("openai");
  
  // Common fields
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  
  // Azure AI Foundry
  const [azureEndpoint, setAzureEndpoint] = useState("");
  const [azureApiKey, setAzureApiKey] = useState("");
  const [azureDeployment, setAzureDeployment] = useState("");
  
  // AWS Bedrock
  const [awsAccessKey, setAwsAccessKey] = useState("");
  const [awsSecretKey, setAwsSecretKey] = useState("");
  const [awsRegion, setAwsRegion] = useState("us-east-1");
  
  // Vertex AI
  const [gcpProjectId, setGcpProjectId] = useState("");
  const [gcpLocation, setGcpLocation] = useState("us-central1");
  const [gcpServiceAccount, setGcpServiceAccount] = useState("");
  
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reset form
  useEffect(() => {
    if (isOpen) {
      if (editConnection) {
        setName(editConnection.name);
        setProvider(editConnection.provider);
        setApiKey("");
        setBaseUrl(editConnection.baseUrl || "");
      } else {
        // Reset all fields
        setName("");
        setProvider("openai");
        setApiKey("");
        setBaseUrl("");
        setAzureEndpoint("");
        setAzureApiKey("");
        setAzureDeployment("");
        setAwsAccessKey("");
        setAwsSecretKey("");
        setAwsRegion("us-east-1");
        setGcpProjectId("");
        setGcpLocation("us-central1");
        setGcpServiceAccount("");
      }
      setTestResult(null);
    }
  }, [isOpen, editConnection]);

  const handleProviderChange = (newProvider: LLMProvider) => {
    setProvider(newProvider);
    setTestResult(null);

    // Set defaults for self-hosted
    const defaults: Record<string, string> = {
      ollama: "http://localhost:11434/v1",
      lmstudio: "http://localhost:1234/v1",
      vllm: "http://localhost:8000/v1",
      tgi: "http://localhost:8080/v1",
      llamacpp: "http://localhost:8080/v1",
      localai: "http://localhost:8080/v1",
    };
    
    setBaseUrl(defaults[newProvider] || "");
  };

  const handleTest = async () => {
    // Validation per provider
    if (provider === "azure-foundry" && (!azureEndpoint || !azureApiKey)) {
      setTestResult({ success: false, message: "Azure endpoint and API key required" });
      return;
    }
    if (provider === "aws-bedrock" && (!awsAccessKey || !awsSecretKey || !awsRegion)) {
      setTestResult({ success: false, message: "AWS credentials and region required" });
      return;
    }
    if (provider === "vertex-ai" && (!gcpProjectId || !gcpServiceAccount)) {
      setTestResult({ success: false, message: "GCP project ID and service account required" });
      return;
    }
    
    const selfHosted = ["ollama", "vllm", "tgi", "llamacpp", "lmstudio", "localai", "custom"];
    if (!selfHosted.includes(provider) && provider !== "azure-foundry" && provider !== "aws-bedrock" && provider !== "vertex-ai") {
      if (!apiKey.trim()) {
        setTestResult({ success: false, message: "API key required" });
        return;
      }
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

    setIsSaving(true);

    try {
      const formData: ConnectionFormData = {
        name: name.trim(),
        provider,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
      };

      if (editConnection) {
        const updateData: Partial<ConnectionFormData> = {
          name: formData.name,
          provider: formData.provider,
          baseUrl: formData.baseUrl,
        };
        if (apiKey.trim()) {
          updateData.apiKey = apiKey.trim();
        }
        await updateConnection(editConnection.id, updateData);
        toast.success("Connection Updated", `"${name}" updated successfully`);
      } else {
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
  
  // Render provider-specific fields
  const renderProviderFields = () => {
    switch (provider) {
      case "azure-foundry":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Globe className="w-4 h-4 inline mr-1" />
                Azure Endpoint
              </label>
              <input
                type="text"
                value={azureEndpoint}
                onChange={(e) => setAzureEndpoint(e.target.value)}
                placeholder="https://YOUR-RESOURCE.openai.azure.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Key className="w-4 h-4 inline mr-1" />
                API Key
              </label>
              <input
                type="password"
                value={azureApiKey}
                onChange={(e) => setAzureApiKey(e.target.value)}
                placeholder="Enter your Azure API key"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Deployment Name
              </label>
              <input
                type="text"
                value={azureDeployment}
                onChange={(e) => setAzureDeployment(e.target.value)}
                placeholder="gpt-4"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </>
        );
        
      case "aws-bedrock":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Key className="w-4 h-4 inline mr-1" />
                AWS Access Key ID
              </label>
              <input
                type="password"
                value={awsAccessKey}
                onChange={(e) => setAwsAccessKey(e.target.value)}
                placeholder="AKIA..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Key className="w-4 h-4 inline mr-1" />
                AWS Secret Access Key
              </label>
              <input
                type="password"
                value={awsSecretKey}
                onChange={(e) => setAwsSecretKey(e.target.value)}
                placeholder="Enter your AWS secret key"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Globe className="w-4 h-4 inline mr-1" />
                AWS Region
              </label>
              <select
                value={awsRegion}
                onChange={(e) => setAwsRegion(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="us-east-1">US East (N. Virginia)</option>
                <option value="us-west-2">US West (Oregon)</option>
                <option value="eu-west-1">EU (Ireland)</option>
                <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
              </select>
            </div>
          </>
        );
        
      case "vertex-ai":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                GCP Project ID
              </label>
              <input
                type="text"
                value={gcpProjectId}
                onChange={(e) => setGcpProjectId(e.target.value)}
                placeholder="my-project-123456"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Globe className="w-4 h-4 inline mr-1" />
                Location
              </label>
              <select
                value={gcpLocation}
                onChange={(e) => setGcpLocation(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="us-central1">us-central1</option>
                <option value="us-east1">us-east1</option>
                <option value="europe-west1">europe-west1</option>
                <option value="asia-southeast1">asia-southeast1</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Key className="w-4 h-4 inline mr-1" />
                Service Account JSON
              </label>
              <textarea
                value={gcpServiceAccount}
                onChange={(e) => setGcpServiceAccount(e.target.value)}
                placeholder='{"type": "service_account", ...}'
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-xs"
              />
            </div>
          </>
        );
        
      case "ollama":
      case "vllm":
      case "tgi":
      case "llamacpp":
      case "lmstudio":
      case "localai":
      case "custom":
        return (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Globe className="w-4 h-4 inline mr-1" />
              Base URL
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434/v1"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">
              OpenAI-compatible API endpoint
            </p>
          </div>
        );
        
      case "openai":
      case "anthropic":
      default:
        return (
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
                  : `Enter your ${PROVIDERS.find(p => p.value === provider)?.label} API key`
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
            />
            {isEditing && (
              <p className="mt-1 text-xs text-slate-500">
                Leave empty to keep the current API key
              </p>
            )}
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
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
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Connection Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Connection Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My OpenAI Connection"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Provider Dropdown */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Provider
            </label>
            <div className="relative">
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none bg-white"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} — {p.description}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Provider-specific fields */}
          {renderProviderFields()}

          {/* Test Connection */}
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
                  Testing...
                </>
              ) : (
                <>
                  <Plug className="w-4 h-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>

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
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
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
