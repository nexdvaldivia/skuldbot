// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod protection;
mod mcp;
mod ai_planner;

use std::process::Command;
use std::path::PathBuf;
use std::fs;
use std::io::ErrorKind;
use tauri::api::path::app_data_dir;
use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use rand::Rng;
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)] // Legacy structure, kept for reference
struct BotDSL {
    version: String,
    bot: BotInfo,
    nodes: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)] // Legacy structure, kept for reference
struct BotInfo {
    id: String,
    name: String,
    description: Option<String>,
}

#[derive(Debug, Serialize)]
struct CompileResult {
    success: bool,
    message: String,
    bot_path: Option<String>,
}

#[derive(Debug, Serialize)]
struct ExecutionResult {
    success: bool,
    message: String,
    output: Option<String>,
    logs: Vec<String>,
    #[serde(rename = "evidencePackPath")]
    evidence_pack_path: Option<String>,
}

// ============================================================
// Debug Session Types
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
struct DebugNodeExecution {
    #[serde(rename = "nodeId")]
    node_id: String,
    #[serde(rename = "nodeType")]
    node_type: String,
    label: String,
    status: String,
    #[serde(rename = "startTime")]
    start_time: Option<f64>,
    #[serde(rename = "endTime")]
    end_time: Option<f64>,
    #[serde(default)]
    input: Option<serde_json::Value>,
    output: Option<serde_json::Value>,
    error: Option<String>,
    variables: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct DebugSessionState {
    #[serde(rename = "sessionId")]
    session_id: String,
    state: String,
    #[serde(rename = "currentNodeId")]
    current_node_id: Option<String>,
    breakpoints: Vec<String>,
    #[serde(rename = "executionOrder")]
    execution_order: Vec<String>,
    #[serde(rename = "nodeExecutions")]
    node_executions: std::collections::HashMap<String, DebugNodeExecution>,
    #[serde(rename = "globalVariables")]
    global_variables: serde_json::Value,
    #[serde(rename = "startTime")]
    start_time: f64,
    #[serde(rename = "pausedAtBreakpoint")]
    paused_at_breakpoint: bool,
    #[serde(rename = "traceOrder", default)]
    trace_order: Vec<String>,
    #[serde(rename = "traceCursor", default)]
    trace_cursor: usize,
    #[serde(rename = "traceNodeSnapshots", default)]
    trace_node_snapshots: std::collections::HashMap<String, DebugNodeExecution>,
}

#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)] // Reserved for future debugging features
struct DebugMessage {
    #[serde(rename = "type")]
    msg_type: String,
    #[serde(flatten)]
    data: serde_json::Value,
}

#[derive(Debug, Serialize)]
struct DebugCommandResult {
    success: bool,
    message: Option<String>,
    #[serde(rename = "sessionState")]
    session_state: Option<DebugSessionState>,
    #[serde(rename = "lastEvent")]
    last_event: Option<serde_json::Value>,
}

// Process handles
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;
use std::process::{Child, Stdio};
use std::io::{BufRead, BufReader, Write};

// Global run_bot process handle (for cancellation)
// Store the PID so we can kill the process tree
static RUN_BOT_PROCESS: Lazy<Arc<TokioMutex<Option<Child>>>> = Lazy::new(|| Arc::new(TokioMutex::new(None)));
static RUN_BOT_PID: Lazy<Arc<TokioMutex<Option<u32>>>> = Lazy::new(|| Arc::new(TokioMutex::new(None)));

struct LiveDebugRuntime {
    child: Child,
    session_dir: PathBuf,
    log_file: PathBuf,
    consumed_log_lines: usize,
    session: DebugSessionState,
}

static LIVE_DEBUG_RUNTIME: Lazy<Arc<TokioMutex<Option<LiveDebugRuntime>>>> =
    Lazy::new(|| Arc::new(TokioMutex::new(None)));

// ============================================================
// Vault Session State
// ============================================================
// Stores the vault password in memory during the session
// The password is set when user unlocks the vault and cleared on lock
use std::sync::Mutex as StdMutex;

struct VaultSession {
    password: Option<String>,
    path: Option<String>,
}

static VAULT_SESSION: Lazy<StdMutex<VaultSession>> = Lazy::new(|| {
    StdMutex::new(VaultSession {
        password: None,
        path: None,
    })
});

// ============================================================
// Project System Types
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ProjectManifest {
    version: String,
    project: ProjectInfo,
    settings: ProjectSettings,
    bots: Vec<BotReference>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ProjectInfo {
    id: String,
    name: String,
    description: Option<String>,
    created: String,
    updated: String,
    author: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ProjectSettings {
    #[serde(rename = "defaultBrowser")]
    default_browser: Option<String>,
    #[serde(rename = "defaultHeadless")]
    default_headless: Option<bool>,
    #[serde(rename = "logLevel")]
    log_level: Option<String>,
    #[serde(rename = "autoSave")]
    auto_save: Option<AutoSaveSettings>,
    #[serde(rename = "versionHistory")]
    version_history: Option<VersionHistorySettings>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AutoSaveSettings {
    enabled: bool,
    #[serde(rename = "intervalMs")]
    interval_ms: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct VersionHistorySettings {
    enabled: bool,
    #[serde(rename = "maxVersions")]
    max_versions: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct BotReference {
    id: String,
    name: String,
    path: String,
    description: Option<String>,
    tags: Option<Vec<String>>,
    created: String,
    updated: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct RecentProject {
    path: String,
    name: String,
    #[serde(rename = "lastOpened")]
    last_opened: String,
    thumbnail: Option<String>,
}

#[derive(Debug, Serialize)]
struct FileInfo {
    name: String,
    path: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
    size: Option<u64>,
    modified: Option<String>,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)] // Reserved for future command execution features
struct CommandResult {
    success: bool,
    message: String,
    data: Option<serde_json::Value>,
}

// Get the path to the engine directory
fn get_engine_path() -> PathBuf {
    // Try multiple paths to find the engine
    let possible_paths = vec![
        // Absolute path (most reliable for development)
        PathBuf::from("/Users/dubielvaldivia/Documents/khipus/skuldbot/engine"),
        // Relative from executable
        {
            let mut path = std::env::current_exe()
                .unwrap()
                .parent()
                .unwrap()
                .to_path_buf();
            for _ in 0..3 {
                path.pop();
            }
            path.push("engine");
            path
        },
        // Relative path (development)
        PathBuf::from("../../engine"),
    ];

    for path in possible_paths {
        if path.exists() && path.join(".venv").exists() {
            println!("🔧 Engine found at: {}", path.display());
            return path;
        }
    }

    // Fallback to absolute path
    PathBuf::from("/Users/dubielvaldivia/Documents/khipus/skuldbot/engine")
}

// Get Python executable from the engine's venv
fn get_python_executable() -> String {
    let engine_path = get_engine_path();
    let venv_python = engine_path.join(".venv").join("bin").join("python3");

    // Use venv Python if available, otherwise fall back to system python
    if venv_python.exists() {
        let python_path = venv_python.to_string_lossy().to_string();
        println!("🐍 Using venv Python: {}", python_path);
        python_path
    } else {
        println!("⚠️  Venv not found at: {}, falling back to system Python", venv_python.display());
        if Command::new("python3").arg("--version").output().is_ok() {
            "python3".to_string()
        } else {
            "python".to_string()
        }
    }
}

// Setup status for UI notification
#[derive(Clone, serde::Serialize)]
pub struct SetupStatus {
    pub stage: String,
    pub message: String,
    pub progress: u8,
    pub is_complete: bool,
    pub is_error: bool,
}

// Global setup status
static SETUP_COMPLETE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static SETUP_HAD_INSTALL: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

// Setup engine: create venv if needed and install dependencies
fn setup_engine() {
    println!("🔧 Setting up SkuldBot engine...");
    let engine_path = get_engine_path();
    let venv_path = engine_path.join(".venv");
    let requirements_path = engine_path.join("requirements.txt");

    // Check if venv exists, if not create it
    if !venv_path.exists() {
        println!("📦 Creating Python virtual environment...");
        println!("══════════════════════════════════════════════════════════");
        println!("   FIRST TIME SETUP: Creating Python environment...");
        println!("══════════════════════════════════════════════════════════");

        let status = Command::new("python3")
            .args(["-m", "venv", ".venv"])
            .current_dir(&engine_path)
            .status();

        match status {
            Ok(s) if s.success() => println!("✅ Virtual environment created"),
            Ok(s) => println!("⚠️  Failed to create venv: exit code {:?}", s.code()),
            Err(e) => println!("⚠️  Failed to create venv: {}", e),
        }
    }

    // Get pip executable
    let pip_exe = if cfg!(windows) {
        venv_path.join("Scripts").join("pip.exe")
    } else {
        venv_path.join("bin").join("pip")
    };

    if !pip_exe.exists() {
        println!("⚠️  pip not found in venv, skipping dependency installation");
        SETUP_COMPLETE.store(true, std::sync::atomic::Ordering::SeqCst);
        return;
    }

    // Check if requirements.txt exists
    if !requirements_path.exists() {
        println!("⚠️  requirements.txt not found, skipping dependency installation");
        SETUP_COMPLETE.store(true, std::sync::atomic::Ordering::SeqCst);
        return;
    }

    // Check if we need to install/update dependencies
    let marker_path = venv_path.join(".deps_installed");
    let requirements_modified = std::fs::metadata(&requirements_path)
        .and_then(|m| m.modified())
        .ok();
    let marker_modified = std::fs::metadata(&marker_path)
        .and_then(|m| m.modified())
        .ok();

    let needs_install = match (requirements_modified, marker_modified) {
        (Some(req_time), Some(marker_time)) => req_time > marker_time,
        _ => true,
    };

    if needs_install {
        SETUP_HAD_INSTALL.store(true, std::sync::atomic::Ordering::SeqCst);
        println!("");
        println!("══════════════════════════════════════════════════════════");
        println!("   📦 INSTALLING DEPENDENCIES");
        println!("   This may take a few minutes on first run...");
        println!("══════════════════════════════════════════════════════════");
        println!("");

        let status = Command::new(&pip_exe)
            .args(["install", "-r", "requirements.txt"])
            .current_dir(&engine_path)
            .status();

        match status {
            Ok(s) if s.success() => {
                println!("");
                println!("══════════════════════════════════════════════════════════");
                println!("   ✅ ALL DEPENDENCIES INSTALLED SUCCESSFULLY!");
                println!("══════════════════════════════════════════════════════════");
                println!("");
                let _ = std::fs::write(&marker_path, "installed");
            }
            Ok(s) => {
                println!("");
                println!("⚠️  pip install failed: exit code {:?}", s.code());
                println!("   You may need to install dependencies manually:");
                println!("   cd engine && pip install -r requirements.txt");
                println!("");
            }
            Err(e) => {
                println!("");
                println!("⚠️  pip install failed: {}", e);
                println!("");
            }
        }
    } else {
        println!("✅ Dependencies are up to date");
    }

    SETUP_COMPLETE.store(true, std::sync::atomic::Ordering::SeqCst);
}

// Tauri command to get setup status
#[tauri::command]
fn get_engine_setup_status() -> SetupStatus {
    let is_complete = SETUP_COMPLETE.load(std::sync::atomic::Ordering::SeqCst);
    let had_install = SETUP_HAD_INSTALL.load(std::sync::atomic::Ordering::SeqCst);

    if is_complete {
        SetupStatus {
            stage: "complete".to_string(),
            message: if had_install {
                "Dependencies installed successfully!".to_string()
            } else {
                "Engine ready".to_string()
            },
            progress: 100,
            is_complete: true,
            is_error: false,
        }
    } else {
        SetupStatus {
            stage: "installing".to_string(),
            message: "Installing dependencies...".to_string(),
            progress: 50,
            is_complete: false,
            is_error: false,
        }
    }
}

#[tauri::command]
async fn compile_dsl(dsl: String) -> Result<CompileResult, String> {
    println!("🔧 Compiling DSL...");
    
    let engine_path = get_engine_path();
    let python_exe = get_python_executable();
    
    // Create a temporary file with the DSL
    let temp_dir = std::env::temp_dir();
    let dsl_file = temp_dir.join(format!("bot_dsl_{}.json", Uuid::new_v4()));
    std::fs::write(&dsl_file, &dsl).map_err(|e| e.to_string())?;
    
    // Run the compiler
    let output_result = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')

# Clear any cached skuldbot modules to ensure fresh templates are loaded
modules_to_remove = [key for key in sys.modules.keys() if key.startswith('skuldbot')]
for mod in modules_to_remove:
    del sys.modules[mod]

import json
from skuldbot import Compiler

with open('{}', 'r') as f:
    dsl = json.load(f)

compiler = Compiler()
output_dir = '{}'
bot_dir = compiler.compile_to_disk(dsl, output_dir)
print(str(bot_dir))
"#,
            engine_path.display(),
            dsl_file.display(),
            temp_dir.join("bots").display()
        ))
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e));
    let _ = std::fs::remove_file(&dsl_file);
    let output = output_result?;
    
    if output.status.success() {
        let bot_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        println!("✅ Bot compiled to: {}", bot_path);
        
        Ok(CompileResult {
            success: true,
            message: "Bot compilado exitosamente".to_string(),
            bot_path: Some(bot_path),
        })
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        println!("❌ Compilation error: {}", error);
        
        Err(format!("Compilation error: {}", error))
    }
}

#[tauri::command]
async fn run_bot(dsl: String) -> Result<ExecutionResult, String> {
    println!("▶️  Running bot...");

    let engine_path = get_engine_path();
    let python_exe = get_python_executable();

    // Create a temporary file with the DSL
    let temp_dir = std::env::temp_dir();
    let dsl_file = temp_dir.join(format!("bot_run_dsl_{}.json", Uuid::new_v4()));
    std::fs::write(&dsl_file, &dsl).map_err(|e| e.to_string())?;

    // Build the Python command
    let python_script = format!(
        r#"
import sys
sys.path.insert(0, '{}')

# Clear any cached skuldbot modules to ensure fresh templates are loaded
modules_to_remove = [key for key in sys.modules.keys() if key.startswith('skuldbot')]
for mod in modules_to_remove:
    del sys.modules[mod]

import json
import subprocess
from pathlib import Path
from skuldbot import Compiler, Executor, ExecutionMode
from skuldbot.dsl.validator import ValidationError

with open('{}', 'r') as f:
    dsl = json.load(f)

# Build compliance context from Studio UI metadata
hipaa_masking_overrides = []
for node in dsl.get('nodes', []):
    config = node.get('config') or {{}}
    if config.get('__ui_data_masking_enabled') is False:
        node_id = node.get('id', '')
        node_type = node.get('type', '')
        node_label = node.get('label', node_id)
        hipaa_masking_overrides.append((node_id, node_type, node_label))

try:
    # Compile
    compiler = Compiler()
    output_dir = '{}'
    bot_dir = compiler.compile_to_disk(dsl, output_dir)
except ValidationError as e:
    print('ERROR: Validation failed')
    for err in e.errors:
        print(f'  - {{err}}')
    sys.exit(1)
except Exception as e:
    print(f'ERROR: {{e}}')
    sys.exit(1)

# Execute with captured output
main_skb = Path(bot_dir) / "main.skb"
output_path = Path(bot_dir) / "output"
output_path.mkdir(exist_ok=True)

# Optional evidence writer for local Studio runs
evidence_writer = None
evidence_pack_path = None
try:
    from skuldbot.evidence import EvidencePackWriter
    import uuid

    bot_info = dsl.get('bot') or {{}}
    evidence_writer = EvidencePackWriter(
        execution_id=str(uuid.uuid4()),
        bot_id=bot_info.get('id', 'studio-local'),
        bot_name=bot_info.get('name', 'Studio Local Run'),
        tenant_id='studio-local',
        environment='development',
    )
    evidence_writer.add_log('INFO', 'Studio execution started')
    for node_id, node_type, node_label in hipaa_masking_overrides:
        evidence_writer.add_log(
            'WARN',
            f"HIPAA output masking disabled in Studio for node '{{node_label}}'",
            node_id=node_id,
            node_type=node_type,
            event_type='hipaa_masking_override',
            masking_enabled=False,
            source='studio.node_config_panel',
        )
except Exception as e:
    print(f'WARN: Evidence writer unavailable: {{e}}')

# Get robot executable
python_dir = Path(sys.executable).parent
robot_exe = str(python_dir / "robot") if (python_dir / "robot").exists() else "robot"

# Run robot and capture output (use --extension skb for SkuldBot files)
result = subprocess.run(
    [robot_exe, "--extension", "skb", "--loglevel", "DEBUG", "--outputdir", str(output_path), "--consolecolors", "off", str(main_skb)],
    capture_output=True,
    text=True,
    cwd=bot_dir
)

# Print robot output (this is what shows in console)
for line in result.stdout.split('\n'):
    if line.strip():
        print(line)
        if evidence_writer:
            evidence_writer.add_log('INFO', line)

print('STATUS:', 'success' if result.returncode == 0 else 'failed')
print('SUCCESS:', result.returncode == 0)
if result.stderr:
    print('STDERR:', result.stderr)
    if evidence_writer:
        evidence_writer.add_log('ERROR', result.stderr)

if evidence_writer:
    try:
        evidence_dir = output_path / 'evidence'
        evidence_dir.mkdir(exist_ok=True)
        evidence_pack_path = evidence_writer.save(str(evidence_dir))
        print('EVIDENCE_PACK_PATH:', evidence_pack_path)
    except Exception as e:
        print(f'WARN: Failed to save evidence pack: {{e}}')
"#,
        engine_path.display(),
        dsl_file.display(),
        temp_dir.join("bots_run").display()
    );

    // Kill any previous process that might still be running
    {
        let mut process_guard = RUN_BOT_PROCESS.lock().await;
        if let Some(mut old_child) = process_guard.take() {
            let _ = old_child.kill();
        }
        let mut pid_guard = RUN_BOT_PID.lock().await;
        if let Some(pid) = pid_guard.take() {
            // Kill the entire process group on Unix
            #[cfg(unix)]
            {
                let _ = std::process::Command::new("pkill")
                    .args(["-P", &pid.to_string()])
                    .output();
            }
        }
    }

    // Spawn the process so we can cancel it
    let mut child = Command::new(&python_exe)
        .arg("-c")
        .arg(&python_script)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            let _ = std::fs::remove_file(&dsl_file);
            format!("Failed to spawn Python process: {}", e)
        })?;

    // Store the PID for killing the process tree
    let child_pid = child.id();
    {
        let mut pid_guard = RUN_BOT_PID.lock().await;
        *pid_guard = Some(child_pid);
    }

    // We need to store the child but also wait for it
    // Get the stdout/stderr handles before storing
    let stdout_handle = child.stdout.take();
    let stderr_handle = child.stderr.take();

    // Store the child process for cancellation
    {
        let mut process_guard = RUN_BOT_PROCESS.lock().await;
        *process_guard = Some(child);
    }

    // Wait for completion by reading output
    let stdout_content = if let Some(stdout) = stdout_handle {
        let reader = BufReader::new(stdout);
        reader.lines().filter_map(|l| l.ok()).collect::<Vec<_>>().join("\n")
    } else {
        String::new()
    };

    let stderr_content = if let Some(stderr) = stderr_handle {
        let reader = BufReader::new(stderr);
        reader.lines().filter_map(|l| l.ok()).collect::<Vec<_>>().join("\n")
    } else {
        String::new()
    };

    // Clear the PID as we're done reading
    {
        let mut pid_guard = RUN_BOT_PID.lock().await;
        *pid_guard = None;
    }

    // Wait for the process to complete and get exit status
    let exit_status = {
        let mut process_guard = RUN_BOT_PROCESS.lock().await;
        if let Some(mut child) = process_guard.take() {
            child.wait().ok()
        } else {
            None
        }
    };

    let success = exit_status.map(|s| s.success()).unwrap_or(false);
    let evidence_pack_path = stdout_content
        .lines()
        .find_map(|line| {
            line.strip_prefix("EVIDENCE_PACK_PATH:")
                .map(|value| value.trim().to_string())
        })
        .filter(|value| !value.is_empty());

    println!("📝 Output: {}", stdout_content);
    if !stderr_content.is_empty() {
        println!("⚠️  Stderr: {}", stderr_content);
    }
    let _ = std::fs::remove_file(&dsl_file);

    if success {
        Ok(ExecutionResult {
            success: true,
            message: "Bot executed successfully".to_string(),
            output: Some(stdout_content.clone()),
            logs: stdout_content.lines().map(|s| s.to_string()).collect(),
            evidence_pack_path,
        })
    } else {
        // Check if it was cancelled
        if stdout_content.is_empty() && stderr_content.is_empty() {
            Err("Execution cancelled".to_string())
        } else {
            Err(format!("Execution error: {}\n{}", stdout_content, stderr_content))
        }
    }
}

/// Stop a running bot execution
#[tauri::command]
async fn stop_bot() -> Result<bool, String> {
    println!("🛑 Stopping bot execution...");

    // First, get the PID and kill the process tree
    let pid = {
        let mut pid_guard = RUN_BOT_PID.lock().await;
        pid_guard.take()
    };

    if let Some(pid) = pid {
        println!("🛑 Killing process tree for PID: {}", pid);

        // Kill the entire process tree on Unix (kills all child processes)
        #[cfg(unix)]
        {
            // First kill children
            let _ = std::process::Command::new("pkill")
                .args(["-P", &pid.to_string()])
                .output();

            // Then kill the main process
            let _ = std::process::Command::new("kill")
                .args(["-9", &pid.to_string()])
                .output();
        }

        #[cfg(windows)]
        {
            // On Windows, kill the process tree
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .output();
        }
    }

    // Also try to kill via the Child handle if we still have it
    let mut process_guard = RUN_BOT_PROCESS.lock().await;
    if let Some(mut child) = process_guard.take() {
        match child.kill() {
            Ok(_) => {
                println!("✅ Bot process killed successfully");
                Ok(true)
            }
            Err(e) => {
                // Even if this fails, we already killed via PID above
                println!("⚠️  Child.kill() returned: {} (may have already been killed)", e);
                Ok(true) // Return true because we already killed via PID
            }
        }
    } else if pid.is_some() {
        println!("✅ Bot process killed via PID");
        Ok(true)
    } else {
        println!("ℹ️  No bot process running");
        Ok(false)
    }
}

// ============================================================
// Debug Commands (Interactive Debugging with Breakpoints)
// ============================================================

fn unix_now_seconds() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

