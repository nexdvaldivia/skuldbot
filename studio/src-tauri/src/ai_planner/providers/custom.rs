// Custom Provider
// Tests custom OpenAI-compatible endpoints with optional headers

use crate::ai_planner::types::{ModelInfo, TestConnectionResult};
use serde_json::json;
use std::collections::HashMap;

pub async fn test_connection(
    name: String,
    base_url: String,
    api_key: Option<String>,
    model: String,
    headers: Option<HashMap<String, String>>,
) -> Result<TestConnectionResult, String> {
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))  // 2 minutes for self-hosted models
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut request = client
        .post(&url)
        .header("Content-Type", "application/json");

    // Add API key if provided
    if let Some(key) = api_key {
        request = request.header("Authorization", format!("Bearer {}", key));
    }

    // Add custom headers if provided
    if let Some(custom_headers) = headers {
        for (key, value) in custom_headers {
            request = request.header(key, value);
        }
    }

    let response = request
        .json(&json!({
            "model": model,
            "messages": [{"role": "user", "content": "test"}],
            "max_tokens": 5,
        }))
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                format!("Connection timeout. Is {} accessible?", base_url)
            } else if e.is_connect() {
                format!("Cannot connect to {}. Check the URL and network.", base_url)
            } else {
                format!("Request failed: {}", e)
            }
        })?;

    let status = response.status();
    
    if status.is_success() {
        Ok(TestConnectionResult {
            success: true,
            latency_ms: None,
            message: format!("Connected successfully to custom provider '{}' (model: {})", name, model),
            model_info: Some(ModelInfo {
                name: model.clone(),
                version: None,
                capabilities: Some(vec!["chat".to_string(), "completions".to_string()]),
            }),
        })
    } else {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        
        let error_msg = if status.as_u16() == 401 {
            "Authentication failed. Check your API key.".to_string()
        } else if status.as_u16() == 404 {
            "Endpoint not found. Verify the base URL is correct.".to_string()
        } else {
            format!("Custom provider error ({}): {}", status, error_text)
        };
        
        Err(error_msg)
    }
}

