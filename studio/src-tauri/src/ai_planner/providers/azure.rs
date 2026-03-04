// Azure AI Foundry Provider
// Tests Azure OpenAI deployments

use crate::ai_planner::types::{ModelInfo, TestConnectionResult};
use serde_json::json;

pub async fn test_connection(
    endpoint: String,
    deployment: String,
    api_key: String,
    api_version: Option<String>,
) -> Result<TestConnectionResult, String> {
    // Validate endpoint format
    if !endpoint.starts_with("https://") {
        return Err("Azure endpoint must start with https://".to_string());
    }

    let api_ver = api_version.unwrap_or_else(|| "2024-02-15-preview".to_string());
    
    // Build URL
    let url = format!(
        "{}/openai/deployments/{}/chat/completions?api-version={}",
        endpoint.trim_end_matches('/'),
        deployment,
        api_ver
    );

    // Make test request
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .post(&url)
        .header("api-key", api_key)
        .header("Content-Type", "application/json")
        .json(&json!({
            "messages": [{"role": "user", "content": "test"}],
            "max_tokens": 5,
        }))
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "Connection timeout. Check if your Azure endpoint is correct.".to_string()
            } else if e.is_connect() {
                "Cannot connect to Azure. Check your endpoint URL.".to_string()
            } else {
                format!("Request failed: {}", e)
            }
        })?;

    let status = response.status();
    
    if status.is_success() {
        Ok(TestConnectionResult {
            success: true,
            latency_ms: None,
            message: format!("Connected successfully to deployment '{}'", deployment),
            model_info: Some(ModelInfo {
                name: deployment.clone(),
                version: None,
                capabilities: Some(vec!["chat".to_string(), "completions".to_string()]),
            }),
        })
    } else {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        
        let error_msg = if status.as_u16() == 401 {
            "Invalid API key. Check your Azure credentials.".to_string()
        } else if status.as_u16() == 404 {
            format!("Deployment '{}' not found in this Azure resource.", deployment)
        } else if status.as_u16() == 429 {
            "Rate limit exceeded. Try again in a moment.".to_string()
        } else {
            format!("Azure API error ({}): {}", status, error_text)
        };
        
        Err(error_msg)
    }
}


