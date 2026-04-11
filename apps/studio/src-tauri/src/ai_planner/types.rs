// AI Planner Types
// Data structures for LLM connections and validation results
// 
// SECURITY: API keys are stored in the Vault (OS keyring), NOT in SQLite.
// SQLite only stores non-sensitive metadata and config.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Provider configuration - SECRETS ARE STORED SEPARATELY IN VAULT
/// The api_key fields here are transient (for UI/API) and NOT persisted to SQLite.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum ProviderConfig {
    AzureFoundry {
        endpoint: String,
        deployment: String,
        #[serde(rename = "apiKey", skip_serializing_if = "is_placeholder")]
        api_key: String,
        #[serde(rename = "apiVersion")]
        api_version: Option<String>,
    },
    AwsBedrock {
        #[serde(rename = "accessKeyId", skip_serializing_if = "is_placeholder")]
        access_key_id: String,
        #[serde(rename = "secretAccessKey", skip_serializing_if = "is_placeholder")]
        secret_access_key: String,
        region: String,
        #[serde(rename = "modelId")]
        model_id: String,
    },
    VertexAi {
        #[serde(rename = "projectId")]
        project_id: String,
        location: String,
        #[serde(rename = "serviceAccountJson", skip_serializing_if = "is_placeholder")]
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
        #[serde(rename = "apiKey", skip_serializing_if = "is_placeholder")]
        api_key: String,
        #[serde(rename = "baseUrl")]
        base_url: Option<String>,
        model: String,
    },
    Anthropic {
        #[serde(rename = "apiKey", skip_serializing_if = "is_placeholder")]
        api_key: String,
        model: String,
    },
    Custom {
        name: String,
        #[serde(rename = "baseUrl")]
        base_url: String,
        #[serde(rename = "apiKey", skip_serializing_if = "Option::is_none")]
        api_key: Option<String>,
        model: String,
        headers: Option<HashMap<String, String>>,
    },
}

/// Placeholder value used when secrets are stored in Vault
const VAULT_PLACEHOLDER: &str = "***VAULT***";

/// Check if a string is the vault placeholder (used for skip_serializing_if)
fn is_placeholder(s: &str) -> bool {
    s == VAULT_PLACEHOLDER || s.is_empty()
}

impl ProviderConfig {
    /// Get the vault key for storing secrets for this connection
    pub fn get_vault_keys(connection_id: &str, provider: &str) -> Vec<String> {
        match provider {
            "azure-foundry" => vec![format!("llm_{}_{}", connection_id, "api_key")],
            "aws-bedrock" => vec![
                format!("llm_{}_{}", connection_id, "access_key_id"),
                format!("llm_{}_{}", connection_id, "secret_access_key"),
            ],
            "vertex-ai" => vec![format!("llm_{}_{}", connection_id, "service_account_json")],
            "openai" => vec![format!("llm_{}_{}", connection_id, "api_key")],
            "anthropic" => vec![format!("llm_{}_{}", connection_id, "api_key")],
            "custom" => vec![format!("llm_{}_{}", connection_id, "api_key")],
            // Local providers don't need secrets
            _ => vec![],
        }
    }
    
    /// Extract secrets from config (to be stored in Vault)
    pub fn extract_secrets(&self, connection_id: &str) -> HashMap<String, String> {
        let mut secrets = HashMap::new();
        match self {
            ProviderConfig::AzureFoundry { api_key, .. } => {
                if !api_key.is_empty() && api_key != VAULT_PLACEHOLDER {
                    secrets.insert(format!("llm_{}_{}", connection_id, "api_key"), api_key.clone());
                }
            }
            ProviderConfig::AwsBedrock { access_key_id, secret_access_key, .. } => {
                if !access_key_id.is_empty() && access_key_id != VAULT_PLACEHOLDER {
                    secrets.insert(format!("llm_{}_{}", connection_id, "access_key_id"), access_key_id.clone());
                }
                if !secret_access_key.is_empty() && secret_access_key != VAULT_PLACEHOLDER {
                    secrets.insert(format!("llm_{}_{}", connection_id, "secret_access_key"), secret_access_key.clone());
                }
            }
            ProviderConfig::VertexAi { service_account_json, .. } => {
                if !service_account_json.is_empty() && service_account_json != VAULT_PLACEHOLDER {
                    secrets.insert(format!("llm_{}_{}", connection_id, "service_account_json"), service_account_json.clone());
                }
            }
            ProviderConfig::Openai { api_key, .. } => {
                if !api_key.is_empty() && api_key != VAULT_PLACEHOLDER {
                    secrets.insert(format!("llm_{}_{}", connection_id, "api_key"), api_key.clone());
                }
            }
            ProviderConfig::Anthropic { api_key, .. } => {
                if !api_key.is_empty() && api_key != VAULT_PLACEHOLDER {
                    secrets.insert(format!("llm_{}_{}", connection_id, "api_key"), api_key.clone());
                }
            }
            ProviderConfig::Custom { api_key, .. } => {
                if let Some(key) = api_key {
                    if !key.is_empty() && key != VAULT_PLACEHOLDER {
                        secrets.insert(format!("llm_{}_{}", connection_id, "api_key"), key.clone());
                    }
                }
            }
            // Local providers don't have secrets
            _ => {}
        }
        secrets
    }
    
