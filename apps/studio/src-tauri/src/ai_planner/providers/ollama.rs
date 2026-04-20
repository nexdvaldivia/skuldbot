// Ollama Provider
// Tests Ollama local server connections

use crate::ai_planner::types::{ModelInfo, TestConnectionResult};
use serde_json::json;

pub async fn test_connection(
    base_url: String,
    model: String,
) -> Result<TestConnectionResult, String> {
    // First, try to list models to verify server is running
    let list_url = format!("{}/api/tags", base_url.trim_end_matches('/'));
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))  // 2 minutes for large models
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let list_response = client
        .get(&list_url)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "Connection timeout. Is Ollama server running?".to_string()
            } else if e.is_connect() {
                format!("Cannot connect to Ollama at {}. Make sure it's running.", base_url)
            } else {
                format!("Request failed: {}", e)
            }
        })?;

    if !list_response.status().is_success() {
        return Err(format!("Ollama server returned error: {}", list_response.status()));
    }

    // Parse models list
    let models_json: serde_json::Value = list_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

    let available_models: Vec<String> = models_json["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    if available_models.is_empty() {
        return Err("No models found in Ollama. Run 'ollama pull <model>' first.".to_string());
    }

    // Check if requested model exists
    let model_exists = available_models.iter().any(|m| m.contains(&model));
    
    if !model_exists {
        return Err(format!(
            "Model '{}' not found. Available: {}",
            model,
            available_models.join(", ")
        ));
    }

    // Try a test generation
    let generate_url = format!("{}/api/generate", base_url.trim_end_matches('/'));
    
    let response = client
        .post(&generate_url)
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": model,
            "prompt": "test",
            "stream": false,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to generate: {}", e))?;

    if response.status().is_success() {
        Ok(TestConnectionResult {
            success: true,
            latency_ms: None,
            message: format!("Connected successfully to Ollama model '{}'", model),
            model_info: Some(ModelInfo {
                name: model.clone(),
                version: None,
                capabilities: Some(vec!["generate".to_string(), "chat".to_string()]),
            }),
        })
    } else {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        Err(format!("Ollama generation failed: {}", error_text))
    }
}