const LIVE_DEBUG_WAIT_TIMEOUT_MIN_MS: u64 = 1_000;
const LIVE_DEBUG_WAIT_TIMEOUT_MAX_MS: u64 = 900_000;
const LIVE_DEBUG_WAIT_TIMEOUT_DEFAULT_MS: u64 = 180_000;

fn resolve_live_debug_timeout(timeout_ms: Option<u64>) -> Duration {
    let bounded = timeout_ms
        .unwrap_or(LIVE_DEBUG_WAIT_TIMEOUT_DEFAULT_MS)
        .clamp(
            LIVE_DEBUG_WAIT_TIMEOUT_MIN_MS,
            LIVE_DEBUG_WAIT_TIMEOUT_MAX_MS,
        );
    Duration::from_millis(bounded)
}

fn parse_runtime_node_payload(log_line: &str, prefix: &str) -> Option<(String, serde_json::Value)> {
    let idx = log_line.find(prefix)?;
    let raw = log_line.get(idx + prefix.len()..)?.trim();
    if raw.is_empty() {
        return None;
    }
    let mut parts = raw.splitn(2, ':');
    let node_id = parts.next()?.trim();
    let payload_raw = parts.next()?.trim();
    if node_id.is_empty() || payload_raw.is_empty() {
        return None;
    }
    let payload = serde_json::from_str::<serde_json::Value>(payload_raw)
        .unwrap_or_else(|_| serde_json::Value::String(payload_raw.to_string()));
    Some((node_id.to_string(), payload))
}

fn pending_debug_exec(node_id: &str, node_type: &str, label: &str) -> DebugNodeExecution {
    DebugNodeExecution {
        node_id: node_id.to_string(),
        node_type: node_type.to_string(),
        label: label.to_string(),
        status: "pending".to_string(),
        start_time: None,
        end_time: None,
        input: None,
        output: None,
        error: None,
        variables: serde_json::json!({}),
    }
}

fn ensure_variable_object(exec: &mut DebugNodeExecution) -> &mut serde_json::Map<String, serde_json::Value> {
    if !exec.variables.is_object() {
        exec.variables = serde_json::json!({});
    }
    exec.variables
        .as_object_mut()
        .expect("variables must be object")
}

fn build_live_debug_session(
    dsl_json: &serde_json::Value,
    breakpoints: Vec<String>,
    session_id: &str,
) -> DebugSessionState {
    let mut execution_order: Vec<String> = Vec::new();
    let mut node_executions: std::collections::HashMap<String, DebugNodeExecution> =
        std::collections::HashMap::new();

    if let Some(nodes) = dsl_json.get("nodes").and_then(|v| v.as_array()) {
        for node in nodes {
            let Some(node_id) = node.get("id").and_then(|v| v.as_str()) else {
                continue;
            };
            let node_id = node_id.trim();
            if node_id.is_empty() {
                continue;
            }
            let node_type = node
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let label = node
                .get("label")
                .and_then(|v| v.as_str())
                .unwrap_or(node_id);
            execution_order.push(node_id.to_string());
            node_executions.insert(
                node_id.to_string(),
                pending_debug_exec(node_id, node_type, label),
            );
        }
    }

    let start_node = dsl_json
        .get("start_node")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| execution_order.first().cloned());

    DebugSessionState {
        session_id: session_id.to_string(),
        state: "running".to_string(),
        current_node_id: start_node,
        breakpoints,
        execution_order,
        node_executions,
        global_variables: serde_json::json!({}),
        start_time: unix_now_seconds(),
        paused_at_breakpoint: false,
        trace_order: Vec::new(),
        trace_cursor: 0,
        trace_node_snapshots: std::collections::HashMap::new(),
    }
}

fn parse_debug_marker(log_line: &str, prefix: &str) -> Option<(String, String)> {
    let idx = log_line.find(prefix)?;
    let raw = log_line.get(idx + prefix.len()..)?.trim();
    let mut parts = raw.splitn(2, ':');
    let node_id = parts.next()?.trim();
    let node_type = parts.next().unwrap_or("unknown").trim();
    if node_id.is_empty() {
        return None;
    }
    Some((node_id.to_string(), node_type.to_string()))
}

fn get_or_create_node_execution<'a>(
    session: &'a mut DebugSessionState,
    node_id: &str,
    node_type_hint: Option<&str>,
) -> &'a mut DebugNodeExecution {
    if !session.node_executions.contains_key(node_id) {
        let node_type = node_type_hint.unwrap_or("unknown");
        session.node_executions.insert(
            node_id.to_string(),
            pending_debug_exec(node_id, node_type, node_id),
        );
        session.execution_order.push(node_id.to_string());
    }
    session
        .node_executions
        .get_mut(node_id)
        .expect("node execution must exist")
}

fn recompute_live_global_variables(session: &mut DebugSessionState) {
    let mut globals = serde_json::Map::new();
    let mut last_error: Option<(String, String, String)> = None;

    for node_id in &session.execution_order {
        if let Some(node_exec) = session.node_executions.get(node_id) {
            if node_exec.status == "pending" {
                continue;
            }
            globals.insert(
                format!("NODE_{}", node_id.replace('-', "_")),
                node_exec.variables.clone(),
            );
            if node_exec.status == "error" {
                last_error = Some((
                    node_exec.error.clone().unwrap_or_default(),
                    node_id.clone(),
                    node_exec.node_type.clone(),
                ));
            }
        }
    }

    if let Some((msg, node_id, node_type)) = last_error {
        globals.insert("LAST_ERROR".to_string(), serde_json::Value::String(msg));
        globals.insert("LAST_ERROR_NODE".to_string(), serde_json::Value::String(node_id));
        globals.insert("LAST_ERROR_TYPE".to_string(), serde_json::Value::String(node_type));
    }
    session.global_variables = serde_json::Value::Object(globals);
}

fn read_new_runtime_log_lines(runtime: &mut LiveDebugRuntime) -> Vec<String> {
    let content = fs::read_to_string(&runtime.log_file).unwrap_or_default();
    let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    if runtime.consumed_log_lines >= lines.len() {
        runtime.consumed_log_lines = lines.len();
        return Vec::new();
    }
    let new_lines = lines[runtime.consumed_log_lines..].to_vec();
    runtime.consumed_log_lines = lines.len();
    new_lines
}

fn apply_live_log_lines(session: &mut DebugSessionState, lines: &[String]) {
    for line in lines {
        if let Some((node_id, node_type)) = parse_debug_marker(line, "DEBUG_NODE_START:") {
            let entry = get_or_create_node_execution(session, &node_id, Some(&node_type));
            if entry.start_time.is_none() {
                entry.start_time = Some(unix_now_seconds());
            }
            if entry.status == "pending" {
                entry.status = "running".to_string();
            }
            session.current_node_id = Some(node_id);
            session.state = "running".to_string();
            session.paused_at_breakpoint = false;
            continue;
        }

        if let Some((node_id, node_type)) = parse_debug_marker(line, "DEBUG_PAUSED:") {
            let entry = get_or_create_node_execution(session, &node_id, Some(&node_type));
            if entry.start_time.is_none() {
                entry.start_time = Some(unix_now_seconds());
            }
            if entry.status == "pending" {
                entry.status = "running".to_string();
            }
            session.current_node_id = Some(node_id);
            session.state = "paused".to_string();
            session.paused_at_breakpoint = true;
            continue;
        }

        if let Some((node_id, payload)) = parse_runtime_node_payload(line, "NODE_INPUT:") {
            let entry = get_or_create_node_execution(session, &node_id, None);
            if entry.start_time.is_none() {
                entry.start_time = Some(unix_now_seconds());
            }
            entry.input = Some(payload.clone());
            if entry.status == "pending" {
                entry.status = "running".to_string();
            }
            let vars = ensure_variable_object(entry);
            vars.insert("input".to_string(), payload);
            continue;
        }

        if let Some((node_id, payload)) = parse_runtime_node_payload(line, "NODE_ENVELOPE:") {
            let entry = get_or_create_node_execution(session, &node_id, None);
            if entry.start_time.is_none() {
                entry.start_time = Some(unix_now_seconds());
            }
            entry.end_time = Some(unix_now_seconds());
            entry.output = Some(payload.clone());
            let status = payload
                .get("meta")
                .and_then(|m| m.get("status"))
                .and_then(|s| s.as_str())
                .unwrap_or("success")
                .to_string();
            entry.status = status.clone();
            if status == "error" {
                let err = payload
                    .get("errors")
                    .and_then(|e| e.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|first| first.get("message"))
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "Node execution failed".to_string());
                entry.error = Some(err);
            } else {
                entry.error = None;
            }
            let error_val = entry
                .error
                .clone()
                .map(serde_json::Value::String)
                .unwrap_or(serde_json::Value::Null);
            let vars = ensure_variable_object(entry);
            vars.insert("output".to_string(), payload);
            vars.insert("status".to_string(), serde_json::Value::String(status));
            vars.insert("error".to_string(), error_val);
            continue;
        }

        if line.contains("Bot completed successfully") {
            session.state = "completed".to_string();
            session.current_node_id = None;
            session.paused_at_breakpoint = false;
            continue;
        }

        if line.contains("Bot failed:") {
            session.state = "error".to_string();
            session.paused_at_breakpoint = false;
            continue;
        }
    }

    recompute_live_global_variables(session);
}

fn write_debug_control_file(session_dir: &PathBuf, name: &str, content: &str) -> Result<(), String> {
    let file = session_dir.join(name);
    fs::write(file, content).map_err(|e| format!("Failed to write debug control file: {}", e))
}

async fn wait_for_live_debug_state(
    runtime: &mut LiveDebugRuntime,
    timeout: Duration,
) -> Result<bool, String> {
    let deadline = std::time::Instant::now() + timeout;
    let mut timed_out = false;

    loop {
        let lines = read_new_runtime_log_lines(runtime);
        if !lines.is_empty() {
            apply_live_log_lines(&mut runtime.session, &lines);
        }
        if runtime.session.state == "paused"
            || runtime.session.state == "completed"
            || runtime.session.state == "error"
        {
            break;
        }
        if let Some(status) = runtime
            .child
            .try_wait()
            .map_err(|e| format!("Failed to inspect debug process status: {}", e))?
        {
            runtime.session.state = if status.success() {
                "completed".to_string()
            } else {
                "error".to_string()
            };
            runtime.session.current_node_id = None;
            runtime.session.paused_at_breakpoint = false;
            break;
        }
        if std::time::Instant::now() >= deadline {
            timed_out = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(120)).await;
    }

    Ok(timed_out)
}

/// Start an interactive debug session
#[tauri::command]
async fn debug_start(
    dsl: String,
    breakpoints: Vec<String>,
    timeout_ms: Option<u64>,
) -> Result<DebugCommandResult, String> {
    println!(
        "🐛 Starting live debug session with {} breakpoints",
        breakpoints.len()
    );

    let dsl_json: serde_json::Value =
        serde_json::from_str(&dsl).map_err(|e| format!("Invalid DSL payload: {}", e))?;

    let compile_result = compile_dsl(dsl.clone()).await?;
    let bot_path = compile_result
        .bot_path
        .ok_or("Compiler did not return bot path".to_string())?;
    let bot_dir = PathBuf::from(bot_path);
    let main_skb = bot_dir.join("main.skb");
    if !main_skb.exists() {
        return Err("Compiled bot does not contain main.skb".to_string());
    }

    {
        let mut guard = LIVE_DEBUG_RUNTIME.lock().await;
        if let Some(mut runtime) = guard.take() {
            let _ = write_debug_control_file(&runtime.session_dir, "stop.token", "1");
            let _ = runtime.child.kill();
            let _ = runtime.child.wait();
            let _ = fs::remove_dir_all(runtime.session_dir);
        }
    }

    let session_id = Uuid::new_v4().to_string();
    let session_dir = std::env::temp_dir().join(format!("skuldbot_live_debug_{}", session_id));
    fs::create_dir_all(&session_dir)
        .map_err(|e| format!("Failed to create debug session dir: {}", e))?;
    write_debug_control_file(&session_dir, "mode", "step")?;

    let log_file = session_dir.join("run.log");
    let log_out = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(|e| format!("Failed to open debug log file: {}", e))?;
    let log_err = log_out
        .try_clone()
        .map_err(|e| format!("Failed to clone debug log file handle: {}", e))?;

    let output_dir = bot_dir.join("output_debug");
    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create debug output dir: {}", e))?;

    let python_exe = get_python_executable();
    let python_path = PathBuf::from(&python_exe);
    let robot_exe = if python_path.is_absolute() {
        let candidate = python_path
            .parent()
            .map(|p| p.join("robot"))
            .ok_or("Invalid python executable path".to_string())?;
        if candidate.exists() {
            candidate.to_string_lossy().to_string()
        } else {
            "robot".to_string()
        }
    } else {
        "robot".to_string()
    };

    let breakpoints_json =
        serde_json::to_string(&breakpoints).map_err(|e| format!("Breakpoints serialize error: {}", e))?;

    let child = Command::new(&robot_exe)
        .arg("--extension")
        .arg("skb")
        .arg("--loglevel")
        .arg("DEBUG")
        .arg("--outputdir")
        .arg(output_dir.to_string_lossy().to_string())
        .arg("--consolecolors")
        .arg("off")
        .arg(main_skb.to_string_lossy().to_string())
        .current_dir(&bot_dir)
        .env(
            "SKULDBOT_DEBUG_SESSION_DIR",
            session_dir.to_string_lossy().to_string(),
        )
        .env("SKULDBOT_DEBUG_BREAKPOINTS", breakpoints_json)
        .stdout(Stdio::from(log_out))
        .stderr(Stdio::from(log_err))
        .spawn()
        .map_err(|e| format!("Failed to spawn live debug process: {}", e))?;

    let mut runtime = LiveDebugRuntime {
        child,
        session_dir: session_dir.clone(),
        log_file: log_file.clone(),
        consumed_log_lines: 0,
        session: build_live_debug_session(&dsl_json, breakpoints, &session_id),
    };

    let timeout = resolve_live_debug_timeout(timeout_ms);
    let timed_out = wait_for_live_debug_state(&mut runtime, timeout).await?;

    let session_state = runtime.session.clone();
    {
        let mut guard = LIVE_DEBUG_RUNTIME.lock().await;
        *guard = Some(runtime);
    }

    Ok(DebugCommandResult {
        success: true,
        message: Some(if timed_out {
            "Live debug session started (waiting for first pause/event)".to_string()
        } else {
            "Live debug session started".to_string()
        }),
        session_state: Some(session_state.clone()),
        last_event: Some(serde_json::json!({
            "type": if session_state.state == "paused" { "paused" } else { "state" },
            "nodeId": session_state.current_node_id,
            "state": session_state.state,
        })),
    })
}

/// Execute a single step in the debug session
#[tauri::command]
async fn debug_step(
    session_state_json: String,
    timeout_ms: Option<u64>,
) -> Result<DebugCommandResult, String> {
    let _ = session_state_json;
    println!("🐛 Debug step (live mode)");

    let mut guard = LIVE_DEBUG_RUNTIME.lock().await;
    let Some(runtime) = guard.as_mut() else {
        return Ok(DebugCommandResult {
            success: false,
            message: Some("No active live debug session".to_string()),
            session_state: None,
            last_event: Some(serde_json::json!({"type":"error","message":"No active session"})),
        });
    };

    write_debug_control_file(&runtime.session_dir, "mode", "step")?;
    write_debug_control_file(&runtime.session_dir, "continue.token", "1")?;
    runtime.session.state = "running".to_string();
    runtime.session.paused_at_breakpoint = false;

    let timeout = resolve_live_debug_timeout(timeout_ms);
    let timed_out = wait_for_live_debug_state(runtime, timeout).await?;

    Ok(DebugCommandResult {
        success: true,
        message: Some(if timed_out && runtime.session.state == "running" {
            "Step still running (timeout window reached)".to_string()
        } else {
            "Step executed".to_string()
        }),
        session_state: Some(runtime.session.clone()),
        last_event: Some(serde_json::json!({
            "type": runtime.session.state,
            "nodeId": runtime.session.current_node_id,
        })),
    })
}

/// Continue execution until next breakpoint or completion
#[tauri::command]
async fn debug_continue(
    session_state_json: String,
    timeout_ms: Option<u64>,
) -> Result<DebugCommandResult, String> {
    let _ = session_state_json;
    println!("🐛 Debug continue (live mode)");

    let mut guard = LIVE_DEBUG_RUNTIME.lock().await;
    let Some(runtime) = guard.as_mut() else {
        return Ok(DebugCommandResult {
            success: false,
            message: Some("No active live debug session".to_string()),
            session_state: None,
            last_event: Some(serde_json::json!({"type":"error","message":"No active session"})),
        });
    };

    write_debug_control_file(&runtime.session_dir, "mode", "continue")?;
    write_debug_control_file(&runtime.session_dir, "continue.token", "1")?;
    runtime.session.state = "running".to_string();
    runtime.session.paused_at_breakpoint = false;

    let timeout = resolve_live_debug_timeout(timeout_ms);
    let timed_out = wait_for_live_debug_state(runtime, timeout).await?;

    let message = match runtime.session.state.as_str() {
        "paused" => "Paused at breakpoint",
        "completed" => "Execution completed",
        "error" => "Execution failed",
        _ => "Execution running",
    };

    Ok(DebugCommandResult {
        success: true,
        message: Some(if timed_out && runtime.session.state == "running" {
            "Execution still running (timeout window reached)".to_string()
        } else {
            message.to_string()
        }),
        session_state: Some(runtime.session.clone()),
        last_event: Some(serde_json::json!({
            "type": runtime.session.state,
            "nodeId": runtime.session.current_node_id,
        })),
    })
}

/// Stop the debug session
#[tauri::command]
async fn debug_stop() -> Result<DebugCommandResult, String> {
    println!("🐛 Debug stop");

    let mut guard = LIVE_DEBUG_RUNTIME.lock().await;
    if let Some(mut runtime) = guard.take() {
        let _ = write_debug_control_file(&runtime.session_dir, "stop.token", "1");
        let _ = runtime.child.kill();
        let _ = runtime.child.wait();
        let _ = fs::remove_dir_all(runtime.session_dir);
    }

    Ok(DebugCommandResult {
        success: true,
        message: Some("Debug session stopped".to_string()),
        session_state: None,
        last_event: Some(serde_json::json!({"type": "stopped"})),
    })
}

/// Request pause for live debug session (applies at next node boundary)
#[tauri::command]
async fn debug_pause() -> Result<DebugCommandResult, String> {
    println!("🐛 Debug pause request");

    let mut guard = LIVE_DEBUG_RUNTIME.lock().await;
    let Some(runtime) = guard.as_mut() else {
        return Ok(DebugCommandResult {
            success: false,
            message: Some("No active live debug session".to_string()),
            session_state: None,
            last_event: Some(serde_json::json!({"type":"error","message":"No active session"})),
        });
    };

    write_debug_control_file(&runtime.session_dir, "mode", "step")?;
    let is_already_paused = runtime.session.state == "paused";

    Ok(DebugCommandResult {
        success: true,
        message: Some(if is_already_paused {
            "Execution already paused".to_string()
        } else {
            "Pause requested (will pause at next node boundary)".to_string()
        }),
        session_state: Some(runtime.session.clone()),
        last_event: Some(serde_json::json!({
            "type": if is_already_paused { "paused" } else { "pause_requested" },
            "nodeId": runtime.session.current_node_id,
        })),
    })
}

/// Get variables for a node
#[tauri::command]
async fn debug_get_variables(session_state_json: String, node_id: Option<String>) -> Result<serde_json::Value, String> {
    println!("🐛 Debug get variables for {:?}", node_id);

    let guard = LIVE_DEBUG_RUNTIME.lock().await;
    if let Some(runtime) = guard.as_ref() {
        if let Some(nid) = node_id.as_ref() {
            if let Some(node_exec) = runtime.session.node_executions.get(nid) {
                return Ok(node_exec.variables.clone());
            }
            return Ok(serde_json::json!({}));
        }
        return Ok(runtime.session.global_variables.clone());
    }
    drop(guard);

    let session: DebugSessionState = serde_json::from_str(&session_state_json)
        .map_err(|e| format!("Invalid session state: {}", e))?;

    if let Some(nid) = node_id {
        if let Some(node_exec) = session.node_executions.get(&nid) {
            return Ok(node_exec.variables.clone());
        }
        Ok(serde_json::json!({}))
    } else {
        Ok(session.global_variables)
    }
}

#[tauri::command]
async fn validate_dsl(dsl: String) -> Result<bool, String> {
    println!("✓ Validating DSL...");
    
    let engine_path = get_engine_path();
    let python_exe = get_python_executable();
    
    let temp_dir = std::env::temp_dir();
    let dsl_file = temp_dir.join(format!("bot_validate_dsl_{}.json", Uuid::new_v4()));
    std::fs::write(&dsl_file, &dsl).map_err(|e| e.to_string())?;
    
    let output_result = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')
import json
from skuldbot.dsl import DSLValidator

with open('{}', 'r') as f:
    dsl = json.load(f)

validator = DSLValidator()
try:
    validator.validate(dsl)
    print('VALID')
except Exception as e:
    print('INVALID:', str(e))
    details = getattr(e, 'errors', None)
    if details:
        for item in details:
            print(' -', item)
    sys.exit(1)
"#,
            engine_path.display(),
            dsl_file.display()
        ))
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e));
    let _ = std::fs::remove_file(&dsl_file);
    let output = output_result?;
    
    if output.status.success() {
        println!("✅ DSL is valid");
        Ok(true)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let error = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "DSL validation failed".to_string()
        };
        println!("❌ DSL is invalid: {}", error);
        Err(error)
    }
}

#[tauri::command]
async fn save_project(path: String, data: String) -> Result<(), String> {
    println!("💾 Saving project to: {}", path);
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    println!("✅ Project saved");
    Ok(())
}

#[tauri::command]
async fn load_project(path: String) -> Result<String, String> {
    println!("📂 Loading project from: {}", path);
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    println!("✅ Project loaded");
    Ok(data)
}

#[tauri::command]
async fn get_engine_info() -> Result<String, String> {
    let engine_path = get_engine_path();
    let python_exe = get_python_executable();

    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')
try:
    from skuldbot import __version__
    print('Engine version:', __version__)
    print('Engine path:', '{}')
except Exception as e:
    print('Error:', e)
"#,
            engine_path.display(),
            engine_path.display()
        ))
        .output()
        .map_err(|e| format!("Failed to get engine info: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// ============================================================
// Project Commands
// ============================================================

fn get_recent_projects_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".skuldbot").join("recent_projects.json")
}

