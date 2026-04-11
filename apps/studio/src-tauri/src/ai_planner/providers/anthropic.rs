// Anthropic Provider
// Tests Anthropic Claude API connections

use crate::ai_planner::types::{ModelInfo, TestConnectionResult};
use serde_json::json;

pub async fn test_connection(
    api_key: String,
    model: String,
) -> Result<TestConnectionResult, String> {
    let url = "https://api.anthropic.com/v1/messages";

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .post(url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": model,
            "messages": [{"role": "user", "content": "test"}],
            "max_tokens": 5,
        }))
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "Connection timeout. Check if Anthropic API is accessible.".to_string()
            } else if e.is_connect() {
                "Cannot connect to Anthropic. Check your network connection.".to_string()
            } else {
                format!("Request failed: {}", e)
            }
        })?;

    let status = response.status();
    
    if status.is_success() {
        Ok(TestConnectionResult {
            success: true,
            latency_ms: None,
            message: format!("Connected successfully to model '{}'", model),
            model_info: Some(ModelInfo {
                name: model.clone(),
                version: None,
                capabilities: Some(vec!["chat".to_string(), "messages".to_string()]),
            }),
        })
    } else {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        
        let error_msg = if status.as_u16() == 401 {
            "Invalid API key. Check your Anthropic credentials.".to_string()
        } else if status.as_u16() == 404 {
            format!("Model '{}' not found or not accessible.", model)
        } else if status.as_u16() == 429 {
            "Rate limit exceeded. Try again in a moment.".to_string()
        } else {
            format!("Anthropic API error ({}): {}", status, error_text)
        };
        
        Err(error_msg)
    }
}


