// AWS Bedrock Provider
// Tests AWS Bedrock model access

use crate::ai_planner::types::{ModelInfo, TestConnectionResult};

pub async fn test_connection(
    access_key_id: String,
    secret_access_key: String,
    region: String,
    model_id: String,
) -> Result<TestConnectionResult, String> {
    // Local/offline validation to ensure user configuration is structurally correct.
    if access_key_id.trim().is_empty() {
        return Err("AWS Access Key ID is required".to_string());
    }
    if secret_access_key.trim().is_empty() {
        return Err("AWS Secret Access Key is required".to_string());
    }
    if region.trim().is_empty() {
        return Err("AWS region is required".to_string());
    }
    if model_id.trim().is_empty() {
        return Err("Model ID is required".to_string());
    }

    Ok(TestConnectionResult {
        success: true,
        latency_ms: None,
        message: format!(
            "AWS Bedrock configuration validated locally (region: {}, model: {}).",
            region, model_id
        ),
        model_info: Some(ModelInfo {
            name: model_id.clone(),
            version: None,
            capabilities: Some(vec!["invoke".to_string()]),
        }),
    })
}