#[tauri::command]
async fn create_project(path: String, name: String, description: Option<String>) -> Result<ProjectManifest, String> {
    println!("📁 Creating project: {} at {}", name, path);

    let project_path = PathBuf::from(&path);

    // Create project directory structure
    let dirs_to_create = vec![
        project_path.clone(),
        project_path.join("bots"),
        project_path.join("shared"),
        project_path.join("shared/assets"),
        project_path.join("shared/scripts"),
        project_path.join("shared/node-templates"),
        project_path.join(".skuldbot"),
        project_path.join(".skuldbot/cache"),
    ];

    for dir in dirs_to_create {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Create project manifest
    let now = Utc::now().to_rfc3339();
    let manifest = ProjectManifest {
        version: "1.0".to_string(),
        project: ProjectInfo {
            id: Uuid::new_v4().to_string(),
            name: name.clone(),
            description,
            created: now.clone(),
            updated: now,
            author: None,
        },
        settings: ProjectSettings {
            default_browser: Some("chromium".to_string()),
            default_headless: Some(false),
            log_level: Some("INFO".to_string()),
            auto_save: Some(AutoSaveSettings {
                enabled: true,
                interval_ms: 5000,
            }),
            version_history: Some(VersionHistorySettings {
                enabled: true,
                max_versions: 50,
            }),
        },
        bots: vec![],
    };

    // Write manifest
    let manifest_path = project_path.join("proyecto.skuld");
    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    fs::write(&manifest_path, manifest_json).map_err(|e| format!("Failed to write manifest: {}", e))?;

    // Create .gitignore
    let gitignore_content = r#"# SkuldBot
.skuldbot/cache/
.skuldbot/env.local
*.log
output/

# OS
.DS_Store
Thumbs.db

# IDE
.idea/
.vscode/
*.swp
"#;
    fs::write(project_path.join(".gitignore"), gitignore_content)
        .map_err(|e| format!("Failed to write .gitignore: {}", e))?;

    // Create local config
    let local_config = serde_json::json!({
        "lastOpenedBot": null,
        "windowState": {
            "width": 1200,
            "height": 800
        }
    });
    fs::write(
        project_path.join(".skuldbot/config.json"),
        serde_json::to_string_pretty(&local_config).unwrap()
    ).map_err(|e| format!("Failed to write local config: {}", e))?;

    // Add to recent projects
    let _ = add_recent_project_internal(&path, &name).await;

    println!("✅ Project created: {}", manifest_path.display());
    Ok(manifest)
}

#[tauri::command]
async fn open_project(path: String) -> Result<ProjectManifest, String> {
    println!("📂 Opening project: {}", path);

    let project_path = PathBuf::from(&path);
    let manifest_path = if project_path.extension().map_or(false, |e| e == "skuld") {
        project_path.clone()
    } else {
        project_path.join("proyecto.skuld")
    };

    if !manifest_path.exists() {
        return Err(format!("Project manifest not found: {}", manifest_path.display()));
    }

    let manifest_content = fs::read_to_string(&manifest_path)
        .map_err(|e| {
            if e.kind() == ErrorKind::PermissionDenied {
                format!(
                    "Permission denied reading manifest. On macOS, re-open the project with the file picker or grant Files and Folders access to Skuldbot Studio in System Settings. ({})",
                    e
                )
            } else {
                format!("Failed to read manifest: {}", e)
            }
        })?;

    let manifest: ProjectManifest = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("Failed to parse manifest: {}", e))?;

    // Add to recent projects
    let project_dir = manifest_path.parent().unwrap().to_string_lossy().to_string();
    let _ = add_recent_project_internal(&project_dir, &manifest.project.name).await;

    println!("✅ Project opened: {}", manifest.project.name);
    Ok(manifest)
}

#[tauri::command]
async fn save_project_manifest(path: String, manifest: ProjectManifest) -> Result<(), String> {
    println!("💾 Saving project manifest: {}", path);

    let mut updated_manifest = manifest;
    updated_manifest.project.updated = Utc::now().to_rfc3339();

    let manifest_json = serde_json::to_string_pretty(&updated_manifest)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    fs::write(&path, manifest_json).map_err(|e| format!("Failed to write manifest: {}", e))?;

    println!("✅ Manifest saved");
    Ok(())
}

// ============================================================
// Bot Commands
// ============================================================

#[tauri::command]
async fn create_bot(project_path: String, name: String, description: Option<String>) -> Result<BotReference, String> {
    println!("🤖 Creating bot: {} in {}", name, project_path);

    let project_dir = PathBuf::from(&project_path);
    let bot_id = Uuid::new_v4().to_string();
    let bot_slug = slug::slugify(&name);
    let bot_path = format!("bots/{}", bot_slug);
    let bot_dir = project_dir.join(&bot_path);

    // Create bot directory structure
    fs::create_dir_all(&bot_dir).map_err(|e| format!("Failed to create bot directory: {}", e))?;
    fs::create_dir_all(bot_dir.join(".history")).map_err(|e| format!("Failed to create history directory: {}", e))?;
    fs::create_dir_all(bot_dir.join("assets")).map_err(|e| format!("Failed to create assets directory: {}", e))?;

    // Create empty bot.json
    let now = Utc::now().to_rfc3339();
    let bot_dsl = serde_json::json!({
        "version": "1.0",
        "bot": {
            "id": bot_id,
            "name": name,
            "description": description
        },
        "nodes": [],
        "variables": {}
    });

    fs::write(
        bot_dir.join("bot.json"),
        serde_json::to_string_pretty(&bot_dsl).unwrap()
    ).map_err(|e| format!("Failed to write bot.json: {}", e))?;

    let bot_ref = BotReference {
        id: bot_id,
        name: name.clone(),
        path: bot_path,
        description,
        tags: None,
        created: now.clone(),
        updated: now,
    };

    println!("✅ Bot created: {}", bot_dir.display());
    Ok(bot_ref)
}

#[tauri::command]
async fn load_bot(bot_path: String) -> Result<serde_json::Value, String> {
    println!("📂 Loading bot: {}", bot_path);

    let bot_json_path = PathBuf::from(&bot_path).join("bot.json");
    if !bot_json_path.exists() {
        return Err(format!("Bot file not found: {}", bot_json_path.display()));
    }

    let content = fs::read_to_string(&bot_json_path)
        .map_err(|e| {
            if e.kind() == ErrorKind::PermissionDenied {
                format!(
                    "Permission denied reading bot file. On macOS, re-open the project with the file picker or grant Files and Folders access to Skuldbot Studio in System Settings. ({})",
                    e
                )
            } else {
                format!("Failed to read bot file: {}", e)
            }
        })?;

    let bot: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse bot file: {}", e))?;

    println!("✅ Bot loaded");
    Ok(bot)
}

#[tauri::command]
async fn save_bot(bot_path: String, dsl: String) -> Result<(), String> {
    println!("💾 Saving bot: {}", bot_path);
    validate_dsl(dsl.clone())
        .await
        .map_err(|e| format!("Cannot save bot: {}", e))?;

    let bot_dir = PathBuf::from(&bot_path);

    // Create bot directory if it doesn't exist
    if !bot_dir.exists() {
        fs::create_dir_all(&bot_dir).map_err(|e| format!("Failed to create bot directory: {}", e))?;
        fs::create_dir_all(bot_dir.join(".history")).map_err(|e| format!("Failed to create history directory: {}", e))?;
        fs::create_dir_all(bot_dir.join("assets")).map_err(|e| format!("Failed to create assets directory: {}", e))?;
    }

    let bot_json_path = bot_dir.join("bot.json");
    fs::write(&bot_json_path, &dsl).map_err(|e| format!("Failed to write bot file: {}", e))?;

    println!("✅ Bot saved");
    Ok(())
}

#[tauri::command]
async fn delete_bot(bot_path: String) -> Result<(), String> {
    println!("🗑️ Deleting bot: {}", bot_path);

    let bot_dir = PathBuf::from(&bot_path);
    if bot_dir.exists() {
        fs::remove_dir_all(&bot_dir).map_err(|e| format!("Failed to delete bot: {}", e))?;
    }

    println!("✅ Bot deleted");
    Ok(())
}

// ============================================================
// Version History Commands
// ============================================================

#[tauri::command]
async fn save_bot_version(bot_path: String, dsl: String, description: Option<String>) -> Result<String, String> {
    println!("📸 Saving bot version: {}", bot_path);
    validate_dsl(dsl.clone())
        .await
        .map_err(|e| format!("Cannot save bot version: {}", e))?;

    let history_dir = PathBuf::from(&bot_path).join(".history");
    fs::create_dir_all(&history_dir).map_err(|e| format!("Failed to create history directory: {}", e))?;

    let version_id = Uuid::new_v4().to_string();
    let timestamp = Utc::now().to_rfc3339();

    let version_data = serde_json::json!({
        "id": version_id,
        "timestamp": timestamp,
        "description": description,
        "dsl": serde_json::from_str::<serde_json::Value>(&dsl).unwrap_or(serde_json::json!({}))
    });

    let version_file = history_dir.join(format!("{}.json", version_id));
    fs::write(&version_file, serde_json::to_string_pretty(&version_data).unwrap())
        .map_err(|e| format!("Failed to write version file: {}", e))?;

    println!("✅ Version saved: {}", version_id);
    Ok(version_id)
}

#[tauri::command]
async fn list_bot_versions(bot_path: String) -> Result<Vec<serde_json::Value>, String> {
    println!("📋 Listing bot versions: {}", bot_path);

    let history_dir = PathBuf::from(&bot_path).join(".history");
    if !history_dir.exists() {
        return Ok(vec![]);
    }

    let mut versions = vec![];

    for entry in fs::read_dir(&history_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.extension().map_or(false, |e| e == "json") {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(version) = serde_json::from_str::<serde_json::Value>(&content) {
                    versions.push(serde_json::json!({
                        "id": version.get("id"),
                        "timestamp": version.get("timestamp"),
                        "description": version.get("description")
                    }));
                }
            }
        }
    }

    // Sort by timestamp descending
    versions.sort_by(|a, b| {
        let ts_a = a.get("timestamp").and_then(|v| v.as_str()).unwrap_or("");
        let ts_b = b.get("timestamp").and_then(|v| v.as_str()).unwrap_or("");
        ts_b.cmp(ts_a)
    });

    Ok(versions)
}

#[tauri::command]
async fn load_bot_version(bot_path: String, version_id: String) -> Result<serde_json::Value, String> {
    println!("📂 Loading bot version: {} - {}", bot_path, version_id);

    let version_file = PathBuf::from(&bot_path).join(".history").join(format!("{}.json", version_id));
    if !version_file.exists() {
        return Err(format!("Version not found: {}", version_id));
    }

    let content = fs::read_to_string(&version_file)
        .map_err(|e| format!("Failed to read version file: {}", e))?;

    let version: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse version file: {}", e))?;

    Ok(version.get("dsl").cloned().unwrap_or(serde_json::json!({})))
}

#[tauri::command]
async fn cleanup_old_versions(bot_path: String, max_versions: u32) -> Result<u32, String> {
    println!("🧹 Cleaning up old versions: {} (max: {})", bot_path, max_versions);

    let history_dir = PathBuf::from(&bot_path).join(".history");
    if !history_dir.exists() {
        return Ok(0);
    }

    let mut version_files: Vec<_> = fs::read_dir(&history_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "json"))
        .collect();

    // Sort by modified time (oldest first)
    version_files.sort_by(|a, b| {
        let time_a = a.metadata().and_then(|m| m.modified()).ok();
        let time_b = b.metadata().and_then(|m| m.modified()).ok();
        time_a.cmp(&time_b)
    });

    let mut deleted = 0;
    while version_files.len() > max_versions as usize {
        if let Some(oldest) = version_files.first() {
            let _ = fs::remove_file(oldest.path());
            deleted += 1;
        }
        version_files.remove(0);
    }

    println!("✅ Cleaned up {} old versions", deleted);
    Ok(deleted)
}

// ============================================================
// Asset Commands
// ============================================================

#[tauri::command]
async fn list_assets(assets_path: String) -> Result<Vec<FileInfo>, String> {
    println!("📂 Listing assets: {}", assets_path);

    let assets_dir = PathBuf::from(&assets_path);
    if !assets_dir.exists() {
        return Ok(vec![]);
    }

    let mut assets = vec![];

    for entry in fs::read_dir(&assets_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let metadata = entry.metadata().ok();

        assets.push(FileInfo {
            name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            is_dir: path.is_dir(),
            size: metadata.as_ref().map(|m| m.len()),
            modified: metadata.and_then(|m| m.modified().ok())
                .map(|t| DateTime::<Utc>::from(t).to_rfc3339()),
        });
    }

    Ok(assets)
}

#[tauri::command]
async fn copy_asset(source: String, destination: String) -> Result<(), String> {
    println!("📋 Copying asset: {} -> {}", source, destination);

    let dest_path = PathBuf::from(&destination);
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::copy(&source, &destination).map_err(|e| format!("Failed to copy asset: {}", e))?;

    println!("✅ Asset copied");
    Ok(())
}

#[tauri::command]
async fn delete_asset(path: String) -> Result<(), String> {
    println!("🗑️ Deleting asset: {}", path);

    let asset_path = PathBuf::from(&path);
    if asset_path.is_dir() {
        fs::remove_dir_all(&asset_path).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(&asset_path).map_err(|e| e.to_string())?;
    }

    println!("✅ Asset deleted");
    Ok(())
}

// ============================================================
// Recent Projects Commands
// ============================================================

async fn add_recent_project_internal(path: &str, name: &str) -> Result<(), String> {
    let recent_path = get_recent_projects_path();

    if let Some(parent) = recent_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let mut recent: Vec<RecentProject> = if recent_path.exists() {
        let content = fs::read_to_string(&recent_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        vec![]
    };

    // Remove existing entry with same path
    recent.retain(|p| p.path != path);

    // Add new entry at the beginning
    recent.insert(0, RecentProject {
        path: path.to_string(),
        name: name.to_string(),
        last_opened: Utc::now().to_rfc3339(),
        thumbnail: None,
    });

    // Keep only last 10
    recent.truncate(10);

    let json = serde_json::to_string_pretty(&recent).unwrap();
    fs::write(&recent_path, json).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_recent_projects() -> Result<Vec<RecentProject>, String> {
    println!("📋 Getting recent projects");

    let recent_path = get_recent_projects_path();

    if !recent_path.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&recent_path).map_err(|e| e.to_string())?;
    let recent: Vec<RecentProject> = serde_json::from_str(&content).unwrap_or_default();

    // Filter out non-existent projects
    let valid_recent: Vec<RecentProject> = recent
        .into_iter()
        .filter(|p| PathBuf::from(&p.path).join("proyecto.skuld").exists())
        .collect();

    Ok(valid_recent)
}

#[tauri::command]
async fn add_recent_project(path: String, name: String) -> Result<(), String> {
    add_recent_project_internal(&path, &name).await
}

#[tauri::command]
async fn remove_recent_project(path: String) -> Result<(), String> {
    println!("🗑️ Removing from recent: {}", path);

    let recent_path = get_recent_projects_path();

    if !recent_path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&recent_path).map_err(|e| e.to_string())?;
    let mut recent: Vec<RecentProject> = serde_json::from_str(&content).unwrap_or_default();

    recent.retain(|p| p.path != path);

    let json = serde_json::to_string_pretty(&recent).unwrap();
    fs::write(&recent_path, json).map_err(|e| e.to_string())?;

    Ok(())
}

// ============================================================
// Vault Commands (Local Vault Management)
// ============================================================

#[derive(Debug, Serialize, Deserialize)]
struct VaultSecret {
    name: String,
    description: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[tauri::command]
async fn vault_exists(path: String) -> Result<bool, String> {
    // LocalVault creates vault.enc and vault.meta files
    let vault_enc = PathBuf::from(&path).join("vault.enc");
    let vault_meta = PathBuf::from(&path).join("vault.meta");
    // Vault exists if both files are present
    Ok(vault_enc.exists() && vault_meta.exists())
}

/// Delete existing vault files to allow recreation
#[tauri::command]
async fn vault_delete(path: String) -> Result<bool, String> {
    println!("Deleting vault at: {}", path);
    let vault_enc = PathBuf::from(&path).join("vault.enc");
    let vault_meta = PathBuf::from(&path).join("vault.meta");
    
    if vault_enc.exists() {
        fs::remove_file(&vault_enc).map_err(|e| format!("Failed to delete vault.enc: {}", e))?;
    }
    if vault_meta.exists() {
        fs::remove_file(&vault_meta).map_err(|e| format!("Failed to delete vault.meta: {}", e))?;
    }
    
    // Clear session
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Lock error: {}", e))?;
    session.password = None;
    session.path = None;
    
    println!("Vault deleted successfully");
    Ok(true)
}

#[tauri::command]
async fn vault_is_unlocked(path: String) -> Result<bool, String> {
    // Check if vault is unlocked by verifying session state
    let session = VAULT_SESSION.lock().map_err(|e| format!("Lock error: {}", e))?;
    let is_unlocked = session.password.is_some() && session.path.as_ref() == Some(&path);
    Ok(is_unlocked)
}

#[tauri::command]
async fn vault_create(password: String, path: String) -> Result<bool, String> {
    println!("Creating vault at: {}", path);

    let engine_path = get_engine_path();
    let python_exe = get_python_executable();

    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')
from skuldbot.libs.local_vault import LocalVault

vault = LocalVault('{}')
vault.create('{}')
print('OK')
"#,
            engine_path.display(),
            path.replace("'", "\\'"),
            password.replace("'", "\\'")
        ))
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e))?;

    if output.status.success() {
        println!("Vault created successfully");
        Ok(true)
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to create vault: {}", error))
    }
}

/// Generate a secure random password for the vault
fn generate_vault_password() -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let mut rng = rand::thread_rng();
    let password: String = (0..32)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect();
    password
}

fn vault_keyring_entry(vault_path: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("skuldbot-studio-vault", vault_path)
        .map_err(|e| format!("Keyring error: {}", e))
}

fn save_vault_key_keyring(vault_path: &str, password: &str) -> Result<(), String> {
    let entry = vault_keyring_entry(vault_path)?;
    entry
        .set_password(password)
        .map_err(|e| format!("Keyring error: {}", e))
}

fn load_vault_key_keyring(vault_path: &str) -> Result<String, String> {
    let entry = vault_keyring_entry(vault_path)?;
    entry
        .get_password()
        .map_err(|e| format!("Keyring error: {}", e))
}

/// Save vault key securely in the OS keyring
fn save_vault_key(vault_path: &str, password: &str) -> Result<(), String> {
    save_vault_key_keyring(vault_path, password)
}

/// Load vault key from the OS keyring
fn load_vault_key(vault_path: &str) -> Result<String, String> {
    load_vault_key_keyring(vault_path)
}

fn vault_key_fallback_path(vault_path: &str, app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut base = app_data_dir(&app_handle.config())
        .ok_or_else(|| "Failed to resolve app data dir".to_string())?;
    base.push("vault_keys");
    fs::create_dir_all(&base).map_err(|e| format!("Failed to create vault_keys dir: {}", e))?;

    let mut hasher = Sha256::new();
    hasher.update(vault_path.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    base.push(format!("{}.key", hash));
    Ok(base)
}

fn save_vault_key_fallback(vault_path: &str, password: &str, app_handle: &tauri::AppHandle) -> Result<(), String> {
    let path = vault_key_fallback_path(vault_path, app_handle)?;
    let mut file = fs::File::create(&path).map_err(|e| format!("Failed to create fallback key file: {}", e))?;
    file.write_all(password.as_bytes()).map_err(|e| format!("Failed to write fallback key: {}", e))?;
    Ok(())
}

fn load_vault_key_fallback(vault_path: &str, app_handle: &tauri::AppHandle) -> Result<String, String> {
    let path = vault_key_fallback_path(vault_path, app_handle)?;
    let data = fs::read_to_string(&path).map_err(|e| format!("Failed to read fallback key: {}", e))?;
    Ok(data.trim().to_string())
}

fn save_vault_key_with_fallback(
    vault_path: &str,
    password: &str,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    if let Err(err) = save_vault_key(vault_path, password) {
        println!("⚠️  Keyring failed: {}. Using fallback file.", err);
        save_vault_key_fallback(vault_path, password, app_handle)?;
    }
    Ok(())
}

fn load_vault_key_with_fallback(
    vault_path: &str,
    app_handle: &tauri::AppHandle,
) -> Result<String, String> {
    match load_vault_key(vault_path) {
        Ok(p) => Ok(p),
        Err(_) => load_vault_key_fallback(vault_path, app_handle),
    }
}

/// Create vault automatically with generated password, save key, and unlock
#[tauri::command]
async fn vault_create_auto(path: String, app: tauri::AppHandle) -> Result<bool, String> {
    println!("Creating vault automatically at: {}", path);

    // Generate secure password
    let password = generate_vault_password();

    let engine_path = get_engine_path();
    let python_exe = get_python_executable();

    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')
from skuldbot.libs.local_vault import LocalVault

vault = LocalVault('{}')
vault.create('{}')
print('OK')
"#,
            engine_path.display(),
            path.replace("'", "\\'"),
            password.replace("'", "\\'")
        ))
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e))?;

    if output.status.success() {
        println!("Vault created automatically");

        if let Err(err) = save_vault_key_with_fallback(&path, &password, &app) {
            println!("⚠️  Failed to persist vault key: {}", err);
            println!("⚠️  Auto-unlock may be unavailable on next launch.");
        }

        // Store password in session - vault is unlocked for this session
        let mut session = VAULT_SESSION.lock().map_err(|e| format!("Lock error: {}", e))?;
        session.password = Some(password);
        session.path = Some(path);
        Ok(true)
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to create vault: {}", error))
    }
}

/// Auto-unlock vault using saved key file
#[tauri::command]
async fn vault_auto_unlock(path: String, app: tauri::AppHandle) -> Result<bool, String> {
    println!("Attempting auto-unlock for vault at: {}", path);

    // Try to load saved key
    let password = match load_vault_key_with_fallback(&path, &app) {
        Ok(p) => p,
        Err(_) => return Ok(false), // No keyring entry, need manual unlock
    };

    let engine_path = get_engine_path();
    let python_exe = get_python_executable();

    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')
from skuldbot.libs.local_vault import LocalVault

vault = LocalVault('{}')
vault.unlock('{}')
print('OK')
"#,
            engine_path.display(),
            path.replace("'", "\\'"),
            password.replace("'", "\\'")
        ))
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e))?;

    if output.status.success() {
        println!("Vault auto-unlocked successfully");
        // Store password in session
        let mut session = VAULT_SESSION.lock().map_err(|e| format!("Lock error: {}", e))?;
        session.password = Some(password);
        session.path = Some(path);
        Ok(true)
    } else {
        // Key file exists but unlock failed - might be corrupted or from different machine
        println!("Auto-unlock failed, key might be invalid");
        Ok(false)
    }
}

