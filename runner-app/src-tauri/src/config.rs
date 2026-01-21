use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use directories::ProjectDirs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunnerConfig {
    pub orchestrator_url: Option<String>,
    pub api_key: Option<String>,
    pub runner_id: Option<String>,
    pub runner_name: String,
    pub labels: std::collections::HashMap<String, String>,
    pub capabilities: Vec<String>,
    pub poll_interval: u32,
    pub heartbeat_interval: u32,
    pub job_timeout: u32,
    pub work_dir: String,
    pub auto_start_service: bool,
    pub start_minimized: bool,
}

impl Default for RunnerConfig {
    fn default() -> Self {
        Self {
            orchestrator_url: None,
            api_key: None,
            runner_id: None,
            runner_name: hostname::get()
                .map(|h| h.to_string_lossy().to_string())
                .unwrap_or_else(|_| "runner".to_string()),
            labels: std::collections::HashMap::new(),
            capabilities: vec![
                "web".to_string(),
                "desktop".to_string(),
                "office".to_string(),
            ],
            poll_interval: 5,
            heartbeat_interval: 30,
            job_timeout: 3600,
            work_dir: get_default_work_dir(),
            auto_start_service: true,
            start_minimized: false,
        }
    }
}

fn get_config_dir() -> PathBuf {
    ProjectDirs::from("com", "khipus", "skuldbot-runner")
        .map(|dirs| dirs.config_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

fn get_config_path() -> PathBuf {
    get_config_dir().join("config.json")
}

fn get_default_work_dir() -> String {
    ProjectDirs::from("com", "khipus", "skuldbot-runner")
        .map(|dirs| dirs.data_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
        .to_string_lossy()
        .to_string()
}

pub fn load_config() -> RunnerConfig {
    let path = get_config_path();

    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(content) => {
                match serde_json::from_str(&content) {
                    Ok(config) => return config,
                    Err(e) => eprintln!("Failed to parse config: {}", e),
                }
            }
            Err(e) => eprintln!("Failed to read config: {}", e),
        }
    }

    // Return default config
    RunnerConfig::default()
}

pub fn save_config_to_file(config: &RunnerConfig) -> Result<(), String> {
    let path = get_config_path();

    // Create config directory if needed
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;

    Ok(())
}

// Tauri commands

#[tauri::command]
pub fn get_config(config: tauri::State<RunnerConfig>) -> RunnerConfig {
    config.inner().clone()
}

#[tauri::command]
pub async fn save_config(
    _config_state: tauri::State<'_, RunnerConfig>,
    new_config: RunnerConfig,
) -> Result<(), String> {
    // Save to file
    save_config_to_file(&new_config)?;

    // Note: In a real app, you'd update the managed state here
    // For now, restart is required to apply changes

    Ok(())
}

#[tauri::command]
pub async fn test_connection(url: String) -> Result<bool, String> {
    let client = reqwest::Client::new();

    match client
        .get(format!("{}/health", url))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
    {
        Ok(response) => Ok(response.status().is_success()),
        Err(e) => Err(e.to_string()),
    }
}