    /// Create a sanitized copy with secrets replaced by placeholders (for SQLite storage)
    pub fn sanitize_for_storage(&self) -> Self {
        match self.clone() {
            ProviderConfig::AzureFoundry { endpoint, deployment, api_version, .. } => {
                ProviderConfig::AzureFoundry {
                    endpoint,
                    deployment,
                    api_key: VAULT_PLACEHOLDER.to_string(),
                    api_version,
                }
            }
            ProviderConfig::AwsBedrock { region, model_id, .. } => {
                ProviderConfig::AwsBedrock {
                    access_key_id: VAULT_PLACEHOLDER.to_string(),
                    secret_access_key: VAULT_PLACEHOLDER.to_string(),
                    region,
                    model_id,
                }
            }
            ProviderConfig::VertexAi { project_id, location, model, .. } => {
                ProviderConfig::VertexAi {
                    project_id,
                    location,
                    service_account_json: VAULT_PLACEHOLDER.to_string(),
                    model,
                }
            }
            ProviderConfig::Openai { base_url, model, .. } => {
                ProviderConfig::Openai {
                    api_key: VAULT_PLACEHOLDER.to_string(),
                    base_url,
                    model,
                }
            }
            ProviderConfig::Anthropic { model, .. } => {
                ProviderConfig::Anthropic {
                    api_key: VAULT_PLACEHOLDER.to_string(),
                    model,
                }
            }
            ProviderConfig::Custom { name, base_url, model, headers, api_key } => {
                ProviderConfig::Custom {
                    name,
                    base_url,
                    api_key: if api_key.is_some() { Some(VAULT_PLACEHOLDER.to_string()) } else { None },
                    model,
                    headers,
                }
            }
            // Local providers don't have secrets - return as-is
            other => other,
        }
    }
    
    /// Restore secrets from Vault into config
    pub fn restore_secrets(&mut self, connection_id: &str, secrets: &HashMap<String, String>) {
        match self {
            ProviderConfig::AzureFoundry { api_key, .. } => {
                if let Some(key) = secrets.get(&format!("llm_{}_{}", connection_id, "api_key")) {
                    *api_key = key.clone();
                }
            }
            ProviderConfig::AwsBedrock { access_key_id, secret_access_key, .. } => {
                if let Some(key) = secrets.get(&format!("llm_{}_{}", connection_id, "access_key_id")) {
                    *access_key_id = key.clone();
                }
                if let Some(key) = secrets.get(&format!("llm_{}_{}", connection_id, "secret_access_key")) {
                    *secret_access_key = key.clone();
                }
            }
            ProviderConfig::VertexAi { service_account_json, .. } => {
                if let Some(key) = secrets.get(&format!("llm_{}_{}", connection_id, "service_account_json")) {
                    *service_account_json = key.clone();
                }
            }
            ProviderConfig::Openai { api_key, .. } => {
                if let Some(key) = secrets.get(&format!("llm_{}_{}", connection_id, "api_key")) {
                    *api_key = key.clone();
                }
            }
            ProviderConfig::Anthropic { api_key, .. } => {
                if let Some(key) = secrets.get(&format!("llm_{}_{}", connection_id, "api_key")) {
                    *api_key = key.clone();
                }
            }
            ProviderConfig::Custom { api_key, .. } => {
                if let Some(key) = secrets.get(&format!("llm_{}_{}", connection_id, "api_key")) {
                    *api_key = Some(key.clone());
                }
            }
            // Local providers don't have secrets
            _ => {}
        }
    }
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