#[tauri::command]
async fn vault_unlock(password: String, path: String, app: tauri::AppHandle) -> Result<bool, String> {
    println!("Unlocking vault at: {}", path);

    let engine_path = get_engine_path();
    let python_exe = get_python_executable();

    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')
from skuldbot.libs.local_vault import LocalVault

vault = LocalVault('{}')
vault.unlock('{}')
print('OK')
"#,
            engine_path.display(),
            path.replace("'", "\\'"),
            password.replace("'", "\\'")
        ))
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e))?;

    if output.status.success() {
        println!("Vault unlocked successfully");
        if let Err(err) = save_vault_key_with_fallback(&path, &password, &app) {
            println!("⚠️  Failed to persist vault key: {}", err);
        }
        // Store password in session
        let mut session = VAULT_SESSION.lock().map_err(|e| format!("Lock error: {}", e))?;
        session.password = Some(password);
        session.path = Some(path);
        Ok(true)
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to unlock vault: {}", error))
    }
}

#[tauri::command]
async fn vault_lock(path: String) -> Result<bool, String> {
    // Clear password from session
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Lock error: {}", e))?;
    session.password = None;
    session.path = None;
    println!("Vault locked: {}", path);
    Ok(true)
}

#[tauri::command]
async fn vault_list_secrets(path: String) -> Result<Vec<VaultSecret>, String> {
    println!("Listing secrets from vault: {}", path);

    let engine_path = get_engine_path();
    let python_exe = get_python_executable();

    // Get password from session
    let session = VAULT_SESSION.lock().map_err(|e| format!("Lock error: {}", e))?;
    let password = session.password.clone()
        .ok_or_else(|| "Vault is not unlocked. Please unlock the vault first.".to_string())?;

    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
import json
sys.path.insert(0, '{}')
from skuldbot.libs.local_vault import LocalVault

vault = LocalVault('{}')
vault.unlock('{}')
secrets = vault.list_secrets()
print(json.dumps(secrets))
"#,
            engine_path.display(),
            path.replace("'", "\\'"),
            password.replace("'", "\\'")
        ))
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let secrets: Vec<VaultSecret> = serde_json::from_str(&stdout)
            .map_err(|e| format!("Failed to parse secrets: {}", e))?;
        Ok(secrets)
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to list secrets: {}", error))
    }
}

// SECURITY: vault_get_secret was removed - values must NEVER be returned to frontend
// Use vault_verify_secret instead to check if a secret exists

#[tauri::command]
async fn vault_verify_secret(name: String, path: String) -> Result<bool, String> {
    println!("Verifying secret '{}' exists in vault: {}", name, path);

    let engine_path = get_engine_path();
    let python_exe = get_python_executable();

    // Get password from session
    let session = VAULT_SESSION.lock().map_err(|e| format!("Lock error: {}", e))?;
    let password = session.password.clone()
        .ok_or_else(|| "Vault is not unlocked".to_string())?;

    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')
from skuldbot.libs.local_vault import LocalVault

vault = LocalVault('{}')
vault.unlock('{}')
# Only check existence, NEVER return value
exists = vault.secret_exists('{}')
print('true' if exists else 'false')
"#,
            engine_path.display(),
            path.replace("'", "\\'"),
            password.replace("'", "\\'"),
            name.replace("'", "\\'")
        ))
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e))?;

    if output.status.success() {
        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(result == "true")
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to verify secret: {}", error))
    }
}

#[tauri::command]
async fn vault_set_secret(name: String, value: String, description: Option<String>, path: String) -> Result<bool, String> {
    println!("Setting secret '{}' in vault: {}", name, path);

    let engine_path = get_engine_path();
    let python_exe = get_python_executable();

    // Get password from session
    let session = VAULT_SESSION.lock().map_err(|e| format!("Lock error: {}", e))?;
    let password = session.password.clone()
        .ok_or_else(|| "Vault is not unlocked".to_string())?;

    let desc_arg = description.map(|d| format!("description='{}'", d.replace("'", "\\'"))).unwrap_or_default();

    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')
from skuldbot.libs.local_vault import LocalVault

vault = LocalVault('{}')
vault.unlock('{}')
vault.set_secret('{}', '{}'{})
print('OK')
"#,
            engine_path.display(),
            path.replace("'", "\\'"),
            password.replace("'", "\\'"),
            name.replace("'", "\\'"),
            value.replace("'", "\\'"),
            if desc_arg.is_empty() { "".to_string() } else { format!(", {}", desc_arg) }
        ))
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e))?;

    if output.status.success() {
        println!("Secret '{}' saved", name);
        Ok(true)
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to set secret: {}", error))
    }
}

#[tauri::command]
async fn vault_delete_secret(name: String, path: String) -> Result<bool, String> {
    println!("Deleting secret '{}' from vault: {}", name, path);

    let engine_path = get_engine_path();
    let python_exe = get_python_executable();

    // Get password from session
    let session = VAULT_SESSION.lock().map_err(|e| format!("Lock error: {}", e))?;
    let password = session.password.clone()
        .ok_or_else(|| "Vault is not unlocked".to_string())?;

    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')
from skuldbot.libs.local_vault import LocalVault

vault = LocalVault('{}')
vault.unlock('{}')
vault.delete_secret('{}')
print('OK')
"#,
            engine_path.display(),
            path.replace("'", "\\'"),
            password.replace("'", "\\'"),
            name.replace("'", "\\'")
        ))
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e))?;

    if output.status.success() {
        println!("Secret '{}' deleted", name);
        Ok(true)
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to delete secret: {}", error))
    }
}

#[tauri::command]
async fn vault_change_password(old_password: String, new_password: String, path: String) -> Result<bool, String> {
    println!("Changing vault password: {}", path);

    let engine_path = get_engine_path();
    let python_exe = get_python_executable();

    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')
from skuldbot.libs.local_vault import LocalVault

vault = LocalVault('{}')
vault.unlock('{}')
vault.change_password('{}', '{}')
print('OK')
"#,
            engine_path.display(),
            path.replace("'", "\\'"),
            old_password.replace("'", "\\'"),
            old_password.replace("'", "\\'"),
            new_password.replace("'", "\\'")
        ))
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e))?;

    if output.status.success() {
        println!("Vault password changed");
        Ok(true)
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to change password: {}", error))
    }
}

