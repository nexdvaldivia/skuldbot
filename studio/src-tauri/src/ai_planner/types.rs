// AI Planner Types
// Data structures for LLM connections and validation results

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum ProviderConfig {
    AzureFoundry {
        endpoint: String,
        deployment: String,
        #[serde(rename = "apiKey")]
        api_key: String,
        #[serde(rename = "apiVersion")]
        api_version: Option<String>,
    },
    AwsBedrock {
        #[serde(rename = "accessKeyId")]
        access_key_id: String,
        #[serde(rename = "secretAccessKey")]
        secret_access_key: String,
        region: String,
        #[serde(rename = "modelId")]
        model_id: String,
    },
    VertexAi {
        #[serde(rename = "projectId")]
        project_id: String,
        location: String,
        #[serde(rename = "serviceAccountJson")]
        service_account_json: String,
        model: String,
    },
    Ollama {
        #[serde(rename = "baseUrl")]
        base_url: String,
        model: String,
    },
    Vllm {
        #[serde(rename = "baseUrl")]
        base_url: String,
        model: String,
    },
    Tgi {
        #[serde(rename = "baseUrl")]
        base_url: String,
        model: String,
    },
    Llamacpp {
        #[serde(rename = "baseUrl")]
        base_url: String,
        model: String,
    },
    Lmstudio {
        #[serde(rename = "baseUrl")]
        base_url: String,
        model: String,
    },
    Localai {
        #[serde(rename = "baseUrl")]
        base_url: String,
        model: String,
    },
    Openai {
        #[serde(rename = "apiKey")]
        api_key: String,
        #[serde(rename = "baseUrl")]
        base_url: Option<String>,
        model: String,
    },
    Anthropic {
        #[serde(rename = "apiKey")]
        api_key: String,
        model: String,
    },
    Custom {
        name: String,
        #[serde(rename = "baseUrl")]
        base_url: String,
        #[serde(rename = "apiKey")]
        api_key: Option<String>,
        model: String,
        headers: Option<HashMap<String, String>>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMConnection {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub config: ProviderConfig,
    #[serde(rename = "isDefault")]
    pub is_default: bool,
    #[serde(rename = "lastUsedAt")]
    pub last_used_at: Option<String>,
    #[serde(rename = "healthStatus")]
    pub health_status: Option<HealthStatus>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatus {
    pub status: String, // "healthy", "degraded", "down"
    #[serde(rename = "lastCheckedAt")]
    pub last_checked_at: String,
    #[serde(rename = "latencyMs")]
    pub latency_ms: Option<u64>,
    #[serde(rename = "errorMessage")]
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestConnectionResult {
    pub success: bool,
    #[serde(rename = "latencyMs")]
    pub latency_ms: Option<u64>,
    pub message: String,
    #[serde(rename = "modelInfo")]
    pub model_info: Option<ModelInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    pub version: Option<String>,
    pub capabilities: Option<Vec<String>>,
}

