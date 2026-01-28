// Self-Hosted Provider (vLLM, TGI, llama.cpp, LM Studio, LocalAI)
// Tests OpenAI-compatible self-hosted endpoints

use crate::ai_planner::types::{ModelInfo, TestConnectionResult};
use serde_json::json;

pub async fn test_connection(
    base_url: String,
    model: String,
) -> Result<TestConnectionResult, String> {
    // Try OpenAI-compatible /v1/chat/completions endpoint
    let url = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))  // 2 minutes for large models
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .post(&url)
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
                format!("Connection timeout. Is the server running at {}?", base_url)
            } else if e.is_connect() {
                format!("Cannot connect to {}. Check if the server is running and accessible.", base_url)
            } else {
                format!("Request failed: {}", e)
            }
        })?;

    let status = response.status();
    
    if status.is_success() {
        Ok(TestConnectionResult {
            success: true,
            latency_ms: None,
            message: format!("Connected successfully to self-hosted model '{}'", model),
            model_info: Some(ModelInfo {
                name: model.clone(),
                version: None,
                capabilities: Some(vec!["chat".to_string(), "completions".to_string()]),
            }),
        })
    } else {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        
        let error_msg = if status.as_u16() == 404 {
            format!(
                "Endpoint not found. Make sure the server exposes /v1/chat/completions. Server response: {}",
                error_text
            )
        } else if status.as_u16() == 422 {
            "Invalid request format. The server may not be OpenAI-compatible.".to_string()
        } else {
            format!("Server error ({}): {}", status, error_text)
        };
        
        Err(error_msg)
    }
}