// ============================================================
// AI Planner Commands (LLM Integration)
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct PlanStepOutputs {
    #[serde(default)]
    success: Option<String>,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct PlanStepConnections {
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    tools: Option<Vec<String>>,
    #[serde(default)]
    memory: Option<String>,
    #[serde(default)]
    embeddings: Option<String>,
    #[serde(default)]
    connection: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct AIPlanStep {
    #[serde(rename = "nodeType")]
    node_type: String,
    label: String,
    description: String,
    config: serde_json::Value,
    reasoning: Option<String>,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    outputs: Option<PlanStepOutputs>,
    #[serde(default)]
    connections: Option<PlanStepConnections>,
}

#[derive(Debug, Serialize)]
struct AIPlanResponse {
    success: bool,
    plan: Option<Vec<AIPlanStep>>,
    error: Option<String>,
    #[serde(rename = "clarifyingQuestions")]
    clarifying_questions: Option<Vec<String>>,
}

// ============================================================
// AI Planner V2 Types - Executable Workflows
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ValidationIssue {
    severity: String,  // "error" | "warning"
    message: String,
    #[serde(rename = "nodeId", skip_serializing_if = "Option::is_none")]
    node_id: Option<String>,
    #[serde(rename = "nodeType", skip_serializing_if = "Option::is_none")]
    node_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ValidationResult {
    valid: bool,
    compilable: bool,
    errors: Vec<ValidationIssue>,
    warnings: Vec<ValidationIssue>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExecutablePlan {
    goal: String,
    description: String,
    assumptions: Vec<String>,
    unknowns: Vec<Clarification>,
    tasks: Vec<AIPlanStep>,
    dsl: serde_json::Value,  // Complete DSL ready to execute
    validation: ValidationResult,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Clarification {
    question: String,
    blocking: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    context: Option<String>,
}

#[derive(Debug, Serialize, Default)]
struct ExecutablePlanResponse {
    #[serde(default)]
    success: bool,
    #[serde(default)]
    confidence: f64,  // 0.0 - 1.0
    #[serde(skip_serializing_if = "Option::is_none")]
    plan: Option<ExecutablePlan>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(rename = "clarifyingQuestions", skip_serializing_if = "Option::is_none")]
    clarifying_questions: Option<Vec<String>>,
    #[serde(default)]
    suggestions: Vec<String>,
    #[serde(rename = "proposedSteps", skip_serializing_if = "Option::is_none", default)]
    proposed_steps: Option<Vec<String>>, // For "plan" mode
    #[serde(rename = "agentMode", skip_serializing_if = "Option::is_none", default)]
    agent_mode: Option<String>, // "ask", "plan", or "generate"
}

#[derive(Debug, Serialize)]
struct LicenseValidationResult {
    valid: bool,
    module: String,
    #[serde(rename = "expiresAt")]
    expires_at: String,
    features: Vec<String>,
    error: Option<String>,
}

// OpenAI API types
#[derive(Debug, Serialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    temperature: f64,
    max_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct OpenAIChoice {
    message: OpenAIResponseMessage,
}

#[derive(Debug, Deserialize)]
struct OpenAIResponseMessage {
    content: String,
}

#[derive(Debug, Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
}

// Anthropic API types
#[derive(Debug, Serialize)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    max_tokens: u32,
    system: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicContent {
    text: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContent>,
}

// Base system prompt template - node catalog is injected dynamically
const AI_PLANNER_BASE_PROMPT: &str = r#"<system>
You are SkuldBot Studio's expert RPA architect with 15+ years of automation experience.
Your expertise includes: workflow design, AI/ML integration, RAG pipelines, data processing, and enterprise automation.
</system>

<role>
As an expert architect, you MUST:
1. Design efficient, production-ready automation workflows
2. Select the CORRECT specialized nodes for each task
3. Never use generic nodes when specialized ones exist
4. Always consider error handling and data flow
</role>

{NODE_CATALOG}

<critical_rules>
## MANDATORY RULES - VIOLATIONS WILL CAUSE FAILURES

1. **ONLY USE NODES FROM THE CATALOG ABOVE**
   - You MUST use EXACT node types from the catalog (e.g., "ai.model", "compliance.detect_pii")
   - Do NOT invent node types that don't exist
   - Do NOT combine concepts (e.g., "Compliance Embeddings" DOES NOT EXIST)
   - If unsure, use only basic nodes you see in the catalog

2. **ALWAYS start with a trigger node** (trigger.manual, trigger.schedule, trigger.webhook, trigger.form, etc.)

3. **USE SPECIALIZED AI NODES for AI/LLM tasks:**
   - ai.model: Configure LLM provider (OpenAI, Anthropic, Azure, AWS Bedrock, Groq, Ollama)
   - ai.embeddings: Configure embeddings model for RAG (ONLY for vector generation)
   - ai.agent: Autonomous AI agent with tools and memory
   - vectordb.memory: Vector database for RAG context
   - vectordb.*: pgvector, Pinecone, Qdrant, ChromaDB, Supabase operations

4. **FOR COMPLIANCE TASKS, use compliance.* nodes:**
   - compliance.detect_pii: Detect personally identifiable information (names, SSN, etc.)
   - compliance.detect_phi: Detect protected health information (HIPAA)
   - compliance.detect_sensitive: Detect PII and PHI in data
   - compliance.redact_data: Completely remove sensitive data (NOT compliance.redact!)
   - compliance.mask_data: Mask sensitive data with asterisks
   - compliance.safe_harbor: Apply all HIPAA Safe Harbor de-identification
   - compliance.audit_log: Create compliance audit entries
   - compliance.sensitive_gate: Gate that blocks flow if sensitive data detected
   - DO NOT use "embeddings" for compliance - they are DIFFERENT concepts!

5. **NEVER use these generic nodes for AI tasks:**
   ❌ api.request for calling AI APIs directly
   ❌ database.query for vector searches
   ❌ files.write for storing embeddings

6. **For RAG (Retrieval Augmented Generation) workflows, ALWAYS use:**
   - ai.model → connects to ai.agent (model-out → model input)
   - ai.embeddings → connects to ai.agent or vectordb.memory (embeddings-out → embeddings input)
   - vectordb.memory → connects to ai.agent (memory-out → memory input)

7. **Return ONLY valid JSON array, no markdown, no explanation**
</critical_rules>

<output_schema>
Each step must follow this exact JSON structure:
{
  "id": "unique-step-id",
  "nodeType": "category.action",
  "label": "Human readable step name",
  "description": "Clear explanation of what this step accomplishes",
  "config": {
    // Pre-filled configuration values
    // Use realistic placeholders like "${VARIABLE}" for env/config values
    // For node-to-node data, ALWAYS use canonical syntax: "${node:<step-id>|<path>}"
    // Never use label syntax like "${My Node.output}"
  },
  "outputs": {
    // Optional; references by step ID only. If omitted, planner may infer default next step.
    "success": "next-step-id-or-END",
    "error": "error-step-id-or-END"
  },
  "connections": {
    // Optional canonical connections (preferred for canonical wiring), IDs only.
    "model": "source-step-id",
    "tools": ["source-step-id"],
    "memory": "source-step-id",
    "embeddings": "source-step-id",
    "connection": "source-step-id"
  },
  "reasoning": "Brief explanation of why this step is needed in the workflow"
}
</output_schema>

<ai_connection_types>
Visual connection types for AI workflows:
- "model": AI Model → AI Agent (sky blue connection, REQUIRED for ai.agent)
- "embeddings": Embeddings → AI Agent or Vector Memory (orange connection)
- "memory": Vector Memory → AI Agent (purple connection)
- "tool": Any node → AI Agent as callable tool (violet connection)
- "connection": Service/config provider → node (green connection)
</ai_connection_types>

<examples>
## EXAMPLE 1: RAG Chatbot with Azure AI Foundry

User request: "Create a chatbot that uses Azure AI Foundry to answer questions about company documents"

Correct response:
[
  {
    "id": "trig-1",
    "nodeType": "trigger.manual",
    "label": "Start Chat",
    "description": "Manual trigger to start the chatbot",
    "config": {},
    "outputs": { "success": "model-1", "error": "END" },
    "reasoning": "Every workflow needs a trigger to start execution"
  },
  {
    "id": "model-1",
    "nodeType": "ai.model",
    "label": "Azure GPT-4",
    "description": "Configure Azure AI Foundry GPT-4 model",
    "config": {
      "provider": "azure",
      "model": "gpt-4",
      "base_url": "https://your-resource.openai.azure.com",
      "api_version": "2024-02-15-preview",
      "api_key": "${AZURE_OPENAI_KEY}",
      "temperature": 0.7
    },
    "outputs": { "success": "emb-1", "error": "END" },
    "reasoning": "Azure AI Foundry provides enterprise-grade LLM access"
  },
  {
    "id": "emb-1",
    "nodeType": "ai.embeddings",
    "label": "Azure Embeddings",
    "description": "Configure Azure embeddings for semantic search",
    "config": {
      "provider": "azure",
      "model": "text-embedding-ada-002",
      "base_url": "https://your-resource.openai.azure.com",
      "api_key": "${AZURE_OPENAI_KEY}"
    },
    "outputs": { "success": "mem-1", "error": "END" },
    "reasoning": "Embeddings enable semantic search in the vector database"
  },
  {
    "id": "mem-1",
    "nodeType": "vectordb.memory",
    "label": "Company Docs Memory",
    "description": "Vector memory for company documentation",
    "config": {
      "provider": "chroma",
      "collection": "company_docs",
      "memory_type": "retrieve"
    },
    "outputs": { "success": "agent-1", "error": "END" },
    "reasoning": "Vector memory provides RAG context from company documents"
  },
  {
    "id": "agent-1",
    "nodeType": "ai.agent",
    "label": "Company Assistant",
    "description": "AI agent that answers questions using company documentation",
    "config": {
      "goal": "Answer user questions accurately using company documentation context",
      "system_prompt": "You are a helpful company assistant. Use the provided context to answer questions accurately.",
      "max_iterations": 5
    },
    "outputs": { "success": "log-1", "error": "END" },
    "connections": {
      "model": "model-1",
      "embeddings": "emb-1",
      "memory": "mem-1"
    },
    "reasoning": "The AI agent orchestrates the RAG pipeline and generates responses"
  },
  {
    "id": "log-1",
    "nodeType": "logging.log",
    "label": "Log Response",
    "description": "Log the assistant response for audit",
    "config": {
      "message": "${node:agent-1|output}",
      "level": "INFO"
    },
    "outputs": { "success": "END", "error": "END" },
    "reasoning": "Logging responses helps with debugging and audit trails"
  }
]

## EXAMPLE 2: Document Indexing Pipeline

User request: "Index PDF documents into pgvector for later RAG queries"

Correct response:
[
  {
    "id": "sched-1",
    "nodeType": "trigger.schedule",
    "label": "Daily Index",
    "description": "Run document indexing daily",
    "config": {
      "cron": "0 2 * * *"
    },
    "outputs": { "success": "list-1", "error": "END" },
    "reasoning": "Schedule ensures documents are indexed regularly"
  },
  {
    "id": "list-1",
    "nodeType": "files.list",
    "label": "List PDFs",
    "description": "Get list of PDF files to index",
    "config": {
      "path": "/documents/incoming",
      "pattern": "*.pdf"
    },
    "outputs": { "success": "ocr-1", "error": "END" },
    "reasoning": "Find all new PDF documents to process"
  },
  {
    "id": "ocr-1",
    "nodeType": "document.ocr",
    "label": "Extract Text",
    "description": "Extract text from PDF documents",
    "config": {
      "file_path": "${node:list-1|files}",
      "language": "en"
    },
    "outputs": { "success": "emb-1", "error": "END" },
    "reasoning": "OCR extracts text content from PDFs for embedding"
  },
  {
    "id": "emb-1",
    "nodeType": "ai.embeddings",
    "label": "OpenAI Embeddings",
    "description": "Configure OpenAI embeddings model",
    "config": {
      "provider": "openai",
      "model": "text-embedding-3-small",
      "api_key": "${OPENAI_API_KEY}"
    },
    "outputs": { "success": "conn-1", "error": "END" },
    "reasoning": "Embeddings convert text to vectors for semantic search"
  },
  {
    "id": "conn-1",
    "nodeType": "vectordb.pgvector_connect",
    "label": "Connect pgvector",
    "description": "Connect to PostgreSQL with pgvector extension",
    "config": {
      "connection_string": "${POSTGRES_URL}",
      "table_name": "document_embeddings",
      "dimension": 1536
    },
    "outputs": { "success": "upsert-1", "error": "END" },
    "reasoning": "pgvector provides scalable vector storage in PostgreSQL"
  },
  {
    "id": "upsert-1",
    "nodeType": "vectordb.pgvector_upsert",
    "label": "Store Embeddings",
    "description": "Store document embeddings in pgvector",
    "config": {
      "texts": "${node:ocr-1|text}",
      "metadata": { "source": "${node:list-1|files}" }
    },
    "outputs": { "success": "END", "error": "END" },
    "connections": {
      "embeddings": "emb-1",
      "connection": "conn-1"
    },
    "reasoning": "Upserting embeddings enables later RAG retrieval"
  }
]

## EXAMPLE 3: Compliance-First RAG with PII Detection

User request: "Create a RAG system that detects PII before storing documents"

Correct response:
[
  {
    "id": "trig-1",
    "nodeType": "trigger.manual",
    "label": "Process Document",
    "description": "Manual trigger to process a document",
    "config": {},
    "outputs": { "success": "read-1", "error": "END" },
    "reasoning": "Every workflow needs a trigger"
  },
  {
    "id": "read-1",
    "nodeType": "files.read",
    "label": "Read Document",
    "description": "Read the document content",
    "config": {
      "file_path": "${input.file_path}"
    },
    "outputs": { "success": "pii-1", "error": "END" },
    "reasoning": "Need to read the document before processing"
  },
  {
    "id": "pii-1",
    "nodeType": "compliance.detect_pii",
    "label": "Detect PII",
    "description": "Scan document for personally identifiable information",
    "config": {
      "text": "${node:read-1|content}",
      "entities": ["PERSON", "EMAIL", "PHONE", "SSN", "ADDRESS"]
    },
    "outputs": { "success": "redact-1", "error": "END" },
    "reasoning": "Compliance requires PII detection before storage"
  },
  {
    "id": "redact-1",
    "nodeType": "compliance.redact_data",
    "label": "Redact Sensitive Data",
    "description": "Remove detected PII from the document",
    "config": {
      "data": "${node:read-1|content}",
      "fields": "${node:pii-1|entities}",
      "replacement": "[REDACTED]"
    },
    "outputs": { "success": "emb-1", "error": "END" },
    "reasoning": "Redact PII before storing in vector database"
  },
  {
    "id": "emb-1",
    "nodeType": "ai.embeddings",
    "label": "OpenAI Embeddings",
    "description": "Generate embeddings from redacted text",
    "config": {
      "provider": "openai",
      "model": "text-embedding-3-small",
      "api_key": "${OPENAI_API_KEY}"
    },
    "outputs": { "success": "store-1", "error": "END" },
    "reasoning": "Embeddings convert clean text to vectors"
  },
  {
    "id": "store-1",
    "nodeType": "vectordb.pgvector_upsert",
    "label": "Store Safe Vectors",
    "description": "Store redacted document embeddings",
    "config": {
      "texts": "${node:redact-1|redacted_text}",
      "metadata": { "original_file": "${input.file_path}", "pii_detected": "${node:pii-1|count}" }
    },
    "outputs": { "success": "audit-1", "error": "END" },
    "connections": {
      "embeddings": "emb-1"
    },
    "reasoning": "Store only PII-free content in vector DB"
  },
  {
    "id": "audit-1",
    "nodeType": "compliance.audit_log",
    "label": "Log Compliance Action",
    "description": "Create audit trail for compliance",
    "config": {
      "action": "document_processed",
      "details": { "pii_found": "${node:pii-1|count}", "file": "${input.file_path}" }
    },
    "outputs": { "success": "END", "error": "END" },
    "reasoning": "Audit logging is required for compliance"
  }
]

## NEGATIVE EXAMPLE - WHAT NOT TO DO:

❌ WRONG approach for RAG:
[
  { "nodeType": "trigger.api_polling", "label": "Call Azure API", ... },
  { "nodeType": "api.request", "label": "Call OpenAI", "config": { "url": "https://api.openai.com/v1/chat/completions" }, ... },
  { "nodeType": "database.query", "label": "Search Vectors", ... }
]

This is WRONG because:
- Uses api.request instead of ai.model and ai.agent
- Uses database.query instead of vectordb.* nodes
- Missing proper AI node connections
- Doesn't leverage SkuldBot's specialized AI capabilities

❌ WRONG: Inventing non-existent node types:
[
  { "nodeType": "ai.compliance_embeddings", ... },
  { "nodeType": "compliance.embeddings", ... },
  { "nodeType": "vectordb.compliance_store", ... }
]

This is WRONG because:
- "ai.compliance_embeddings" DOES NOT EXIST - embeddings are for vectors, not compliance
- "compliance.embeddings" DOES NOT EXIST - use compliance.detect_pii, compliance.redact_data separately
- NEVER invent node types - only use EXACT types from the catalog
</examples>

<thinking_process>
Before generating the plan, mentally walk through:
1. What is the user trying to accomplish?
2. Does this involve AI/LLM? → Use ai.model, ai.agent, ai.embeddings
3. Does this involve RAG/vectors? → Use vectordb.* nodes
4. What trigger makes sense? (manual, schedule, webhook, form)
5. What's the data flow between nodes?
6. What error handling is needed?
7. Are canonical connections and IDs valid and complete?
</thinking_process>

<validation_requirements>
CRITICAL: Every generated plan MUST pass these checks:

1. **Exactly ONE trigger node** (trigger.*)
   - Every workflow starts with a trigger
   - No workflows without triggers
   
2. **Valid outputs for EVERY node**
   - All nodes must have outputs.success and outputs.error
   - No dead-end nodes (except END)
   - Error paths must lead somewhere (not just "END" everywhere)

3. **ONLY use nodes from the catalog**
   - No invented node types
   - No combining concepts (e.g., "compliance.embeddings" DOES NOT EXIST)
   
4. **Proper error handling**
   - Don't route all errors to "END"
   - Consider retry logic, logging, or recovery steps

5. **AI workflows must have proper connections**
   - ai.agent REQUIRES ai.model connection (visual)
   - RAG requires: ai.embeddings + vectordb.memory
   
6. **Realistic config values**
   - Use placeholders like "${VARIABLE_NAME}" for secrets
  - Not "YOUR_API_KEY" or "PLACEHOLDER_VALUE"
   - Include actual selectors, paths, patterns

BEFORE returning your plan, validate it against these requirements.
If ANY requirement fails, FIX IT before returning.
</validation_requirements>

<confidence_scoring>
After generating the plan, assess your confidence (0.0 - 1.0):

**High Confidence (0.8 - 1.0):**
- All requirements are clear
- Standard, well-understood workflow
- All node types are known
- No ambiguity in the task

**Medium Confidence (0.5 - 0.8):**
- Some assumptions made
- Might need clarification on minor details
- Standard workflow but with unknowns
- User might want different approach

**Low Confidence (0.0 - 0.5):**
- Multiple unknowns
- Ambiguous requirements
- Missing critical information
- Need user input to proceed

**If confidence < 0.7:**
Generate specific clarifying questions in the "unknowns" array:
```json
{
  "unknowns": [
    {
      "question": "What file format for the data?",
      "blocking": true,
      "context": "Need to know CSV, Excel, or JSON to choose correct nodes"
    }
  ]
}
```
</confidence_scoring>

<self_correction>
IMPORTANT: Before returning the plan, run this self-check:

1. ✓ All node types exist in catalog?
   → If no: Use similar nodes that DO exist

2. ✓ All nodes have valid outputs?
   → If no: Add success/error paths

3. ✓ No unreachable nodes?
   → If yes: Remove them or fix connections

4. ✓ No cycles?
   → If yes: Break the cycle

5. ✓ Proper error handling?
   → If no: Add error recovery nodes

6. ✓ Config values are realistic?
   → If no: Replace placeholders with actual values or ${VARIABLES}

IF ANY CHECK FAILS: Fix the issue AUTOMATICALLY before returning.
Do NOT return a broken plan and ask the user to fix it.
</self_correction>

<definition_of_done>
For production-ready workflows, each task should define:

1. **Expected Output**
   - What data/artifact does this step produce?
   - Example: "CSV file with filtered records" or "List of URLs"

2. **Success Criteria**
   - How do we know it worked?
   - Example: "File exists and has >0 rows" or "HTTP 200 response"

3. **Error Conditions**
   - What could go wrong?
   - Example: "API timeout", "Invalid credentials", "File not found"

Include this thinking in your "reasoning" field for each step.
</definition_of_done>

<final_instruction>
Now analyze the user's request and generate a professional automation plan.
Use ONLY nodes from the catalog above.
For any AI/LLM/RAG task, ALWAYS use the specialized ai.* and vectordb.* nodes.
Return ONLY the JSON array - no markdown code blocks, no explanations.
</final_instruction>"#;

// Cache for the node catalog (loaded once from Python)
use std::sync::Mutex;
use once_cell::sync::Lazy;

static NODE_CATALOG_CACHE: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

/// Load the node catalog from Python NodeRegistry
fn load_node_catalog() -> Result<String, String> {
    // Check cache first
    {
        let cache = NODE_CATALOG_CACHE.lock().map_err(|e| e.to_string())?;
        if let Some(ref catalog) = *cache {
            return Ok(catalog.clone());
        }
    }

    // Load from Python using the virtualenv
    let engine_path = get_engine_path();

    // Try virtualenv Python first, then fall back to system Python
    let venv_python = engine_path.join(".venv/bin/python3");
    let python_cmd = if venv_python.exists() {
        venv_python.to_string_lossy().to_string()
    } else {
        "python3".to_string()
    };

    println!("📚 Loading node catalog from: {} using {}", engine_path.display(), python_cmd);

    // Use compact format for 75% smaller prompt (3.5KB vs 14KB)
    let output = std::process::Command::new(&python_cmd)
        .arg("-m")
        .arg("skuldbot.cli.ai_catalog")
        .arg("--format")
        .arg("compact")
        .current_dir(&engine_path)
        .output()
        .map_err(|e| format!("Failed to run ai_catalog: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        println!("⚠️  ai_catalog failed: {}", stderr);
        return Err(format!("ai_catalog failed: {}", stderr));
    }

    let catalog = String::from_utf8_lossy(&output.stdout).to_string();
    println!("✅ Loaded node catalog ({} bytes)", catalog.len());

    // Cache the result
    {
        let mut cache = NODE_CATALOG_CACHE.lock().map_err(|e| e.to_string())?;
        *cache = Some(catalog.clone());
    }

    Ok(catalog)
}

/// Build the full AI Planner system prompt with dynamic node catalog
fn build_ai_planner_prompt() -> Result<String, String> {
    let catalog = load_node_catalog()?;
    Ok(AI_PLANNER_BASE_PROMPT.replace("{NODE_CATALOG}", &catalog))
}

/// Clear the node catalog cache (useful when nodes are updated)
#[allow(dead_code)]
fn clear_node_catalog_cache() -> Result<(), String> {
    let mut cache = NODE_CATALOG_CACHE.lock().map_err(|e| e.to_string())?;
    *cache = None;
    Ok(())
}

/// Cache for valid node types loaded from Python
static VALID_NODE_TYPES_CACHE: Lazy<Mutex<Option<Vec<String>>>> = Lazy::new(|| Mutex::new(None));

/// Load valid node types from Python NodeRegistry (JSON format)
fn load_valid_node_types() -> Result<Vec<String>, String> {
    // Check cache first
    {
        let cache = VALID_NODE_TYPES_CACHE.lock().map_err(|e| e.to_string())?;
        if let Some(ref types) = *cache {
            return Ok(types.clone());
        }
    }

    // Load from Python using JSON format
    let engine_path = get_engine_path();
    let venv_python = engine_path.join(".venv/bin/python3");
    let python_cmd = if venv_python.exists() {
        venv_python.to_string_lossy().to_string()
    } else {
        "python3".to_string()
    };

    println!("📚 Loading valid node types from registry...");

    let output = std::process::Command::new(&python_cmd)
        .arg("-m")
        .arg("skuldbot.cli.ai_catalog")
        .arg("--format")
        .arg("json")
        .current_dir(&engine_path)
        .output()
        .map_err(|e| format!("Failed to run ai_catalog: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ai_catalog failed: {}", stderr));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let catalog: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse catalog JSON: {}", e))?;

    // Extract node types from the catalog
    let node_types: Vec<String> = catalog
        .get("nodes")
        .and_then(|n| n.as_array())
        .map(|nodes| {
            nodes.iter()
                .filter_map(|node| node.get("node_type").and_then(|t| t.as_str()))
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default();

    println!("✅ Loaded {} valid node types", node_types.len());

    // Cache the result
    {
        let mut cache = VALID_NODE_TYPES_CACHE.lock().map_err(|e| e.to_string())?;
        *cache = Some(node_types.clone());
    }

    Ok(node_types)
}

fn normalize_node_type_key(node_type: &str) -> String {
    node_type
        .trim()
        .to_lowercase()
        .replace(' ', "_")
        .replace('-', "_")
        .replace(':', ".")
        .replace('/', ".")
}

fn resolve_node_type_alias(node_type: &str) -> Option<&'static str> {
    match node_type {
        "excel.save_as_csv"
        | "excel.export_csv"
        | "excel.save_csv"
        | "excel.write_csv"
        | "excel.csv_export" => Some("excel.csv_write"),
        "excel.read_csv" | "excel.load_csv" | "excel.import_csv" | "excel.csv_load" => {
            Some("excel.csv_read")
        }
        "http.request" | "http.get" | "http.post" | "api.request" => Some("api.http_request"),
        "json.parse" | "parse.json" => Some("api.parse_json"),
        "condition.if" | "if.condition" => Some("control.if"),
        "condition.loop" | "loop.condition" => Some("control.loop"),
        "condition.switch" => Some("control.switch"),
        "error.handler" | "exception.handler" | "error.handle" => Some("control.try_catch"),
        "web.open" | "browser.open" => Some("web.open_browser"),
        "web.goto" | "web.go_to" => Some("web.navigate"),
        "logging.notify" => Some("logging.notification"),
        "ai.prompt" => Some("ai.llm_prompt"),
        "ai.extract" => Some("ai.extract_data"),
        "db.query" => Some("database.query"),
        "db.insert" => Some("database.insert"),
        "db.update" => Some("database.update"),
        _ => None,
    }
}

fn resolve_node_type(node_type: &str, valid_types: &[String]) -> Option<String> {
    if valid_types.contains(&node_type.to_string()) {
        return Some(node_type.to_string());
    }

    let normalized = normalize_node_type_key(node_type);
    if valid_types.contains(&normalized) {
        return Some(normalized);
    }

    if let Some(alias) = resolve_node_type_alias(&normalized) {
        if valid_types.iter().any(|v| v == alias) {
            return Some(alias.to_string());
        }
    }

    if let Some(stripped) = normalized.strip_prefix("node.") {
        if valid_types.iter().any(|v| v == stripped) {
            return Some(stripped.to_string());
        }
    }

    None
}

fn suggest_node_types(node_type: &str, valid_types: &[String], max_suggestions: usize) -> Vec<String> {
    let key = normalize_node_type_key(node_type);
    let mut parts = key.split('.');
    let category = parts.next().unwrap_or_default();
    let action = parts.next().unwrap_or_default();
    let action_tokens: Vec<&str> = action.split('_').filter(|t| !t.is_empty()).collect();

    let mut scored: Vec<(i32, String)> = valid_types
        .iter()
        .map(|candidate| {
            let ckey = normalize_node_type_key(candidate);
            let mut score = 0;

            if !category.is_empty() && ckey.starts_with(&format!("{}.", category)) {
                score += 3;
            }
            if !action.is_empty() && ckey.contains(action) {
                score += 2;
            }
            for token in &action_tokens {
                if ckey.contains(token) {
                    score += 1;
                }
            }
            if key.contains("csv") && ckey.contains("csv") {
                score += 2;
            }

            (score, candidate.clone())
        })
        .filter(|(score, _)| *score > 0)
        .collect();

    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    scored
        .into_iter()
        .take(max_suggestions)
        .map(|(_, candidate)| candidate)
        .collect()
}

fn normalize_plan_node_types(plan: &mut [AIPlanStep]) -> Result<(), String> {
    let valid_types = match load_valid_node_types() {
        Ok(types) => types,
        Err(e) => {
            println!(
                "⚠️  Could not load valid node types for normalization, skipping normalization: {}",
                e
            );
            return Ok(());
        }
    };

    for step in plan.iter_mut() {
        if let Some(resolved) = resolve_node_type(&step.node_type, &valid_types) {
            if resolved != step.node_type {
                println!(
                    "🔧 Normalized node type '{}' -> '{}' (step '{}')",
                    step.node_type, resolved, step.label
                );
                step.node_type = resolved;
            }
        }
    }

    Ok(())
}

/// Validate that all node types in the plan are valid
fn validate_plan_node_types(plan: &[AIPlanStep]) -> Result<(), String> {
    let valid_types = match load_valid_node_types() {
        Ok(types) => types,
        Err(e) => {
            println!("⚠️  Could not load valid node types, skipping validation: {}", e);
            return Ok(()); // Skip validation if we can't load the catalog
        }
    };

    let mut invalid_entries: Vec<String> = Vec::new();

    for step in plan {
        if !valid_types.contains(&step.node_type) {
            let suggestions = suggest_node_types(&step.node_type, &valid_types, 3);
            if suggestions.is_empty() {
                invalid_entries.push(format!("{} (step '{}')", step.node_type, step.label));
            } else {
                invalid_entries.push(format!(
                    "{} (step '{}', maybe: {})",
                    step.node_type,
                    step.label,
                    suggestions.join(", ")
                ));
            }
        }
    }

    if !invalid_entries.is_empty() {
        return Err(format!(
            "Invalid node types detected:\n- {}\nThese nodes do not exist in the SkuldBot catalog. Please use only valid node types.",
            invalid_entries.join("\n- ")
        ));
    }

    Ok(())
}

fn validate_plan_references(plan: &[AIPlanStep]) -> Result<(), String> {
    use std::collections::HashSet;

    let mut step_ids: Vec<String> = Vec::with_capacity(plan.len());
    let mut id_set: HashSet<String> = HashSet::new();
    let mut label_set: HashSet<String> = HashSet::new();
    let mut errors: Vec<String> = Vec::new();

    for (idx, step) in plan.iter().enumerate() {
        let step_id = step
            .id
            .clone()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| format!("node-{}", idx));

        if !id_set.insert(step_id.clone()) {
            errors.push(format!("Duplicate step id '{}'", step_id));
        }
        step_ids.push(step_id);

        let label = step.label.trim();
        if !label.is_empty() {
            label_set.insert(label.to_string());
        }
    }

    let validate_ref = |
        owner_id: &str,
        field: &str,
        raw_ref: &str,
        allow_end: bool,
    | -> Option<String> {
        let trimmed = raw_ref.trim();
        if trimmed.is_empty() {
            return Some(format!("{} {} is empty", owner_id, field));
        }
        if trimmed.eq_ignore_ascii_case("END") {
            if allow_end {
                return None;
            }
            return Some(format!("{} {} cannot reference END", owner_id, field));
        }
        if id_set.contains(trimmed) {
            return None;
        }
        if label_set.contains(trimmed) {
            return Some(format!(
                "{} {} uses label '{}' (labels are not allowed; use step id)",
                owner_id, field, trimmed
            ));
        }
        Some(format!(
            "{} {} references unknown step id '{}'",
            owner_id, field, trimmed
        ))
    };

    for (idx, step) in plan.iter().enumerate() {
        let owner_id = &step_ids[idx];

        if let Some(outputs) = step.outputs.as_ref() {
            if let Some(success_ref) = outputs.success.as_ref() {
                if let Some(err) = validate_ref(owner_id, "outputs.success", success_ref, true) {
                    errors.push(err);
                }
            }
            if let Some(error_ref) = outputs.error.as_ref() {
                if let Some(err) = validate_ref(owner_id, "outputs.error", error_ref, true) {
                    errors.push(err);
                }
            }
        }

        if let Some(connections) = step.connections.as_ref() {
            if let Some(model_ref) = connections.model.as_ref() {
                if let Some(err) = validate_ref(owner_id, "connections.model", model_ref, false) {
                    errors.push(err);
                }
            }
            if let Some(memory_ref) = connections.memory.as_ref() {
                if let Some(err) = validate_ref(owner_id, "connections.memory", memory_ref, false) {
                    errors.push(err);
                }
            }
            if let Some(emb_ref) = connections.embeddings.as_ref() {
                if let Some(err) = validate_ref(owner_id, "connections.embeddings", emb_ref, false) {
                    errors.push(err);
                }
            }
            if let Some(conn_ref) = connections.connection.as_ref() {
                if let Some(err) = validate_ref(owner_id, "connections.connection", conn_ref, false) {
                    errors.push(err);
                }
            }
            if let Some(tool_refs) = connections.tools.as_ref() {
                for (tool_idx, tool_ref) in tool_refs.iter().enumerate() {
                    if let Some(err) = validate_ref(
                        owner_id,
                        &format!("connections.tools[{}]", tool_idx),
                        tool_ref,
                        false,
                    ) {
                        errors.push(err);
                    }
                }
            }
        }

    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(format!("Invalid plan references:\n- {}", errors.join("\n- ")))
    }
}

// ============================================================
// AI Planner V2 - Validation Pipeline
// ============================================================

/// Convert plan steps to complete DSL format
fn plan_to_dsl(goal: &str, plan: &[AIPlanStep]) -> serde_json::Value {
    use std::collections::{HashMap, HashSet};

    let mut used_node_ids = HashSet::new();
    let mut node_ids: Vec<String> = Vec::with_capacity(plan.len());

    for (idx, step) in plan.iter().enumerate() {
        let base = step
            .id
            .clone()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| format!("node-{}", idx));

        let mut candidate = base.clone();
        if used_node_ids.contains(&candidate) {
            candidate = format!("{}-{}", base, idx);
            while used_node_ids.contains(&candidate) {
                candidate.push('x');
            }
        }

        used_node_ids.insert(candidate.clone());
        node_ids.push(candidate);
    }

    let mut id_lookup: HashMap<String, String> = HashMap::new();

    for (idx, step) in plan.iter().enumerate() {
        let node_id = node_ids[idx].clone();
        id_lookup.insert(node_id.clone(), node_id.clone());

        if let Some(step_id) = step.id.as_ref() {
            let trimmed = step_id.trim();
            if !trimmed.is_empty() {
                id_lookup.insert(trimmed.to_string(), node_id.clone());
            }
        }
    }

    let resolve_ref = |raw: &str| -> Option<String> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return None;
        }
        if trimmed.eq_ignore_ascii_case("END") {
            return Some("END".to_string());
        }
        id_lookup.get(trimmed).cloned()
    };

    let mut connection_map: HashMap<String, PlanStepConnections> = HashMap::new();

    // Canonical connection fields from step.connections
    for (idx, step) in plan.iter().enumerate() {
        if let Some(step_connections) = &step.connections {
            let target_node_id = node_ids[idx].clone();
            let entry = connection_map
                .entry(target_node_id)
                .or_insert_with(PlanStepConnections::default);

            if let Some(model_ref) = step_connections.model.as_ref() {
                if let Some(model_id) = resolve_ref(model_ref) {
                    if model_id != "END" {
                        entry.model = Some(model_id);
                    }
                }
            }

            if let Some(memory_ref) = step_connections.memory.as_ref() {
                if let Some(memory_id) = resolve_ref(memory_ref) {
                    if memory_id != "END" {
                        entry.memory = Some(memory_id);
                    }
                }
            }

            if let Some(emb_ref) = step_connections.embeddings.as_ref() {
                if let Some(emb_id) = resolve_ref(emb_ref) {
                    if emb_id != "END" {
                        entry.embeddings = Some(emb_id);
                    }
                }
            }

            if let Some(conn_ref) = step_connections.connection.as_ref() {
                if let Some(conn_id) = resolve_ref(conn_ref) {
                    if conn_id != "END" {
                        entry.connection = Some(conn_id);
                    }
                }
            }

            if let Some(tool_refs) = step_connections.tools.as_ref() {
                for tool_ref in tool_refs {
                    if let Some(tool_id) = resolve_ref(tool_ref) {
                        if tool_id == "END" {
                            continue;
                        }
                        let tools = entry.tools.get_or_insert_with(Vec::new);
                        if !tools.contains(&tool_id) {
                            tools.push(tool_id);
                        }
                    }
                }
            }
        }
    }

    // Generate nodes from plan steps
    let mut nodes: Vec<serde_json::Value> = Vec::new();
    for (idx, step) in plan.iter().enumerate() {
        let node_id = node_ids[idx].clone();
        let default_next_node = node_ids
            .get(idx + 1)
            .cloned()
            .unwrap_or_else(|| "END".to_string());

        let success_target = step
            .outputs
            .as_ref()
            .and_then(|o| o.success.as_ref())
            .and_then(|raw| resolve_ref(raw))
            .unwrap_or(default_next_node);

        let error_target = step
            .outputs
            .as_ref()
            .and_then(|o| o.error.as_ref())
            .and_then(|raw| resolve_ref(raw))
            .unwrap_or_else(|| "END".to_string());

        let mut node = serde_json::json!({
            "id": node_id,
            "type": step.node_type,
            "label": step.label,
            "description": step.description,
            "config": step.config,
            "outputs": {
                "success": success_target,
                "error": error_target
            }
        });

        if let Some(connections) = connection_map.get(&node_ids[idx]) {
            let mut has_connections = false;
            let mut conn_json = serde_json::Map::new();

            if let Some(model) = connections.model.as_ref() {
                has_connections = true;
                conn_json.insert("model".to_string(), serde_json::json!(model));
            }
            if let Some(memory) = connections.memory.as_ref() {
                has_connections = true;
                conn_json.insert("memory".to_string(), serde_json::json!(memory));
            }
            if let Some(embeddings) = connections.embeddings.as_ref() {
                has_connections = true;
                conn_json.insert("embeddings".to_string(), serde_json::json!(embeddings));
            }
            if let Some(connection) = connections.connection.as_ref() {
                has_connections = true;
                conn_json.insert("connection".to_string(), serde_json::json!(connection));
            }
            if let Some(tools) = connections.tools.as_ref() {
                if !tools.is_empty() {
                    has_connections = true;
                    conn_json.insert("tools".to_string(), serde_json::json!(tools));
                }
            }

            if has_connections {
                node["connections"] = serde_json::Value::Object(conn_json);
            }
        }

        nodes.push(node);
    }

    let triggers: Vec<String> = plan
        .iter()
        .enumerate()
        .filter_map(|(idx, step)| {
            if step.node_type.starts_with("trigger.") {
                Some(node_ids[idx].clone())
            } else {
                None
            }
        })
        .collect();

    let start_node = if !triggers.is_empty() {
        Some(triggers[0].clone())
    } else {
        node_ids.first().cloned()
    };

    let mut dsl = serde_json::json!({
        "version": "1.0",
        "bot": {
            "id": format!("bot-{}", uuid::Uuid::new_v4().to_string()[..8].to_string()),
            "name": goal,
            "description": format!("Automation workflow: {}", goal)
        },
        "nodes": nodes,
        "variables": {}
    });

    if !triggers.is_empty() {
        dsl["triggers"] = serde_json::json!(triggers);
    }
    if let Some(start) = start_node {
        dsl["start_node"] = serde_json::json!(start);
    }

    dsl
}

/// Validate DSL and return detailed results
fn validate_dsl_detailed(dsl: &serde_json::Value) -> Result<ValidationResult, String> {
    let engine_path = get_engine_path();
    let python_exe = get_python_executable();
    
    // Write DSL to temp file
    let temp_dir = std::env::temp_dir();
    let dsl_file = temp_dir.join(format!("validate_{}.json", uuid::Uuid::new_v4()));
    let dsl_str = serde_json::to_string_pretty(dsl).map_err(|e| e.to_string())?;
    std::fs::write(&dsl_file, &dsl_str).map_err(|e| e.to_string())?;
    
    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')
import json
from skuldbot.dsl import DSLValidator

with open('{}', 'r') as f:
    dsl = json.load(f)

validator = DSLValidator()
result = {{
    "valid": False,
    "errors": [],
    "warnings": []
}}

try:
    bot_def = validator.validate(dsl)
    result["valid"] = True
    result["warnings"] = [
        {{"severity": "warning", "message": w}}
        for w in validator.get_warnings()
    ]
except Exception as e:
    result["errors"] = [
        {{"severity": "error", "message": str(e)}}
    ]

print(json.dumps(result))
"#,
            engine_path.display(),
            dsl_file.display()
        ))
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e))?;
    
    // Clean up temp file
    let _ = std::fs::remove_file(&dsl_file);
    
    if output.status.success() {
        let output_str = String::from_utf8_lossy(&output.stdout);
        let validation: serde_json::Value = serde_json::from_str(&output_str)
            .map_err(|e| format!("Failed to parse validation result: {}", e))?;
        
        let valid = validation["valid"].as_bool().unwrap_or(false);
        let errors: Vec<ValidationIssue> = validation["errors"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|e| {
                        Some(ValidationIssue {
                            severity: e["severity"].as_str()?.to_string(),
                            message: e["message"].as_str()?.to_string(),
                            node_id: e["nodeId"].as_str().map(|s| s.to_string()),
                            node_type: e["nodeType"].as_str().map(|s| s.to_string()),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        
        let warnings: Vec<ValidationIssue> = validation["warnings"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|w| {
                        Some(ValidationIssue {
                            severity: "warning".to_string(),
                            message: w["message"].as_str()?.to_string(),
                            node_id: w.get("nodeId").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            node_type: w.get("nodeType").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        
        Ok(ValidationResult {
            valid,
            compilable: false,  // Will be set by test_compile
            errors,
            warnings,
        })
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        Err(format!("Validation failed: {}", error))
    }
}

/// Test compile DSL without executing
fn test_compile_dsl(dsl: &serde_json::Value) -> Result<bool, String> {
    let engine_path = get_engine_path();
    let python_exe = get_python_executable();
    
    // Write DSL to temp file
    let temp_dir = std::env::temp_dir();
    let dsl_file = temp_dir.join(format!("compile_{}.json", uuid::Uuid::new_v4()));
    let dsl_str = serde_json::to_string_pretty(dsl).map_err(|e| e.to_string())?;
    std::fs::write(&dsl_file, &dsl_str).map_err(|e| e.to_string())?;
    
    let output_dir = temp_dir.join(format!("compiled_{}", uuid::Uuid::new_v4()));
    
    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')
import json
import traceback
from skuldbot.compiler import Compiler

with open('{}', 'r') as f:
    dsl = json.load(f)

compiler = Compiler()
try:
    package = compiler.compile(dsl)
    print('COMPILE_SUCCESS')
except Exception as e:
    print('COMPILE_FAILED:', str(e), file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
"#,
            engine_path.display(),
            dsl_file.display()
        ))
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e))?;
    
    // Clean up temp files
    let _ = std::fs::remove_file(&dsl_file);
    let _ = std::fs::remove_dir_all(&output_dir);
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    
    println!("🔧 Compile test stdout: {}", stdout.trim());
    if !stderr.is_empty() {
        println!("🔧 Compile test stderr: {}", stderr.trim());
    }
    
    if output.status.success() && stdout.contains("COMPILE_SUCCESS") {
        Ok(true)
    } else {
        // Get the most useful error message
        let error_msg = if !stderr.is_empty() {
            // Extract just the error message, not full traceback
            stderr.lines()
                .find(|line| line.contains("COMPILE_FAILED:") || line.contains("Error:") || line.contains("Exception:"))
                .unwrap_or(&stderr)
                .to_string()
        } else if !stdout.is_empty() {
            stdout.to_string()
        } else {
            "Unknown compilation error (no output)".to_string()
        };
        
        Err(format!("DSL compilation failed: {}", error_msg.trim()))
    }
}

/// Validate and test compile a plan
fn validate_and_compile_plan(goal: &str, plan: &[AIPlanStep]) -> Result<ValidationResult, String> {
    println!("🔍 Validating plan with {} steps...", plan.len());
    
    // Step 1: Check node types
    if let Err(e) = validate_plan_node_types(plan) {
        return Ok(ValidationResult {
            valid: false,
            compilable: false,
            errors: vec![ValidationIssue {
                severity: "error".to_string(),
                message: e,
                node_id: None,
                node_type: None,
            }],
            warnings: vec![],
        });
    }
    
    // Step 2: Check reference integrity (ID-only contract)
    if let Err(e) = validate_plan_references(plan) {
        return Ok(ValidationResult {
            valid: false,
            compilable: false,
            errors: vec![ValidationIssue {
                severity: "error".to_string(),
                message: e,
                node_id: None,
                node_type: None,
            }],
            warnings: vec![],
        });
    }

    // Step 3: Convert to DSL
    let dsl = plan_to_dsl(goal, plan);
    
    // Step 4: Validate DSL structure
    let mut validation_result = match validate_dsl_detailed(&dsl) {
        Ok(result) => result,
        Err(e) => {
            return Ok(ValidationResult {
                valid: false,
                compilable: false,
                errors: vec![ValidationIssue {
                    severity: "error".to_string(),
                    message: e,
                    node_id: None,
                    node_type: None,
                }],
                warnings: vec![],
            });
        }
    };
    
    // Step 5: Test compilation if validation passed
    if validation_result.valid {
        match test_compile_dsl(&dsl) {
            Ok(compilable) => {
                validation_result.compilable = compilable;
                if !compilable {
                    validation_result.errors.push(ValidationIssue {
                        severity: "error".to_string(),
                        message: "Workflow failed compilation test".to_string(),
                        node_id: None,
                        node_type: None,
                    });
                    validation_result.valid = false;
                }
            }
            Err(e) => {
                validation_result.errors.push(ValidationIssue {
                    severity: "error".to_string(),
                    message: format!("Compilation error: {}", e),
                    node_id: None,
                    node_type: None,
                });
                validation_result.valid = false;
                validation_result.compilable = false;
            }
        }
    }
    
    println!("✅ Validation complete: valid={}, compilable={}, errors={}, warnings={}",
        validation_result.valid, validation_result.compilable,
        validation_result.errors.len(), validation_result.warnings.len());
    
    Ok(validation_result)
}

fn get_api_key_from_env(provider: &str) -> Option<String> {
    match provider {
        "openai" => std::env::var("OPENAI_API_KEY").ok(),
        "anthropic" => std::env::var("ANTHROPIC_API_KEY").ok(),
        _ => None,
    }
}

#[cfg(test)]
mod planner_contract_tests {
    use super::*;
    use serde_json::json;

    fn mk_step(id: &str, node_type: &str, label: &str) -> AIPlanStep {
        AIPlanStep {
            id: Some(id.to_string()),
            node_type: node_type.to_string(),
            label: label.to_string(),
            description: format!("{} description", label),
            config: json!({}),
            reasoning: None,
            outputs: None,
            connections: None,
        }
    }

    #[test]
    fn references_reject_label_based_routes() {
        let mut start = mk_step("node-1", "trigger.manual", "Start");
        start.outputs = Some(PlanStepOutputs {
            success: Some("Next".to_string()),
            error: Some("END".to_string()),
        });
        let next = mk_step("node-2", "logging.log", "Next");
        let plan = vec![start, next];

        let result = validate_plan_references(&plan);
        assert!(result.is_err());

        let err = result.err().unwrap_or_default();
        assert!(err.contains("uses label 'Next'"));
    }

    #[test]
    fn references_reject_unknown_ids() {
        let mut start = mk_step("node-1", "trigger.manual", "Start");
        start.outputs = Some(PlanStepOutputs {
            success: Some("node-999".to_string()),
            error: Some("END".to_string()),
        });
        let next = mk_step("node-2", "logging.log", "Next");
        let plan = vec![start, next];

        let result = validate_plan_references(&plan);
        assert!(result.is_err());

        let err = result.err().unwrap_or_default();
        assert!(err.contains("unknown step id 'node-999'"));
    }

    #[test]
    fn plan_to_dsl_keeps_canonical_outputs_and_connections() {
        let mut trigger = mk_step("trigger-1", "trigger.manual", "Start");
        trigger.outputs = Some(PlanStepOutputs {
            success: Some("agent-1".to_string()),
            error: Some("END".to_string()),
        });

        let model = mk_step("model-1", "ai.model", "Model");

        let mut agent = mk_step("agent-1", "ai.agent", "Agent");
        agent.outputs = Some(PlanStepOutputs {
            success: Some("END".to_string()),
            error: Some("END".to_string()),
        });
        agent.connections = Some(PlanStepConnections {
            model: Some("model-1".to_string()),
            tools: None,
            memory: None,
            embeddings: None,
            connection: None,
        });

        let plan = vec![trigger, model, agent];

        let refs_ok = validate_plan_references(&plan);
        assert!(refs_ok.is_ok(), "expected valid refs, got {:?}", refs_ok.err());

        let dsl = plan_to_dsl("test-goal", &plan);
        let nodes = dsl["nodes"].as_array().cloned().unwrap_or_default();

        let trigger_node = nodes
            .iter()
            .find(|n| n["id"].as_str() == Some("trigger-1"))
            .cloned()
            .expect("trigger node missing");
        assert_eq!(trigger_node["outputs"]["success"].as_str(), Some("agent-1"));
        assert_eq!(trigger_node["outputs"]["error"].as_str(), Some("END"));

        let agent_node = nodes
            .iter()
            .find(|n| n["id"].as_str() == Some("agent-1"))
            .cloned()
            .expect("agent node missing");
        assert_eq!(agent_node["connections"]["model"].as_str(), Some("model-1"));

        assert_eq!(dsl["start_node"].as_str(), Some("trigger-1"));
    }

    #[test]
    fn base_prompt_excludes_legacy_label_expressions() {
        let legacy_snippets = [
            "${Company Assistant.output}",
            "${List PDFs.files}",
            "${Extract Text.text}",
            "${Read Document.content}",
            "${Detect PII.entities}",
            "${Redact Sensitive Data.redacted_text}",
            "${Detect PII.count}",
        ];

        for snippet in legacy_snippets {
            assert!(
                !AI_PLANNER_BASE_PROMPT.contains(snippet),
                "legacy expression still present in prompt: {}",
                snippet
            );
        }

        assert!(
            AI_PLANNER_BASE_PROMPT.contains("${node:agent-1|output}"),
            "expected canonical node expression example in prompt"
        );
    }

    #[test]
    fn node_type_alias_maps_excel_save_as_csv() {
        let valid = vec![
            "excel.csv_write".to_string(),
            "excel.csv_read".to_string(),
        ];
        let resolved = resolve_node_type("excel.save_as_csv", &valid);
        assert_eq!(resolved.as_deref(), Some("excel.csv_write"));
    }

    #[test]
    fn node_type_alias_strips_node_prefix() {
        let valid = vec!["api.http_request".to_string()];
        let resolved = resolve_node_type("node.api.http_request", &valid);
        assert_eq!(resolved.as_deref(), Some("api.http_request"));
    }
}

// ============================================================
// Connections Commands (LLM Credentials Management)
// ============================================================

fn get_connections_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".skuldbot").join("connections.json")
}

const ENCRYPTED_CONNECTIONS_MAGIC: &[u8] = b"SB_CONN_V1\0";

fn encrypt_connections_payload(plaintext_json: &str) -> Vec<u8> {
    let storage = protection::SecureStorage::new();
    let encrypted = storage.encrypt(plaintext_json.as_bytes());
    let mut payload = Vec::with_capacity(ENCRYPTED_CONNECTIONS_MAGIC.len() + encrypted.len());
    payload.extend_from_slice(ENCRYPTED_CONNECTIONS_MAGIC);
    payload.extend_from_slice(&encrypted);
    payload
}

fn decode_connections_payload(raw: &[u8]) -> Result<(String, bool), String> {
    if raw.starts_with(ENCRYPTED_CONNECTIONS_MAGIC) {
        let storage = protection::SecureStorage::new();
        let decrypted = storage.decrypt(&raw[ENCRYPTED_CONNECTIONS_MAGIC.len()..]);
        let text = String::from_utf8(decrypted)
            .map_err(|e| format!("Failed to decode decrypted connections JSON: {}", e))?;
        return Ok((text, true));
    }

    let text = String::from_utf8(raw.to_vec())
        .map_err(|e| format!("Connections file is not valid UTF-8: {}", e))?;
    Ok((text, false))
}

#[tauri::command]
async fn save_connections(connections_json: String) -> Result<bool, String> {
    println!("💾 Saving LLM connections...");

    let connections_path = get_connections_path();

    // Create directory if it doesn't exist
    if let Some(parent) = connections_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Ensure this is valid JSON before writing encrypted payload.
    serde_json::from_str::<serde_json::Value>(&connections_json)
        .map_err(|e| format!("Invalid connections JSON: {}", e))?;

    let payload = encrypt_connections_payload(&connections_json);
    fs::write(&connections_path, payload)
        .map_err(|e| format!("Failed to save connections: {}", e))?;

    println!("✅ Connections saved to: {}", connections_path.display());
    Ok(true)
}

#[tauri::command]
async fn load_connections() -> Result<String, String> {
    println!("📂 Loading LLM connections...");

    let connections_path = get_connections_path();

    if !connections_path.exists() {
        println!("ℹ️  No connections file found");
        return Ok("[]".to_string());
    }

    let raw = fs::read(&connections_path)
        .map_err(|e| format!("Failed to read connections: {}", e))?;
    let (content, is_encrypted) = decode_connections_payload(&raw)?;
    let normalized_content = if content.trim().is_empty() {
        "[]".to_string()
    } else {
        content
    };

    // Validate JSON before returning it to frontend.
    serde_json::from_str::<serde_json::Value>(&normalized_content)
        .map_err(|e| format!("Stored connections are not valid JSON: {}", e))?;

    // One-time migration of legacy plaintext files to encrypted storage.
    if !is_encrypted {
        let encrypted = encrypt_connections_payload(&normalized_content);
        if let Err(e) = fs::write(&connections_path, encrypted) {
            println!("⚠️  Failed to migrate plaintext connections to encrypted format: {}", e);
        } else {
            println!("🔐 Migrated legacy plaintext connections to encrypted format");
        }
    }

    println!("✅ Loaded connections from: {}", connections_path.display());
    Ok(normalized_content)
}

#[tauri::command]
async fn test_llm_connection(
    provider: String,
    api_key: String,
    base_url: Option<String>,
) -> Result<serde_json::Value, String> {
    println!("🔌 Testing {} connection...", provider);

    let client = reqwest::Client::new();

    match provider.as_str() {
        "openai" | "local" => {
            let url = base_url
                .map(|u| format!("{}/models", u.trim_end_matches('/')))
                .unwrap_or_else(|| "https://api.openai.com/v1/models".to_string());

            let response = client
                .get(&url)
                .header("Authorization", format!("Bearer {}", api_key))
                .send()
                .await
                .map_err(|e| format!("Connection failed: {}", e))?;

            if response.status().is_success() {
                println!("✅ Connection successful!");
                Ok(serde_json::json!({
                    "success": true,
                    "message": "Connection successful! API key is valid."
                }))
            } else {
                let status = response.status();
                let error_text = response.text().await.unwrap_or_default();
                println!("❌ Connection failed: {} - {}", status, error_text);
                Ok(serde_json::json!({
                    "success": false,
                    "message": format!("Authentication failed ({}). Please check your API key.", status.as_u16())
                }))
            }
        }
        "anthropic" => {
            // Anthropic uses a different endpoint for validation
            let response = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
                .json(&serde_json::json!({
                    "model": "claude-3-haiku-20240307",
                    "max_tokens": 1,
                    "messages": [{"role": "user", "content": "Hi"}]
                }))
                .send()
                .await
                .map_err(|e| format!("Connection failed: {}", e))?;

            if response.status().is_success() {
                println!("✅ Anthropic connection successful!");
                Ok(serde_json::json!({
                    "success": true,
                    "message": "Connection successful! API key is valid."
                }))
            } else {
                let status = response.status();
                let error_text = response.text().await.unwrap_or_default();
                println!("❌ Anthropic connection failed: {} - {}", status, error_text);
                Ok(serde_json::json!({
                    "success": false,
                    "message": format!("Authentication failed ({}). Please check your API key.", status.as_u16())
                }))
            }
        }
        _ => Ok(serde_json::json!({
            "success": false,
            "message": format!("Unknown provider: {}", provider)
        })),
    }
}

/// Test MS365 connection using OAuth2 client credentials flow
#[tauri::command]
async fn test_ms365_connection(
    tenant_id: String,
    client_id: String,
    client_secret: String,
) -> Result<serde_json::Value, String> {
    println!("🔌 Testing MS365 connection for tenant {}...", tenant_id);

    let client = reqwest::Client::new();

    // Get OAuth2 token using client credentials flow
    let token_url = format!(
        "https://login.microsoftonline.com/{}/oauth2/v2.0/token",
        tenant_id
    );

    let params = [
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("scope", "https://graph.microsoft.com/.default"),
        ("grant_type", "client_credentials"),
    ];

    let token_response = client
        .post(&token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    if !token_response.status().is_success() {
        let status = token_response.status();
        let error_text = token_response.text().await.unwrap_or_default();
        println!("❌ MS365 auth failed: {} - {}", status, error_text);

        // Parse error for better message
        let error_msg = if error_text.contains("invalid_client") {
            "Invalid Client ID or Client Secret. Please verify your Azure AD app credentials."
        } else if error_text.contains("invalid_tenant") || error_text.contains("AADSTS90002") {
            "Invalid Tenant ID. Please verify your Azure AD tenant."
        } else if error_text.contains("unauthorized_client") {
            "Client not authorized. Please ensure the app has required permissions in Azure AD."
        } else {
            "Authentication failed. Please check your credentials."
        };

        return Ok(serde_json::json!({
            "success": false,
            "message": error_msg,
            "details": error_text
        }));
    }

    // Parse token response
    let token_data: serde_json::Value = token_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    let access_token = token_data["access_token"]
        .as_str()
        .ok_or("No access token in response")?;

    // Test the token by calling Graph API
    let graph_response = client
        .get("https://graph.microsoft.com/v1.0/organization")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Graph API call failed: {}", e))?;

    if graph_response.status().is_success() {
        let org_data: serde_json::Value = graph_response
            .json()
            .await
            .unwrap_or(serde_json::json!({}));

        let org_name = org_data["value"][0]["displayName"]
            .as_str()
            .unwrap_or("Unknown");

        println!("✅ MS365 connection successful! Organization: {}", org_name);

        Ok(serde_json::json!({
            "success": true,
            "message": format!("Connection successful! Connected to: {}", org_name),
            "organization": org_name
        }))
    } else {
        let status = graph_response.status();
        let error_text = graph_response.text().await.unwrap_or_default();
        println!("❌ Graph API failed: {} - {}", status, error_text);

        Ok(serde_json::json!({
            "success": false,
            "message": "Token obtained but Graph API access failed. Please verify app permissions.",
            "details": error_text
        }))
    }
}

async fn call_openai_api(
    prompt: &str,
    system_prompt: &str,
    model: &str,
    temperature: f64,
    base_url: Option<&str>,
    api_key: &str,
    request_timeout_secs: Option<u64>,
) -> Result<String, String> {
    let is_local_endpoint = base_url
        .map(|url| {
            let lower = url.to_lowercase();
            lower.contains("localhost")
                || lower.contains("127.0.0.1")
                || lower.contains("0.0.0.0")
                || lower.contains(".local")
        })
        .unwrap_or(false);
    let timeout_secs = request_timeout_secs
        .unwrap_or(if is_local_endpoint { 600 } else { 180 })
        .clamp(15, 3600);

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    // Construct URL based on whether it's a custom base_url or OpenAI
    let url = match base_url {
        Some(custom_url) => {
            // For Ollama and other OpenAI-compatible APIs, use /v1/chat/completions
            let trimmed = custom_url.trim_end_matches('/');
            if trimmed.ends_with("/v1") {
                format!("{}/chat/completions", trimmed)
            } else {
                format!("{}/v1/chat/completions", trimmed)
            }
        }
        None => "https://api.openai.com/v1/chat/completions".to_string(),
    };

    println!("   Calling LLM API: {}", url);

    let request = OpenAIRequest {
        model: model.to_string(),
        messages: vec![
            OpenAIMessage {
                role: "system".to_string(),
                content: system_prompt.to_string(),
            },
            OpenAIMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            },
        ],
        temperature,
        max_tokens: Some(4000),
    };

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to call OpenAI API: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI API error ({}): {}", status, error_text));
    }

    let openai_response: OpenAIResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

    openai_response
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| "No response from OpenAI".to_string())
}

