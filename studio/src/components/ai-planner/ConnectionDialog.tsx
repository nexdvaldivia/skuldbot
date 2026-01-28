/**
 * Connection Dialog
 * Modal for creating and editing LLM connections with provider-specific configurations
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Key, Globe, Loader2, CheckCircle, AlertCircle, Plug } from "lucide-react";
import { Button } from "../ui/Button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "../ui/select";
import { useConnectionsStore, ConnectionFormData } from "../../store/connectionsStore";
import { 
  LLMProvider, 
  LLMConnection,
  ProviderConfig,
  AzureFoundryConfig,
  AWSBedrockConfig,
  VertexAIConfig,
  OllamaConfig,
  VLLMConfig,
  TGIConfig,
  LlamaCppConfig,
  LMStudioConfig,
  LocalAIConfig,
  OpenAIConfig,
  AnthropicConfig,
  CustomConfig
} from "../../types/ai-planner";
import { useToastStore } from "../../store/toastStore";

interface ConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editingConnection?: LLMConnection | null;
}

const PROVIDER_GROUPS = [
  {
    label: "Cloud Managed (HIPAA with BAA)",
    providers: [
      { value: "azure-foundry" as LLMProvider, label: "Azure AI Foundry", description: "GPT-4, Llama 3, Phi-3" },
      { value: "aws-bedrock" as LLMProvider, label: "AWS Bedrock", description: "Claude 3.5, Llama 3" },
      { value: "vertex-ai" as LLMProvider, label: "Google Vertex AI", description: "Gemini Pro, PaLM 2" },
    ],
  },
  {
    label: "Cloud with BAA",
    providers: [
      { value: "openai" as LLMProvider, label: "OpenAI", description: "GPT-4o, o1, GPT-4 Turbo" },
      { value: "anthropic" as LLMProvider, label: "Anthropic", description: "Claude 3.5 Sonnet, Opus" },
    ],
  },
  {
    label: "Self-Hosted (Full HIPAA Control)",
    providers: [
      { value: "ollama" as LLMProvider, label: "Ollama", description: "Local: Llama 3, Mistral" },
      { value: "vllm" as LLMProvider, label: "vLLM", description: "High-performance inference" },
      { value: "tgi" as LLMProvider, label: "Text Gen Inference", description: "HuggingFace TGI" },
      { value: "llamacpp" as LLMProvider, label: "llama.cpp", description: "CPU/GPU optimized" },
      { value: "lmstudio" as LLMProvider, label: "LM Studio", description: "Local desktop LLM" },
      { value: "localai" as LLMProvider, label: "LocalAI", description: "OpenAI-compatible" },
    ],
  },
  {
    label: "Custom",
    providers: [
      { value: "custom" as LLMProvider, label: "Custom", description: "Any OpenAI-compatible API" },
    ],
  },
];

export function ConnectionDialog({ isOpen, onClose, editingConnection }: ConnectionDialogProps) {
  const { addConnection, updateConnection, testConnection } = useConnectionsStore();
  const toast = useToastStore();

  const [name, setName] = useState("");
  const [provider, setProvider] = useState<LLMProvider>("openai");
  
  // Azure AI Foundry
  const [azureEndpoint, setAzureEndpoint] = useState("");
  const [azureDeployment, setAzureDeployment] = useState("");
  const [azureApiKey, setAzureApiKey] = useState("");
  const [azureApiVersion, setAzureApiVersion] = useState("2024-02-15-preview");
  
  // AWS Bedrock
  const [awsAccessKeyId, setAwsAccessKeyId] = useState("");
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState("");
  const [awsRegion, setAwsRegion] = useState("us-east-1");
  const [awsModelId, setAwsModelId] = useState("anthropic.claude-3-5-sonnet-20240620-v1:0");
  
  // Vertex AI
  const [gcpProjectId, setGcpProjectId] = useState("");
  const [gcpLocation, setGcpLocation] = useState("us-central1");
  const [gcpServiceAccountJson, setGcpServiceAccountJson] = useState("");
  const [gcpModel, setGcpModel] = useState("gemini-pro");
  
  // Self-hosted (Ollama, vLLM, etc.)
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  
  // OpenAI / Anthropic
  const [apiKey, setApiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o");
  const [anthropicModel, setAnthropicModel] = useState("claude-3-5-sonnet-20241022");
  
  // Custom
  const [customName, setCustomName] = useState("");
  const [customHeaders, setCustomHeaders] = useState("");
  
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reset form
  useEffect(() => {
    if (!isOpen) return;
    
    // Use setTimeout to defer heavy operations after render
    const timer = setTimeout(() => {
      if (editingConnection) {
        setName(editingConnection.name);
        setProvider(editingConnection.provider);
        
        // Load config based on provider type
        const config = editingConnection.config;
        switch (config.type) {
          case "azure-foundry":
            setAzureEndpoint(config.endpoint);
            setAzureDeployment(config.deployment);
            setAzureApiVersion(config.apiVersion || "2024-02-15-preview");
            setAzureApiKey(""); // Don't show existing key
            break;
          case "aws-bedrock":
            setAwsRegion(config.region);
            setAwsModelId(config.modelId);
            setAwsAccessKeyId(""); // Don't show existing keys
            setAwsSecretAccessKey("");
            break;
          case "vertex-ai":
            setGcpProjectId(config.projectId);
            setGcpLocation(config.location);
            setGcpModel(config.model);
            setGcpServiceAccountJson(""); // Don't show existing JSON
            break;
          case "ollama":
          case "vllm":
          case "tgi":
          case "llamacpp":
          case "lmstudio":
          case "localai":
            setBaseUrl(config.baseUrl);
            setModel(config.model);
            break;
          case "openai":
            setOpenaiModel(config.model);
            setApiKey(""); // Don't show existing key
            if (config.baseUrl) setBaseUrl(config.baseUrl);
            break;
          case "anthropic":
            setAnthropicModel(config.model);
            setApiKey(""); // Don't show existing key
            break;
          case "custom":
            setCustomName(config.name);
            setBaseUrl(config.baseUrl);
            setModel(config.model);
            setApiKey(""); // Don't show existing key
            break;
        }
      } else {
        // Reset all fields
        resetForm();
      }
      setTestResult(null);
    }, 0);
    
    return () => clearTimeout(timer);
  }, [isOpen, editingConnection, resetForm]);

  const resetForm = useCallback(() => {
    setName("");
    setProvider("openai");
    setAzureEndpoint("");
    setAzureDeployment("");
    setAzureApiKey("");
    setAzureApiVersion("2024-02-15-preview");
    setAwsAccessKeyId("");
    setAwsSecretAccessKey("");
    setAwsRegion("us-east-1");
    setAwsModelId("anthropic.claude-3-5-sonnet-20240620-v1:0");
    setGcpProjectId("");
    setGcpLocation("us-central1");
    setGcpServiceAccountJson("");
    setGcpModel("gemini-pro");
    setBaseUrl("");
    setModel("");
    setApiKey("");
    setOpenaiModel("gpt-4o");
    setAnthropicModel("claude-3-5-sonnet-20241022");
    setCustomName("");
    setCustomHeaders("");
  }, []);

  const handleProviderChange = useCallback((newProvider: LLMProvider) => {
    setProvider(newProvider);
    setTestResult(null);

    // Set defaults for self-hosted
    const defaults: Record<string, { url: string; model: string }> = {
      ollama: { url: "http://localhost:11434", model: "qwen2.5-coder:7b" },
      lmstudio: { url: "http://localhost:1234/v1", model: "local-model" },
      vllm: { url: "http://localhost:8000", model: "meta-llama/Llama-3.2-3B-Instruct" },
      tgi: { url: "http://localhost:8080", model: "mistralai/Mixtral-8x7B-Instruct-v0.1" },
      llamacpp: { url: "http://localhost:8080", model: "llama-3.2-3b-instruct" },
      localai: { url: "http://localhost:8080", model: "gpt-4" },
    };
    
    if (defaults[newProvider]) {
      setBaseUrl(defaults[newProvider].url);
      setModel(defaults[newProvider].model);
    }
  }, []);

  const buildProviderConfig = (): ProviderConfig | null => {
    switch (provider) {
      case "azure-foundry":
        if (!azureEndpoint || !azureDeployment || !azureApiKey) return null;
        return {
          type: "azure-foundry",
          endpoint: azureEndpoint,
          deployment: azureDeployment,
          apiKey: azureApiKey,
          apiVersion: azureApiVersion,
        } as AzureFoundryConfig;

      case "aws-bedrock":
        if (!awsAccessKeyId || !awsSecretAccessKey || !awsRegion) return null;
        const finalAwsModelId = awsModelId === "custom" ? model : awsModelId;
        if (!finalAwsModelId) return null;
        return {
          type: "aws-bedrock",
          accessKeyId: awsAccessKeyId,
          secretAccessKey: awsSecretAccessKey,
          region: awsRegion,
          modelId: finalAwsModelId,
        } as AWSBedrockConfig;

      case "vertex-ai":
        if (!gcpProjectId || !gcpLocation || !gcpServiceAccountJson) return null;
        const finalGcpModel = gcpModel === "custom" ? model : gcpModel;
        if (!finalGcpModel) return null;
        return {
          type: "vertex-ai",
          projectId: gcpProjectId,
          location: gcpLocation,
          serviceAccountJson: gcpServiceAccountJson,
          model: finalGcpModel,
        } as VertexAIConfig;

      case "ollama":
        if (!baseUrl || !model) return null;
        return { type: "ollama", baseUrl, model } as OllamaConfig;

      case "vllm":
        if (!baseUrl || !model) return null;
        return { type: "vllm", baseUrl, model } as VLLMConfig;

      case "tgi":
        if (!baseUrl || !model) return null;
        return { type: "tgi", baseUrl, model } as TGIConfig;

      case "llamacpp":
        if (!baseUrl || !model) return null;
        return { type: "llamacpp", baseUrl, model } as LlamaCppConfig;

      case "lmstudio":
        if (!baseUrl || !model) return null;
        return { type: "lmstudio", baseUrl, model } as LMStudioConfig;

      case "localai":
        if (!baseUrl || !model) return null;
        return { type: "localai", baseUrl, model } as LocalAIConfig;

      case "openai":
        if (!apiKey) return null;
        const finalOpenaiModel = openaiModel === "custom" ? model : openaiModel;
        if (!finalOpenaiModel) return null;
        return {
          type: "openai",
          apiKey,
          baseUrl: baseUrl || undefined,
          model: finalOpenaiModel,
        } as OpenAIConfig;

      case "anthropic":
        if (!apiKey) return null;
        const finalAnthropicModel = anthropicModel === "custom" ? model : anthropicModel;
        if (!finalAnthropicModel) return null;
        return {
          type: "anthropic",
          apiKey,
          model: finalAnthropicModel,
        } as AnthropicConfig;

      case "custom":
        if (!baseUrl || !model) return null;
        const headers = customHeaders ? JSON.parse(customHeaders) : undefined;
        return {
          type: "custom",
          name: customName || "Custom Provider",
          baseUrl,
          apiKey: apiKey || undefined,
          model,
          headers,
        } as CustomConfig;

      default:
        return null;
    }
  };

  const handleTest = async () => {
    const config = buildProviderConfig();
    if (!config) {
      setTestResult({ success: false, message: "Please fill in all required fields" });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testConnection(config);
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

    const config = buildProviderConfig();
    if (!config) {
      toast.warning("Incomplete Configuration", "Please fill in all required fields");
      return;
    }

    setIsSaving(true);

    try {
      const formData: ConnectionFormData = {
        name: name.trim(),
        provider,
        config,
      };

      if (editingConnection) {
        await updateConnection(editingConnection.id, formData);
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

  const isEditing = !!editingConnection;
  
  // Render provider-specific fields
  const renderProviderFields = () => {
    switch (provider) {
      case "azure-foundry":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                <Globe className="w-4 h-4 inline mr-1" />
                Azure Endpoint
              </label>
              <input
                type="text"
                value={azureEndpoint}
                onChange={(e) => setAzureEndpoint(e.target.value)}
                placeholder="https://YOUR-RESOURCE.openai.azure.com"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Deployment Name
              </label>
              <input
                type="text"
                value={azureDeployment}
                onChange={(e) => setAzureDeployment(e.target.value)}
                placeholder="gpt-4o"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                <Key className="w-4 h-4 inline mr-1" />
                API Key
              </label>
              <input
                type="password"
                value={azureApiKey}
                onChange={(e) => setAzureApiKey(e.target.value)}
                placeholder={isEditing ? "Leave empty to keep existing" : "Enter your Azure API key"}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                API Version
              </label>
              <input
                type="text"
                value={azureApiVersion}
                onChange={(e) => setAzureApiVersion(e.target.value)}
                placeholder="2024-02-15-preview"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
            </div>
          </>
        );
        
      case "aws-bedrock":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                <Key className="w-4 h-4 inline mr-1" />
                AWS Access Key ID
              </label>
              <input
                type="password"
                value={awsAccessKeyId}
                onChange={(e) => setAwsAccessKeyId(e.target.value)}
                placeholder={isEditing ? "Leave empty to keep existing" : "AKIA..."}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                <Key className="w-4 h-4 inline mr-1" />
                AWS Secret Access Key
              </label>
              <input
                type="password"
                value={awsSecretAccessKey}
                onChange={(e) => setAwsSecretAccessKey(e.target.value)}
                placeholder={isEditing ? "Leave empty to keep existing" : "Enter your AWS secret key"}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                <Globe className="w-4 h-4 inline mr-1" />
                AWS Region
              </label>
              <Select value={awsRegion} onValueChange={setAwsRegion}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us-east-1">US East (N. Virginia)</SelectItem>
                  <SelectItem value="us-west-2">US West (Oregon)</SelectItem>
                  <SelectItem value="eu-west-1">EU (Ireland)</SelectItem>
                  <SelectItem value="ap-southeast-1">Asia Pacific (Singapore)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Model ID
              </label>
              <Select value={awsModelId} onValueChange={setAwsModelId}>
                <SelectTrigger className="w-full font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic.claude-3-5-sonnet-20240620-v1:0">Claude 3.5 Sonnet</SelectItem>
                  <SelectItem value="anthropic.claude-3-opus-20240229-v1:0">Claude 3 Opus</SelectItem>
                  <SelectItem value="meta.llama3-2-90b-instruct-v1:0">Llama 3.2 90B</SelectItem>
                  <SelectItem value="meta.llama3-2-11b-instruct-v1:0">Llama 3.2 11B</SelectItem>
                  <SelectItem value="custom">Custom...</SelectItem>
                </SelectContent>
              </Select>
              {awsModelId === "custom" && (
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g., anthropic.claude-v2"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm mt-2"
                />
              )}
            </div>
          </>
        );
        
      case "vertex-ai":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                GCP Project ID
              </label>
              <input
                type="text"
                value={gcpProjectId}
                onChange={(e) => setGcpProjectId(e.target.value)}
                placeholder="my-project-123456"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                <Globe className="w-4 h-4 inline mr-1" />
                Location
              </label>
              <Select value={gcpLocation} onValueChange={setGcpLocation}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us-central1">us-central1</SelectItem>
                  <SelectItem value="us-east1">us-east1</SelectItem>
                  <SelectItem value="europe-west1">europe-west1</SelectItem>
                  <SelectItem value="asia-southeast1">asia-southeast1</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Model
              </label>
              <Select value={gcpModel} onValueChange={setGcpModel}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini-pro">Gemini Pro</SelectItem>
                  <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro</SelectItem>
                  <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash</SelectItem>
                  <SelectItem value="custom">Custom...</SelectItem>
                </SelectContent>
              </Select>
              {gcpModel === "custom" && (
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Enter custom model name"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 mt-2"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                <Key className="w-4 h-4 inline mr-1" />
                Service Account JSON
              </label>
              <textarea
                value={gcpServiceAccountJson}
                onChange={(e) => setGcpServiceAccountJson(e.target.value)}
                placeholder={isEditing ? "Leave empty to keep existing" : '{"type": "service_account", ...}'}
                rows={4}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-xs"
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
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                <Globe className="w-4 h-4 inline mr-1" />
                Base URL
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-neutral-500">
                API endpoint for your self-hosted LLM server
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Model Name
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="llama3.2:latest"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </>
        );
        
      case "openai":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                <Key className="w-4 h-4 inline mr-1" />
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isEditing ? "Leave empty to keep existing" : "sk-..."}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Model
              </label>
              <Select value={openaiModel} onValueChange={setOpenaiModel}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                  <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                  <SelectItem value="o1-preview">o1-preview</SelectItem>
                  <SelectItem value="o1-mini">o1-mini</SelectItem>
                  <SelectItem value="custom">Custom...</SelectItem>
                </SelectContent>
              </Select>
              {openaiModel === "custom" && (
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Enter custom model name"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 mt-2"
                />
              )}
            </div>
          </>
        );
        
      case "anthropic":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                <Key className="w-4 h-4 inline mr-1" />
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isEditing ? "Leave empty to keep existing" : "sk-ant-..."}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Model
              </label>
              <Select value={anthropicModel} onValueChange={setAnthropicModel}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet (New)</SelectItem>
                  <SelectItem value="claude-3-5-sonnet-20240620">Claude 3.5 Sonnet</SelectItem>
                  <SelectItem value="claude-3-opus-20240229">Claude 3 Opus</SelectItem>
                  <SelectItem value="claude-3-sonnet-20240229">Claude 3 Sonnet</SelectItem>
                  <SelectItem value="custom">Custom...</SelectItem>
                </SelectContent>
              </Select>
              {anthropicModel === "custom" && (
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Enter custom model name"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 mt-2"
                />
              )}
            </div>
          </>
        );
        
      case "custom":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Provider Name
              </label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="My Custom LLM"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                <Globe className="w-4 h-4 inline mr-1" />
                Base URL
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Model Name
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                <Key className="w-4 h-4 inline mr-1" />
                API Key (Optional)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isEditing ? "Leave empty to keep existing" : "Optional if not required"}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
            </div>
          </>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <Plug className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h2 className="font-semibold text-neutral-800">
                {isEditing ? "Edit Connection" : "New Connection"}
              </h2>
              <p className="text-xs text-neutral-500">
                {isEditing ? "Update your LLM credentials" : "Add LLM provider for AI Planner"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Connection Name */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Connection Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My OpenAI Connection"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Provider Dropdown */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Provider
            </label>
            <Select
              value={provider}
              onValueChange={(value) => handleProviderChange(value as LLMProvider)}
              disabled={isEditing}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_GROUPS.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.providers.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{p.label}</span>
                          <span className="text-xs text-neutral-500">{p.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {isEditing && (
              <p className="mt-1 text-xs text-neutral-500">
                Provider cannot be changed when editing
              </p>
            )}
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
                  testResult.success ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"
                }`}
              >
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p
                    className={`text-sm ${
                      testResult.success ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {testResult.message}
                  </p>
                  {testResult.latencyMs && (
                    <p className="text-xs text-emerald-600 mt-1">
                      Latency: {testResult.latencyMs}ms
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-200 bg-neutral-50">
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
