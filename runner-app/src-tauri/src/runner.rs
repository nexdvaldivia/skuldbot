use serde::{Deserialize, Serialize};
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri_plugin_autostart::ManagerExt;

use crate::config::RunnerConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os: String,
    pub platform: String,
    pub hostname: String,
    pub cpu_count: usize,
    pub memory_total_gb: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunnerStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub runner_id: Option<String>,
    pub orchestrator_connected: bool,
    pub current_job: Option<String>,
    pub jobs_completed: u32,
    pub jobs_failed: u32,
    pub uptime_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub node_id: Option<String>,
    pub run_id: Option<String>,
}

pub struct RunnerState {
    process: Mutex<Option<Child>>,
    start_time: Mutex<Option<std::time::Instant>>,
    jobs_completed: Mutex<u32>,
    jobs_failed: Mutex<u32>,
    // Mock mode for when Python runner is not available
    mock_running: Mutex<bool>,
}

impl RunnerState {
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
            start_time: Mutex::new(None),
            jobs_completed: Mutex::new(0),
            jobs_failed: Mutex::new(0),
            mock_running: Mutex::new(false),
        }
    }

    pub fn start(&self, config: &RunnerConfig) -> Result<(), String> {
        let mut process_guard = self.process.lock().map_err(|e| e.to_string())?;
        let mut mock_guard = self.mock_running.lock().map_err(|e| e.to_string())?;

        if process_guard.is_some() || *mock_guard {
            return Err("Runner is already running".to_string());
        }

        // Build command to start Python runner
        let mut cmd = Command::new("skuldbot-runner");
        cmd.arg("run");

        // Set environment variables
        if let Some(url) = &config.orchestrator_url {
            cmd.env("SKULDBOT_ORCHESTRATOR_URL", url);
        }
        if let Some(key) = &config.api_key {
            cmd.env("SKULDBOT_API_KEY", key);
        }
        cmd.env("SKULDBOT_RUNNER_NAME", &config.runner_name);
        cmd.env("SKULDBOT_POLL_INTERVAL", config.poll_interval.to_string());
        cmd.env("SKULDBOT_HEARTBEAT_INTERVAL", config.heartbeat_interval.to_string());
        cmd.env("SKULDBOT_JOB_TIMEOUT", config.job_timeout.to_string());
        cmd.env("SKULDBOT_WORK_DIR", &config.work_dir);

        // Try to start process, fall back to mock mode if not available
        match cmd.spawn() {
            Ok(child) => {
                *process_guard = Some(child);
            }
            Err(_) => {
                // Python runner not available - run in mock/demo mode
                *mock_guard = true;
            }
        }

        *self.start_time.lock().map_err(|e| e.to_string())? = Some(std::time::Instant::now());

        Ok(())
    }

    pub fn stop(&self) -> Result<(), String> {
        let mut process_guard = self.process.lock().map_err(|e| e.to_string())?;
        let mut mock_guard = self.mock_running.lock().map_err(|e| e.to_string())?;

        if let Some(ref mut child) = *process_guard {
            child.kill().map_err(|e| format!("Failed to stop runner: {}", e))?;
            *process_guard = None;
        }

        *mock_guard = false;
        *self.start_time.lock().map_err(|e| e.to_string())? = None;

        Ok(())
    }

    pub fn is_running(&self) -> bool {
        // Check mock mode first
        if let Ok(mock_guard) = self.mock_running.lock() {
            if *mock_guard {
                return true;
            }
        }

        if let Ok(mut guard) = self.process.lock() {
            if let Some(ref mut child) = *guard {
                // Check if process is still running
                match child.try_wait() {
                    Ok(Some(_)) => return false, // Process exited
                    Ok(None) => return true,      // Still running
                    Err(_) => return false,       // Error checking
                }
            }
        }
        false
    }

    pub fn get_pid(&self) -> Option<u32> {
        let process_guard = self.process.lock().ok()?;
        process_guard.as_ref().map(|c| c.id())
    }

    pub fn get_uptime(&self) -> u64 {
        let start_time = self.start_time.lock().ok();
        if let Some(guard) = start_time {
            if let Some(start) = *guard {
                return start.elapsed().as_secs();
            }
        }
        0
    }
}

// Tauri commands

#[tauri::command]
pub fn get_status(state: tauri::State<RunnerState>, config: tauri::State<RunnerConfig>) -> RunnerStatus {
    let jobs_completed = state.jobs_completed.lock().map(|g| *g).unwrap_or(0);
    let jobs_failed = state.jobs_failed.lock().map(|g| *g).unwrap_or(0);

    RunnerStatus {
        running: state.is_running(),
        pid: state.get_pid(),
        runner_id: config.runner_id.clone(),
        orchestrator_connected: config.orchestrator_url.is_some() && config.api_key.is_some(),
        current_job: None, // TODO: Get from runner via IPC
        jobs_completed,
        jobs_failed,
        uptime_seconds: state.get_uptime(),
    }
}

#[tauri::command]
pub fn start_runner(state: tauri::State<RunnerState>, config: tauri::State<RunnerConfig>) -> Result<(), String> {
    state.start(&config)
}

#[tauri::command]
pub fn stop_runner(state: tauri::State<RunnerState>) -> Result<(), String> {
    state.stop()
}

#[tauri::command]
pub fn restart_runner(state: tauri::State<RunnerState>, config: tauri::State<RunnerConfig>) -> Result<(), String> {
    state.stop()?;
    std::thread::sleep(std::time::Duration::from_secs(1));
    state.start(&config)
}

#[tauri::command]
pub async fn register_runner(
    orchestrator_url: String,
    name: String,
    labels: std::collections::HashMap<String, String>,
    capabilities: Vec<String>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();

    let system_info = get_system_info_internal();

    let body = serde_json::json!({
        "name": name,
        "labels": labels,
        "capabilities": capabilities,
        "agentVersion": "0.1.0",
        "systemInfo": system_info,
    });

    let response = client
        .post(format!("{}/runners/register", orchestrator_url))
        .json(&body)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Registration failed: {} - {}", status, text));
    }

    let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    Ok(data)
}

fn get_system_info_internal() -> SystemInfo {
    use sysinfo::System;

    let mut sys = System::new_all();
    sys.refresh_all();

    SystemInfo {
        os: std::env::consts::OS.to_string(),
        platform: std::env::consts::ARCH.to_string(),
        hostname: hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "unknown".to_string()),
        cpu_count: sys.cpus().len(),
        memory_total_gb: sys.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0,
    }
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    get_system_info_internal()
}

#[tauri::command]
pub fn get_logs() -> Vec<LogEntry> {
    // TODO: Read logs from runner service via IPC or file
    vec![]
}

#[tauri::command]
pub fn enable_autostart(app: tauri::AppHandle) -> Result<(), String> {
    app.autolaunch().enable().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn disable_autostart(app: tauri::AppHandle) -> Result<(), String> {
    app.autolaunch().disable().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}