async fn call_anthropic_api(
    prompt: &str,
    system_prompt: &str,
    model: &str,
    api_key: &str,
    request_timeout_secs: Option<u64>,
) -> Result<String, String> {
    let timeout_secs = request_timeout_secs.unwrap_or(180).clamp(15, 3600);
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let request = AnthropicRequest {
        model: model.to_string(),
        messages: vec![AnthropicMessage {
            role: "user".to_string(),
            content: prompt.to_string(),
        }],
        max_tokens: 4000,
        system: Some(system_prompt.to_string()),
    };

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to call Anthropic API: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Anthropic API error ({}): {}", status, error_text));
    }

    let anthropic_response: AnthropicResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Anthropic response: {}", e))?;

    anthropic_response
        .content
        .first()
        .map(|c| c.text.clone())
        .ok_or_else(|| "No response from Anthropic".to_string())
}

/// Extract JSON from LLM response, handling markdown code blocks and extra text
fn extract_json_from_response(response: &str) -> String {
    let response = response.trim();
    
    // Remove markdown code blocks
    let mut cleaned = response
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    
    // Find JSON object boundaries
    if let Some(start) = cleaned.find('{') {
        if let Some(end) = cleaned.rfind('}') {
            cleaned = &cleaned[start..=end];
        }
    }
    
    cleaned.to_string()
}

