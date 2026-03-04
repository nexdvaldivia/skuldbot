// Google Vertex AI Provider
// Tests Vertex AI model access

use crate::ai_planner::types::{ModelInfo, TestConnectionResult};

pub async fn test_connection(
    project_id: String,
    location: String,
    service_account_json: String,
    model: String,
) -> Result<TestConnectionResult, String> {
    // Local/offline validation to ensure service-account payload is structurally sound.
    if project_id.trim().is_empty() || location.trim().is_empty() {
        return Err("Project ID and location are required".to_string());
    }

    if model.trim().is_empty() {
        return Err("Model is required".to_string());
    }

    let service_account: serde_json::Value = serde_json::from_str(&service_account_json)
        .map_err(|e| format!("Service Account JSON is invalid: {}", e))?;

    let has_client_email = service_account.get("client_email").and_then(|v| v.as_str()).is_some();
    let has_private_key = service_account.get("private_key").and_then(|v| v.as_str()).is_some();
    if !has_client_email || !has_private_key {
        return Err("Service Account JSON must include client_email and private_key".to_string());
    }

    Ok(TestConnectionResult {
        success: true,
        latency_ms: None,
        message: format!(
            "Vertex AI configuration validated locally (project: {}, location: {}, model: {}).",
            project_id, location, model
        ),
        model_info: Some(ModelInfo {
            name: model.clone(),
            version: None,
            capabilities: Some(vec!["predict".to_string(), "generate".to_string()]),
        }),
    })
}

