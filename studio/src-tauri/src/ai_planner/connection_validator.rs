// Connection Validator
// Tests LLM connections and returns health status

use super::providers;
use super::types::{ProviderConfig, TestConnectionResult};
use std::time::Instant;

pub async fn test_connection(config: ProviderConfig) -> Result<TestConnectionResult, String> {
    let start = Instant::now();

    let result = match config {
        ProviderConfig::AzureFoundry {
            endpoint,
            deployment,
            api_key,
            api_version,
        } => {
            providers::azure::test_connection(endpoint, deployment, api_key, api_version).await
        }
        ProviderConfig::AwsBedrock {
            access_key_id,
            secret_access_key,
            region,
            model_id,
        } => {
            providers::aws::test_connection(access_key_id, secret_access_key, region, model_id)
                .await
        }
        ProviderConfig::VertexAi {
            project_id,
            location,
            service_account_json,
            model,
        } => {
            providers::vertex::test_connection(project_id, location, service_account_json, model)
                .await
        }
        ProviderConfig::Ollama { base_url, model } => {
            providers::ollama::test_connection(base_url, model).await
        }
        ProviderConfig::Vllm { base_url, model }
        | ProviderConfig::Tgi { base_url, model }
        | ProviderConfig::Llamacpp { base_url, model }
        | ProviderConfig::Lmstudio { base_url, model }
        | ProviderConfig::Localai { base_url, model } => {
            providers::self_hosted::test_connection(base_url, model).await
        }
        ProviderConfig::Openai {
            api_key,
            base_url,
            model,
        } => providers::openai::test_connection(api_key, base_url, model).await,
        ProviderConfig::Anthropic { api_key, model } => {
            providers::anthropic::test_connection(api_key, model).await
        }
        ProviderConfig::Custom {
            name,
            base_url,
            api_key,
            model,
            headers,
        } => providers::custom::test_connection(name, base_url, api_key, model, headers).await,
    };

    match result {
        Ok(mut test_result) => {
            test_result.latency_ms = Some(start.elapsed().as_millis() as u64);
            Ok(test_result)
        }
        Err(e) => Ok(TestConnectionResult {
            success: false,
            latency_ms: Some(start.elapsed().as_millis() as u64),
            message: e,
            model_info: None,
        }),
    }
}