fn parse_plan_from_response(response: &str) -> Result<Vec<AIPlanStep>, String> {
    // Try to extract JSON from the response
    let json_str = if response.contains('[') {
        // Find the JSON array in the response
        let start = response.find('[').unwrap_or(0);
        let end = response.rfind(']').map(|i| i + 1).unwrap_or(response.len());
        &response[start..end]
    } else {
        response
    };

    serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse LLM response as JSON: {}. Response: {}", e, json_str))
}

fn parse_step_outputs(step_json: &serde_json::Value) -> Option<PlanStepOutputs> {
    step_json
        .get("outputs")
        .and_then(|v| serde_json::from_value::<PlanStepOutputs>(v.clone()).ok())
}

fn parse_step_connections(step_json: &serde_json::Value) -> Option<PlanStepConnections> {
    step_json
        .get("connections")
        .and_then(|v| serde_json::from_value::<PlanStepConnections>(v.clone()).ok())
}

fn parse_ai_plan_step(step_json: &serde_json::Value, idx: usize) -> Option<AIPlanStep> {
    Some(AIPlanStep {
        id: step_json
            .get("id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| Some(format!("node-{}", idx))),
        node_type: step_json.get("nodeType")?.as_str()?.to_string(),
        label: step_json.get("label")?.as_str()?.to_string(),
        description: step_json.get("description")?.as_str()?.to_string(),
        config: step_json
            .get("config")
            .cloned()
            .unwrap_or_else(|| serde_json::json!({})),
        reasoning: step_json
            .get("reasoning")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        outputs: parse_step_outputs(step_json),
        connections: parse_step_connections(step_json),
    })
}

fn normalize_plan_step_ids(tasks: Vec<AIPlanStep>) -> Vec<AIPlanStep> {
    tasks
        .into_iter()
        .enumerate()
        .map(|(idx, mut step)| {
            let needs_id = step
                .id
                .as_ref()
                .map(|v| v.trim().is_empty())
                .unwrap_or(true);
            if needs_id {
                step.id = Some(format!("node-{}", idx));
            }
            step
        })
        .collect()
}

#[tauri::command]
async fn ai_generate_plan(
    description: String,
    provider: String,
    model: String,
    temperature: f64,
    base_url: Option<String>,
    api_key: Option<String>,
) -> Result<AIPlanResponse, String> {
    println!("🤖 AI Generating plan for: {}", description);
    println!("   Provider: {}, Model: {}", provider, model);

    // Get API key from parameter or fall back to environment
    let api_key = match api_key.filter(|k| !k.is_empty()) {
        Some(key) => key,
        None => match get_api_key_from_env(&provider) {
            Some(key) => key,
            None => {
                println!("❌ No API key found for provider {}", provider);
                return Ok(AIPlanResponse {
                    success: false,
                    plan: None,
                    error: Some(format!(
                        "No API key configured for provider '{}'. Configure a valid LLM connection in AI Planner settings.",
                        provider
                    )),
                    clarifying_questions: Some(vec![
                        "Configure a valid API key (or local provider credential) and retry plan generation.".to_string(),
                    ]),
                });
            }
        }
    };

    let prompt = format!(
        "Create an automation plan for the following task:\n\n{}",
        description
    );

    // Build system prompt with dynamic node catalog from Python NodeRegistry
    let system_prompt = match build_ai_planner_prompt() {
        Ok(p) => {
            println!("✅ Loaded dynamic node catalog ({} chars)", p.len());
            p
        },
        Err(e) => {
            println!("⚠️  Failed to load node catalog: {}, using fallback", e);
            AI_PLANNER_BASE_PROMPT.replace("{NODE_CATALOG}", "Use standard RPA nodes for web automation, file handling, email, Excel, API calls, and control flow.")
        }
    };

    let result = match provider.as_str() {
        "openai" | "local" => {
            call_openai_api(
                &prompt,
                &system_prompt,
                &model,
                temperature,
                base_url.as_deref(),
                &api_key,
                None,
            )
            .await
        }
        "anthropic" => {
            call_anthropic_api(&prompt, &system_prompt, &model, &api_key, None).await
        }
        _ => Err(format!("Unsupported provider: {}", provider)),
    };

    match result {
        Ok(response) => {
            println!("📝 LLM Response received ({} chars)", response.len());
            match parse_plan_from_response(&response) {
                Ok(mut plan) => {
                    if let Err(e) = normalize_plan_node_types(&mut plan) {
                        println!("⚠️  Node type normalization failed: {}", e);
                    }
                    // Validate that all node types exist in the catalog
                    if let Err(validation_error) = validate_plan_node_types(&plan) {
                        println!("❌ Plan validation failed: {}", validation_error);
                        return Ok(AIPlanResponse {
                            success: false,
                            plan: None,
                            error: Some(validation_error),
                            clarifying_questions: None,
                        });
                    }

                    println!("✅ Parsed and validated {} steps from LLM response", plan.len());
                    Ok(AIPlanResponse {
                        success: true,
                        plan: Some(plan),
                        error: None,
                        clarifying_questions: None,
                    })
                }
                Err(e) => {
                    println!("❌ Failed to parse LLM response: {}", e);
                    Ok(AIPlanResponse {
                        success: false,
                        plan: None,
                        error: Some(e),
                        clarifying_questions: None,
                    })
                }
            }
        }
        Err(e) => {
            println!("❌ LLM API call failed: {}", e);
            Ok(AIPlanResponse {
                success: false,
                plan: None,
                error: Some(e),
                clarifying_questions: None,
            })
        }
    }
}

#[tauri::command]
async fn ai_refine_plan(
    current_plan: String,
    user_request: String,
    conversation_history: String,
    provider: String,
    model: String,
    temperature: f64,
    base_url: Option<String>,
    api_key: Option<String>,
) -> Result<AIPlanResponse, String> {
    println!("🤖 AI Refining plan based on: {}", user_request);

    // Parse current plan
    let plan: Vec<AIPlanStep> = serde_json::from_str(&current_plan)
        .map_err(|e| format!("Failed to parse current plan: {}", e))?;

    // Get API key from parameter or fall back to environment
    let api_key = match api_key.filter(|k| !k.is_empty()) {
        Some(key) => key,
        None => match get_api_key_from_env(&provider) {
            Some(key) => key,
            None => {
                // Return same plan if no API key
                println!("⚠️  No API key found for {}, returning original plan", provider);
                return Ok(AIPlanResponse {
                    success: true,
                    plan: Some(plan),
                    error: None,
                    clarifying_questions: Some(vec![
                        "Note: Configure an LLM connection in Settings for AI refinement.".to_string()
                    ]),
                });
            }
        }
    };

    let refinement_prompt = format!(
        r#"You are refining an existing automation plan.

CURRENT PLAN:
{}

USER REQUEST:
{}

CONVERSATION HISTORY:
{}

Please modify the plan according to the user's request. Return ONLY the updated JSON array of steps.
Follow the same canonical format as the original plan including id, nodeType, label, description, config, outputs, connections, and reasoning.
All references in outputs/connections MUST use step IDs only (never labels)."#,
        current_plan, user_request, conversation_history
    );

    // Build system prompt with dynamic node catalog
    let system_prompt = match build_ai_planner_prompt() {
        Ok(p) => p,
        Err(e) => {
            println!("⚠️  Failed to load node catalog: {}, using fallback", e);
            AI_PLANNER_BASE_PROMPT.replace("{NODE_CATALOG}", "Use standard RPA nodes.")
        }
    };

    let result = match provider.as_str() {
        "openai" | "local" => {
            call_openai_api(
                &refinement_prompt,
                &system_prompt,
                &model,
                temperature,
                base_url.as_deref(),
                &api_key,
                None,
            )
            .await
        }
        "anthropic" => {
            call_anthropic_api(&refinement_prompt, &system_prompt, &model, &api_key, None).await
        }
        _ => Err(format!("Unsupported provider: {}", provider)),
    };

    match result {
        Ok(response) => {
            match parse_plan_from_response(&response) {
                Ok(refined_plan) => {
                    let mut refined_plan = normalize_plan_step_ids(refined_plan);
                    if let Err(e) = normalize_plan_node_types(&mut refined_plan) {
                        println!("⚠️  Node type normalization failed: {}", e);
                    }

                    // Validate that all node types exist in the catalog
                    if let Err(validation_error) = validate_plan_node_types(&refined_plan) {
                        println!("❌ Refined plan validation failed: {}", validation_error);
                        return Ok(AIPlanResponse {
                            success: false,
                            plan: Some(plan), // Return original plan
                            error: Some(validation_error),
                            clarifying_questions: None,
                        });
                    }

                    // Validate strict ID references
                    if let Err(validation_error) = validate_plan_references(&refined_plan) {
                        println!("❌ Refined plan reference validation failed: {}", validation_error);
                        return Ok(AIPlanResponse {
                            success: false,
                            plan: Some(plan), // Return original plan
                            error: Some(validation_error),
                            clarifying_questions: None,
                        });
                    }

                    println!("✅ Refined and validated plan has {} steps", refined_plan.len());
                    Ok(AIPlanResponse {
                        success: true,
                        plan: Some(refined_plan),
                        error: None,
                        clarifying_questions: None,
                    })
                }
                Err(e) => {
                    // If parsing fails, return original plan with error
                    Ok(AIPlanResponse {
                        success: false,
                        plan: Some(plan),
                        error: Some(format!("Failed to parse refined plan: {}", e)),
                        clarifying_questions: None,
                    })
                }
            }
        }
        Err(e) => {
            // On API error, return original plan with error
            Ok(AIPlanResponse {
                success: false,
                plan: Some(plan),
                error: Some(e),
                clarifying_questions: None,
            })
        }
    }
}

// ============================================================
// AI Planner V2 - Executable Plan Generation
// ============================================================

#[tauri::command]
async fn ai_generate_executable_plan(
    description: String,
    provider: String,
    model: String,
    temperature: f64,
    base_url: Option<String>,
    api_key: Option<String>,
    agent_mode: Option<String>, // "ask", "plan", "generate", or "refine"
    conversation_history: Option<String>, // Previous messages for context
    request_timeout_secs: Option<u64>, // Per-request timeout from UI settings
) -> Result<ExecutablePlanResponse, String> {
    println!("🤖 AI Generating EXECUTABLE plan for: {}", description);
    println!("   Provider: {}, Model: {}", provider, model);
    if let Some(ref url) = base_url {
        println!("   Base URL: {}", url);
    }

    // Determine agent mode (like Cursor: ask → plan → generate)
    let mode = agent_mode.as_deref().unwrap_or("generate");
    println!("   🎯 Agent Mode: {} (received: {:?})", mode, agent_mode);

    // Get API key from parameter or fall back to environment
    // For local/self-hosted (Ollama, vLLM, etc.), API key is optional
    let is_local = base_url.as_ref().map(|url| {
        url.contains("localhost") || url.contains("127.0.0.1") || url.contains("0.0.0.0")
    }).unwrap_or(false);

    let api_key = if is_local {
        // Local models don't require API key
        println!("   Local model detected, API key not required");
        api_key.filter(|k| !k.is_empty()).unwrap_or_else(|| "dummy-key-for-local".to_string())
    } else {
        // Cloud providers require API key
        match api_key.filter(|k| !k.is_empty()) {
            Some(key) => key,
            None => match get_api_key_from_env(&provider) {
                Some(key) => key,
                None => {
                    return Ok(ExecutablePlanResponse {
                        success: false,
                        confidence: 0.0,
                        plan: None,
                        error: Some("No API key configured. Please add LLM connection in Settings.".to_string()),
                        clarifying_questions: None,
                        suggestions: vec![],
                        proposed_steps: None,
                        agent_mode: Some(mode.to_string()),
                    });
                }
            }
        }
    };

    // Add conversation history if provided
    let history_context = if let Some(ref history) = conversation_history {
        format!("\n\nCONVERSATION HISTORY:\n{}\n", history)
    } else {
        String::new()
    };

    // Build prompt based on agent mode
    let prompt = match mode {
        "ask" => {
            // ASK MODE: Pure conversation - LLM decides everything
            format!(
                r#"You are SkuldBot's AI assistant for RPA automation.

USER: {}{}

RESPOND NATURALLY in the user's language.
- If greeting → greet back warmly
- If question → answer helpfully  
- If automation request → ask what you need to know
- If unclear → ask for clarification

Just respond as a helpful assistant. No JSON needed."#,
                description,
                history_context
            )
        },
        "plan" => {
            // PLAN MODE: Conversational + propose approach when ready
            format!(
                r#"You are SkuldBot's AI architect. Respond in the SAME LANGUAGE as the user.

USER REQUEST:
{}{}

If enough context: Propose 5-7 high-level steps (plain language, not technical).
If missing info: Ask 1-2 key questions.

RESPONSE (JSON only):
{{
  "goal": "1-sentence goal",
  "confidence": 0.5-0.8,
  "assumptions": ["Assumption 1", "Assumption 2"],
  "proposedSteps": [
    "Step 1: ...",
    "Step 2: ..."
  ],
  "unknowns": [],
  "tasks": []
}}

Return ONLY JSON in user's language."#,
                description,
                history_context
            )
        },
        _ => {
            // GENERATE MODE: Create executable workflow (default)
            format!(
                r#"You are SkuldBot's AI automation architect. Respond in the SAME LANGUAGE as the user.

USER REQUEST:
{}{}

FIRST: ANALYZE THE REQUEST TYPE
- If this is a GREETING (hello, hi, hola, etc.) or GENERAL QUESTION: Respond conversationally, ask what they want to automate
- If this is an AUTOMATION REQUEST: Generate a workflow

FOR GREETINGS/QUESTIONS (no workflow needed):
{{
  "goal": "Conversation",
  "confidence": 1.0,
  "assumptions": [],
  "unknowns": [{{"question": "Your conversational response here", "blocking": false}}],
  "tasks": []
}}

FOR AUTOMATION REQUESTS:
Generate a PRODUCTION-READY workflow.

CRITICAL NODE TYPE RULES:
- Use EXACT types from catalog: "category.action" format
- NO invented types! Check catalog carefully.

CORRECT NODE TYPES (verified from SkuldBot catalog):
✅ Triggers: "trigger.manual", "trigger.schedule", "trigger.webhook", "trigger.form"
✅ API: "api.http_request", "api.rest_get", "api.rest_post", "api.parse_json", "api.graphql"
✅ Control: "control.if", "control.loop", "control.switch", "control.try_catch", "control.wait"
✅ Files: "files.read", "files.write", "files.list", "files.copy", "files.delete"
✅ Web: "web.open_browser", "web.navigate", "web.click", "web.type", "web.get_text"
✅ AI: "ai.model", "ai.agent", "ai.embeddings", "ai.llm_prompt", "ai.extract_data"
✅ Database: "database.connect", "database.query", "database.insert", "database.update"
✅ Excel: "excel.open", "excel.read_range", "excel.write_range", "excel.filter", "excel.csv_read", "excel.csv_write", "excel.save", "excel.close"
✅ Logging: "logging.log", "logging.audit", "logging.notification"

WRONG NODE TYPES (DO NOT USE - these don't exist!):
❌ "http.request" → Use "api.http_request"
❌ "json.parse" → Use "api.parse_json"  
❌ "condition.if" → Use "control.if"
❌ "condition.*" → Use "control.*"
❌ "data.transform" → Does NOT exist
❌ "data.filter" → Does NOT exist (use "excel.filter" for Excel)
❌ "node.*" prefix → Never use "node." prefix
❌ "error.handler" → Use "control.try_catch"

EXPRESSION RULES:
- Node data references in config MUST use canonical syntax: "${{node:<step-id>|<path>}}"
- Env/config placeholders can use "${{VARIABLE_NAME}}"
- NEVER use label-style refs like "${{My Node.output}}"

RESPONSE FORMAT:
{{
  "goal": "Clear description in user's language",
  "assumptions": ["Assumption 1"],
  "unknowns": [
    {{"question": "Clarifying question?", "blocking": true, "context": "Why needed"}}
  ],
  "confidence": 0.85,
  "tasks": [
    {{
      "id": "node-0",
      "nodeType": "trigger.manual",
      "label": "Start",
      "description": "...",
      "config": {{
        "input": "${{node:node-input|output}}"
      }},
      "outputs": {{
        "success": "node-1",
        "error": "END"
      }},
      "connections": {{
        "model": "node-model",
        "tools": ["node-tool-1"],
        "memory": "node-memory",
        "embeddings": "node-emb",
        "connection": "node-connection"
      }},
      "reasoning": "..."
    }}
  ]
}}

Return ONLY valid JSON. Use user's language for all text."#,
                description,
                history_context
            )
        }
    };

    // Build system prompt - ONLY load node catalog for GENERATE mode
    // ASK and PLAN modes don't need it (conversation only)
    let system_prompt = if mode == "generate" {
        // GENERATE mode: Need full node catalog for validation
        match build_ai_planner_prompt() {
            Ok(p) => {
                println!("✅ Loaded dynamic node catalog (GENERATE mode)");
                p
            },
            Err(e) => {
                println!("⚠️  Failed to load node catalog: {}, using fallback", e);
                return Ok(ExecutablePlanResponse {
                    success: false,
                    confidence: 0.0,
                    plan: None,
                    error: Some(format!("Failed to load node catalog: {}", e)),
                    clarifying_questions: None,
                    suggestions: vec![],
                    proposed_steps: None,
                    agent_mode: Some(mode.to_string()),
                });
            }
        }
    } else {
        // ASK/PLAN mode: Lightweight prompt, no catalog needed
        println!("💬 Using lightweight prompt (ASK/PLAN mode - no catalog)");
        "You are SkuldBot's AI assistant for RPA automation. Help users plan their automations.".to_string()
    };
    
    // Only load MCP context for GENERATE mode (adds overhead)
    let enhanced_system_prompt = if mode == "generate" {
        // Initialize MCP Client for enhanced context (optional)
        let mcp_client = mcp::client::MCPClient::new();
        let mcp_context = mcp_client.get_context_for_planner().await;
        
        // Combine system prompt with MCP context
        if !mcp_context.is_empty() {
            let tools_result = mcp_client.list_tools().await;
            let resources_result = mcp_client.list_resources().await;
            let tools_count = tools_result.as_ref().map(|t| t.len()).unwrap_or(0);
            let resources_count = resources_result.as_ref().map(|r| r.len()).unwrap_or(0);
            
            println!("✅ MCP Context added ({} tools, {} resources)", 
                tools_count,
                resources_count
            );
            format!("{}\n\n{}\n\n{}", 
                system_prompt,
                "## MCP CAPABILITIES\n\nYou have access to Model Context Protocol tools and resources that provide additional capabilities and context:",
                mcp_context
            )
        } else {
            println!("⚠️  No MCP servers configured (Studio running standalone)");
            system_prompt
        }
    } else {
        // ASK/PLAN mode: Skip MCP entirely for speed
        system_prompt
    };

    // Call LLM
    let result = match provider.as_str() {
        "openai" | "local" => {
            call_openai_api(
                &prompt,
                &enhanced_system_prompt,
                &model,
                temperature,
                base_url.as_deref(),
                &api_key,
                request_timeout_secs,
            )
            .await
        }
        "anthropic" => {
            call_anthropic_api(&prompt, &enhanced_system_prompt, &model, &api_key, request_timeout_secs).await
        }
        _ => Err(format!("Unsupported provider: {}", provider)),
    };

    match result {
        Ok(response) => {
            println!("📝 LLM Response received ({} chars)", response.len());
            
            // In ASK mode, check if response is plain text (greeting/chat)
            if mode == "ask" {
                let trimmed = response.trim();
                // If response doesn't look like JSON, treat as conversational response
                if !trimmed.starts_with('{') && !trimmed.contains("```json") {
                    println!("💬 Plain text response detected in ASK mode (greeting/chat)");
                    return Ok(ExecutablePlanResponse {
                        success: true,
                        confidence: 1.0,
                        plan: None,
                        error: None,
                        clarifying_questions: Some(vec![response.clone()]), // Use this field for chat response
                        suggestions: vec![],
                        proposed_steps: None,
                        agent_mode: Some("ask".to_string()),
                    });
                }
            }
            
            // Clean response: extract JSON from markdown or text
            let cleaned_response = extract_json_from_response(&response);
            println!("🧹 Cleaned response ({} chars)", cleaned_response.len());
            
            // Try to parse as ExecutablePlan format first
            let parsed_response: Result<serde_json::Value, _> = 
                serde_json::from_str(&cleaned_response);
            
            match parsed_response {
                Ok(json) => {
                    // Extract fields from JSON
                    let goal = json["goal"].as_str().unwrap_or(&description).to_string();
                    let plan_description = json["description"]
                        .as_str()
                        .unwrap_or(&goal)
                        .to_string();
                    let confidence = json["confidence"].as_f64().unwrap_or(0.5);
                    
                    let assumptions: Vec<String> = json["assumptions"]
                        .as_array()
                        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                        .unwrap_or_default();
                    
                    let unknowns: Vec<Clarification> = json["unknowns"]
                        .as_array()
                        .map(|arr| {
                            arr.iter().filter_map(|v| {
                                Some(Clarification {
                                    question: v["question"].as_str()?.to_string(),
                                    blocking: v["blocking"].as_bool().unwrap_or(false),
                                    context: v["context"].as_str().map(|s| s.to_string()),
                                })
                            }).collect()
                        })
                        .unwrap_or_default();
                    
                    // Parse tasks
                    let tasks: Vec<AIPlanStep> = json["tasks"]
                        .as_array()
                        .map(|arr| {
                            arr.iter()
                                .enumerate()
                                .filter_map(|(i, v)| parse_ai_plan_step(v, i))
                                .collect()
                        })
                        .unwrap_or_else(|| {
                            // Fallback: try to parse as simple array
                            parse_plan_from_response(&response).unwrap_or_default()
                        });
                    let mut tasks = normalize_plan_step_ids(tasks);
                    if let Err(e) = normalize_plan_node_types(&mut tasks) {
                        println!("⚠️  Node type normalization failed: {}", e);
                    }
                    
                    // In ASK or PLAN mode, empty tasks is OK (we're just asking questions or proposing steps)
                    if tasks.is_empty() && (mode == "ask" || mode == "plan") {
                        println!("✅ {} mode: No tasks generated (as expected)", mode);
                        
                        // Extract proposed steps if in plan mode
                        let proposed_steps: Option<Vec<String>> = json["proposedSteps"]
                            .as_array()
                            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect());
                        
                        // Extract clarifying questions from unknowns
                        let clarifying_questions: Option<Vec<String>> = if unknowns.is_empty() {
                            None
                        } else {
                            Some(unknowns.iter().map(|u| u.question.clone()).collect())
                        };
                        
                        return Ok(ExecutablePlanResponse {
                            success: true,
                            confidence,
                            plan: None, // No plan yet in ask/plan mode
                            error: None,
                            clarifying_questions,
                            suggestions: vec![],
                            proposed_steps,
                            agent_mode: Some(mode.to_string()),
                        });
                    }
                    
                    // In GENERATE mode, empty tasks with unknowns = conversational response (greeting detected)
                    if tasks.is_empty() {
                        // If LLM provided unknowns/questions, it's a conversational response (greeting, need clarification)
                        if !unknowns.is_empty() {
                            println!("💬 GENERATE mode: LLM detected greeting/needs clarification");
                            let clarifying_questions: Vec<String> = unknowns.iter().map(|u| u.question.clone()).collect();
                            return Ok(ExecutablePlanResponse {
                                success: true,
                                confidence,
                                plan: None,
                                error: None,
                                clarifying_questions: Some(clarifying_questions),
                                suggestions: vec![],
                                proposed_steps: None,
                                agent_mode: Some("ask".to_string()), // Treat as ASK mode response
                            });
                        }
                        
                        // No tasks and no questions = error
                        return Ok(ExecutablePlanResponse {
                            success: false,
                            confidence: 0.0,
                            plan: None,
                            error: Some("Could not generate workflow. Please describe what you want to automate.".to_string()),
                            clarifying_questions: None,
                            suggestions: vec!["Try describing a specific automation task".to_string()],
                            proposed_steps: None,
                            agent_mode: Some(mode.to_string()),
                        });
                    }
                    
                    // Validate and compile the plan
                    let validation_result = match validate_and_compile_plan(&goal, &tasks) {
                        Ok(result) => result,
                        Err(e) => {
                            return Ok(ExecutablePlanResponse {
                                success: false,
                                confidence,
                                plan: None,
                                error: Some(format!("Validation failed: {}", e)),
                                clarifying_questions: None,
                                suggestions: vec![],
                                proposed_steps: None,
                                agent_mode: Some(mode.to_string()),
                            });
                        }
                    };
                    
                    // Generate complete DSL
                    let dsl = plan_to_dsl(&goal, &tasks);
                    
                    // Build executable plan
                    let executable_plan = ExecutablePlan {
                        goal: goal.clone(),
                        description: plan_description,
                        assumptions,
                        unknowns: unknowns.clone(),
                        tasks,
                        dsl,
                        validation: validation_result.clone(),
                    };
                    
                    // Determine success based on validation
                    let success = validation_result.valid && validation_result.compilable;
                    
                    // Generate suggestions
                    let mut suggestions = Vec::new();
                    if !validation_result.warnings.is_empty() {
                        suggestions.push("Review warnings before running".to_string());
                    }
                    if validation_result.compilable {
                        suggestions.push("Workflow is ready to test in Studio".to_string());
                    }
                    
                    // Extract clarifying questions from unknowns
                    let clarifying_questions = if !unknowns.is_empty() {
                        Some(unknowns.iter().map(|u| u.question.clone()).collect())
                    } else {
                        None
                    };
                    
                    println!("✅ Generated executable plan: valid={}, compilable={}, confidence={}",
                        validation_result.valid, validation_result.compilable, confidence);
                    
                    Ok(ExecutablePlanResponse {
                        success,
                        confidence,
                        plan: Some(executable_plan),
                        error: if success { None } else { 
                            Some(format!("Validation errors: {}", 
                                validation_result.errors.iter()
                                    .map(|e| &e.message)
                                    .cloned()
                                    .collect::<Vec<_>>()
                                    .join("; ")
                            ))
                        },
                        clarifying_questions,
                        suggestions,
                        proposed_steps: None, // No proposed steps in generate mode
                        agent_mode: Some(mode.to_string()),
                    })
                }
                Err(parse_err) => {
                    // Fallback to old format
                    println!("⚠️  Could not parse as ExecutablePlan, trying old format: {}", parse_err);
                    match parse_plan_from_response(&response) {
                        Ok(tasks) if !tasks.is_empty() => {
                            let mut tasks = normalize_plan_step_ids(tasks);
                            if let Err(e) = normalize_plan_node_types(&mut tasks) {
                                println!("⚠️  Node type normalization failed: {}", e);
                            }
                            let goal = description.clone();
                            let validation_result = validate_and_compile_plan(&goal, &tasks)?;
                            let dsl = plan_to_dsl(&goal, &tasks);
                            
                            let executable_plan = ExecutablePlan {
                                goal: goal.clone(),
                                description: goal.clone(),
                                assumptions: vec![],
                                unknowns: vec![],
                                tasks,
                                dsl,
                                validation: validation_result.clone(),
                            };
                            
                            Ok(ExecutablePlanResponse {
                                success: validation_result.valid && validation_result.compilable,
                                confidence: 0.6,  // Lower confidence for fallback format
                                plan: Some(executable_plan),
                                error: None,
                                clarifying_questions: None,
                                suggestions: vec!["Consider using the enhanced format in future requests".to_string()],
                                proposed_steps: None,
                                agent_mode: Some(mode.to_string()),
                            })
                        }
                        _ => {
                            // In ASK mode, if parsing fails, return the raw response as conversation
                            if mode == "ask" || mode == "plan" {
                                println!("💬 Returning raw response as conversational (ASK/PLAN mode)");
                                return Ok(ExecutablePlanResponse {
                                    success: true,
                                    confidence: 1.0,
                                    plan: None,
                                    error: None,
                                    clarifying_questions: Some(vec![response.clone()]),
                                    suggestions: vec![],
                                    proposed_steps: None,
                                    agent_mode: Some(mode.to_string()),
                                });
                            }
                            
                            Ok(ExecutablePlanResponse {
                                success: false,
                                confidence: 0.0,
                                plan: None,
                                error: Some(format!("Failed to parse LLM response: {}", parse_err)),
                                clarifying_questions: None,
                                suggestions: vec!["Try rephrasing your request".to_string()],
                                proposed_steps: None,
                                agent_mode: Some(mode.to_string()),
                            })
                        }
                    }
                }
            }
        }
        Err(e) => {
            println!("❌ LLM API call failed: {}", e);
            Ok(ExecutablePlanResponse {
                success: false,
                confidence: 0.0,
                plan: None,
                error: Some(e),
                clarifying_questions: None,
                suggestions: vec![],
                proposed_steps: None,
                agent_mode: Some(mode.to_string()),
            })
        }
    }
}

// ============================================================
// License Validation Commands
// ============================================================

#[derive(Debug, Deserialize)]
struct RemoteLicenseValidationResponse {
    valid: bool,
    module: Option<String>,
    #[serde(rename = "expiresAt")]
    expires_at: Option<String>,
    features: Option<Vec<String>>,
    error: Option<String>,
}

fn get_license_validation_url() -> Option<String> {
    if let Ok(explicit_url) = std::env::var("SKULDBOT_LICENSE_VALIDATION_URL") {
        let trimmed = explicit_url.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Ok(orchestrator_url) = std::env::var("SKULDBOT_ORCHESTRATOR_URL") {
        let base = orchestrator_url.trim_end_matches('/');
        if !base.is_empty() {
            return Some(format!("{}/api/licenses/validate", base));
        }
    }

    None
}

async fn validate_license_with_server(license_key: &str) -> Result<Option<LicenseValidationResult>, String> {
    let Some(url) = get_license_validation_url() else {
        return Ok(None);
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| format!("Failed to initialize HTTP client: {}", e))?;

    let response = client
        .post(&url)
        .json(&serde_json::json!({ "licenseKey": license_key }))
        .send()
        .await
        .map_err(|e| format!("License server request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "License server rejected request ({}): {}",
            status.as_u16(),
            body
        ));
    }

    let payload: RemoteLicenseValidationResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse license server response: {}", e))?;

    Ok(Some(LicenseValidationResult {
        valid: payload.valid,
        module: payload.module.unwrap_or_default(),
        expires_at: payload.expires_at.unwrap_or_default(),
        features: payload.features.unwrap_or_default(),
        error: payload.error,
    }))
}

#[tauri::command]
async fn validate_license(license_key: String) -> Result<LicenseValidationResult, String> {
    println!("🔑 Validating license: {}...", &license_key[..8.min(license_key.len())]);

    match validate_license_with_server(&license_key).await {
        Ok(Some(remote_result)) => {
            if remote_result.valid {
                println!("✅ License validated by server (module: {})", remote_result.module);
            } else {
                println!("❌ License rejected by server");
            }
            return Ok(remote_result);
        }
        Ok(None) => {
            println!("ℹ️  No license server configured; using local format validation");
        }
        Err(e) => {
            println!("⚠️  License server validation failed, falling back to local format validation: {}", e);
        }
    }

    let key_upper = license_key.to_uppercase();

    // Check key format and determine module
    // DEV-ALL-ACCESS: Special development key that activates all modules
    let (valid, module, features) = if key_upper == "DEV-ALL-ACCESS" || key_upper == "KHIPUS-DEV-2024" {
        // Development key - returns studio but store will handle activating all modules
        println!("🔓 DEV MODE: All-access key detected");
        (true, "studio", vec![
            "flowEditor", "localExecution", "projectManagement", "170+BaseNodes",
            "aiPlanner", "aiRefinement", "localLLM", "ai.llm_prompt", "ai.extract_data",
            "compliance.protect_pii", "compliance.protect_phi", "compliance.audit_log",
            "dataquality.validate", "dataquality.profile_data", "ai.repair_data"
        ])
    } else if key_upper.starts_with("STUDIO-") {
        (true, "studio", vec!["flowEditor", "localExecution", "projectManagement", "170+BaseNodes"])
    } else if key_upper.starts_with("SKULDAI-") {
        (true, "skuldai", vec!["aiPlanner", "aiRefinement", "localLLM", "ai.llm_prompt", "ai.extract_data"])
    } else if key_upper.starts_with("COMPLY-") {
        (true, "skuldcompliance", vec!["compliance.protect_pii", "compliance.protect_phi", "compliance.audit_log"])
    } else if key_upper.starts_with("DATAQ-") {
        (true, "skulddataquality", vec!["dataquality.validate", "dataquality.profile_data", "ai.repair_data"])
    } else if key_upper.starts_with("DEMO-") {
        // Demo key activates all modules for testing
        (true, "studio", vec!["flowEditor", "localExecution", "projectManagement"])
    } else {
        (false, "", vec![])
    };

    if valid {
        // Set expiration to 1 year from now for demo
        let expires_at = chrono::Utc::now()
            .checked_add_signed(chrono::Duration::days(365))
            .unwrap_or_else(chrono::Utc::now)
            .to_rfc3339();

        println!("✅ License valid for module: {}", module);

        Ok(LicenseValidationResult {
            valid: true,
            module: module.to_string(),
            expires_at,
            features: features.into_iter().map(String::from).collect(),
            error: None,
        })
    } else {
        println!("❌ Invalid license key");

        Ok(LicenseValidationResult {
            valid: false,
            module: String::new(),
            expires_at: String::new(),
            features: vec![],
            error: Some("Invalid license key format".to_string()),
        })
    }
}

// ============================================================
// Utility Commands
// ============================================================

#[tauri::command]
async fn read_directory(path: String) -> Result<Vec<FileInfo>, String> {
    println!("📂 Reading directory: {}", path);

    let dir_path = PathBuf::from(&path);
    if !dir_path.exists() {
        return Err(format!("Directory not found: {}", path));
    }

    let mut files = vec![];

    for entry in fs::read_dir(&dir_path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let metadata = entry.metadata().ok();

        files.push(FileInfo {
            name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            is_dir: path.is_dir(),
            size: metadata.as_ref().map(|m| m.len()),
            modified: metadata.and_then(|m| m.modified().ok())
                .map(|t| DateTime::<Utc>::from(t).to_rfc3339()),
        });
    }

    // Sort: directories first, then by name
    files.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(files)
}

#[tauri::command]
async fn file_exists(path: String) -> Result<bool, String> {
    Ok(PathBuf::from(&path).exists())
}

#[tauri::command]
async fn get_excel_sheets(file_path: String) -> Result<Vec<String>, String> {
    println!("📊 Getting Excel sheets from: {}", file_path);

    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let python_exe = get_python_executable();

    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import json
try:
    import openpyxl
    wb = openpyxl.load_workbook('{}', read_only=True)
    sheets = wb.sheetnames
    wb.close()
    print(json.dumps(sheets))
except ImportError:
    # Try with xlrd for .xls files
    try:
        import xlrd
        wb = xlrd.open_workbook('{}')
        sheets = wb.sheet_names()
        print(json.dumps(sheets))
    except:
        print(json.dumps([]))
except Exception as e:
    print(json.dumps([]))
"#,
            file_path.replace("'", "\\'"),
            file_path.replace("'", "\\'")
        ))
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let sheets: Vec<String> = serde_json::from_str(&stdout)
            .unwrap_or_else(|_| vec![]);
        println!("✅ Found {} sheets", sheets.len());
        Ok(sheets)
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to read Excel: {}", error))
    }
}

// ============================================================
// AI Planner - LLM Connection Management
// ============================================================

use ai_planner::connection_validator;
use ai_planner::types::{LLMConnection, ProviderConfig, TestConnectionResult};
use ai_planner::db::ConnectionsDb;

// Global database instance
static CONNECTIONS_DB: once_cell::sync::OnceCell<Mutex<ConnectionsDb>> = once_cell::sync::OnceCell::new();

fn get_connections_db(app_handle: &tauri::AppHandle) -> Result<&'static Mutex<ConnectionsDb>, String> {
    CONNECTIONS_DB.get_or_try_init(|| {
        let app_dir = app_data_dir(&app_handle.config())
            .ok_or_else(|| "Could not determine app data directory".to_string())?;
        
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
        
        let db_path = app_dir.join("connections.db");
        let db = ConnectionsDb::new(db_path.to_str().unwrap())
            .map_err(|e| format!("Failed to initialize connections database: {}", e))?;
        
        Ok(Mutex::new(db))
    })
}

#[tauri::command]
async fn test_llm_connection_v2(
    config: ProviderConfig
) -> Result<TestConnectionResult, String> {
    println!("🔌 Testing LLM connection...");
    connection_validator::test_connection(config).await
}

// ==================== LLM SECRETS KEYRING FUNCTIONS ====================
// SECURITY: LLM API keys are stored in the OS keyring, NOT in SQLite
// SQLite only stores non-sensitive metadata

const LLM_KEYRING_SERVICE: &str = "skuldbot-studio-llm";

/// Get keyring entry for an LLM secret
fn llm_keyring_entry(secret_key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(LLM_KEYRING_SERVICE, secret_key)
        .map_err(|e| format!("Keyring error: {}", e))
}

/// Save an LLM secret to the OS keyring
fn save_llm_secret(secret_key: &str, secret_value: &str) -> Result<(), String> {
    let entry = llm_keyring_entry(secret_key)?;
    entry
        .set_password(secret_value)
        .map_err(|e| format!("Failed to save LLM secret: {}", e))
}

/// Load an LLM secret from the OS keyring
fn load_llm_secret(secret_key: &str) -> Result<Option<String>, String> {
    let entry = llm_keyring_entry(secret_key)?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to load LLM secret: {}", e)),
    }
}

/// Delete an LLM secret from the OS keyring
fn delete_llm_secret(secret_key: &str) -> Result<(), String> {
    let entry = llm_keyring_entry(secret_key)?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // Already deleted
        Err(e) => Err(format!("Failed to delete LLM secret: {}", e)),
    }
}

#[tauri::command]
async fn save_llm_connection(
    connection: LLMConnection,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    println!("💾 Saving LLM connection: {} (provider: {})", connection.name, connection.provider);
    
    // Step 1: Extract secrets from config and save to keyring
    let secrets = connection.config.extract_secrets(&connection.id);
    for (key, value) in &secrets {
        save_llm_secret(key, value)?;
        println!("  🔐 Secret stored in keyring: {}", key);
    }
    
    // Step 2: Save sanitized connection to SQLite (secrets replaced with placeholders)
    let db = get_connections_db(&app_handle)?;
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    
    db.save_connection(&connection)
        .map_err(|e| format!("Failed to save connection: {}", e))?;
    
    println!("✅ LLM connection saved (secrets in keyring, metadata in SQLite)");
    Ok(())
}

#[tauri::command]
async fn load_llm_connections(
    app_handle: tauri::AppHandle,
) -> Result<Vec<LLMConnection>, String> {
    println!("📂 Loading LLM connections from database...");
    
    let db = get_connections_db(&app_handle)?;
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    
    let mut connections = db.load_all_connections()
        .map_err(|e| format!("Failed to load connections: {}", e))?;
    
    // Restore secrets from keyring for each connection
    for connection in &mut connections {
        let vault_keys = ai_planner::types::ProviderConfig::get_vault_keys(
            &connection.id, 
            &connection.provider
        );
        
        let mut secrets = std::collections::HashMap::new();
        for key in vault_keys {
            if let Ok(Some(value)) = load_llm_secret(&key) {
                secrets.insert(key, value);
            }
        }
        
        if !secrets.is_empty() {
            connection.config.restore_secrets(&connection.id, &secrets);
        }
    }
    
    println!("✅ Loaded {} LLM connections (secrets restored from keyring)", connections.len());
    Ok(connections)
}

#[tauri::command]
async fn delete_llm_connection(
    connection_id: String,
    provider: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    println!("🗑️  Deleting LLM connection: {} (provider: {})", connection_id, provider);
    
    // Step 1: Delete secrets from keyring
    let vault_keys = ai_planner::types::ProviderConfig::get_vault_keys(&connection_id, &provider);
    for key in vault_keys {
        delete_llm_secret(&key)?;
        println!("  🔓 Secret deleted from keyring: {}", key);
    }
    
    // Step 2: Delete metadata from SQLite
    let db = get_connections_db(&app_handle)?;
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    
    db.delete_connection(&connection_id)
        .map_err(|e| format!("Failed to delete connection: {}", e))?;
    
    println!("✅ LLM connection deleted (secrets and metadata removed)");
    Ok(())
}

#[tauri::command]
async fn set_default_llm_connection(
    connection_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    println!("⭐ Setting default LLM connection: {}", connection_id);
    
    let db = get_connections_db(&app_handle)?;
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    
    db.set_default_connection(&connection_id)
        .map_err(|e| format!("Failed to set default connection: {}", e))?;
    
    println!("✅ Default connection updated");
    Ok(())
}

fn kill_dev_server() {
    // Kill the Vite dev server on port 1420 when the app closes
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("sh")
            .arg("-c")
            .arg("lsof -ti:1420 | xargs kill -9 2>/dev/null || true")
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("sh")
            .arg("-c")
            .arg("fuser -k 1420/tcp 2>/dev/null || true")
            .spawn();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("cmd")
            .args(["/C", "FOR /F \"tokens=5\" %a IN ('netstat -aon ^| find \":1420\"') DO taskkill /F /PID %a"])
            .spawn();
    }
}

fn main() {
    // Run protection checks in release mode
    #[cfg(not(debug_assertions))]
    {
        if let Err(e) = protection::run_protection_checks() {
            eprintln!("Security check failed: {}", e);
            std::process::exit(1);
        }
    }

    // Auto-setup engine: create venv and install dependencies if needed
    setup_engine();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            // Engine commands
            compile_dsl,
            run_bot,
            stop_bot,
            validate_dsl,
            get_engine_setup_status,
            // Debug commands
            debug_start,
            debug_step,
            debug_continue,
            debug_stop,
            debug_pause,
            debug_get_variables,
            save_project,
            load_project,
            get_engine_info,
            // Project commands
            create_project,
            open_project,
            save_project_manifest,
            // Bot commands
            create_bot,
            load_bot,
            save_bot,
            delete_bot,
            // Version history commands
            save_bot_version,
            list_bot_versions,
            load_bot_version,
            cleanup_old_versions,
            // Asset commands
            list_assets,
            copy_asset,
            delete_asset,
            // Recent projects commands
            get_recent_projects,
            add_recent_project,
            remove_recent_project,
            // Vault commands
            vault_exists,
            vault_is_unlocked,
            vault_create,
            vault_create_auto,
            vault_delete,
            vault_auto_unlock,
            vault_unlock,
            vault_lock,
            vault_list_secrets,
            vault_verify_secret,
            vault_set_secret,
            vault_delete_secret,
            vault_change_password,
            // Connections commands
            save_connections,
            load_connections,
            test_llm_connection,
            test_ms365_connection,
            // AI Planner - LLM Connections (New)
            test_llm_connection_v2,
            save_llm_connection,
            load_llm_connections,
            delete_llm_connection,
            set_default_llm_connection,
            // AI Planner commands
            ai_generate_plan,
            ai_refine_plan,
            ai_generate_executable_plan,
            // License commands
            validate_license,
            // Utility commands
            read_directory,
            file_exists,
            get_excel_sheets,
            // Protection commands
            protection::protection_validate_binary_license,
            protection::protection_check_status,
            protection::protection_get_machine_fingerprint
        ])
        .on_window_event(|event| {
            if let tauri::WindowEvent::Destroyed = event.event() {
                println!("🛑 Window destroyed, killing dev server...");
                kill_dev_server();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
