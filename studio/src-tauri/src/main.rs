// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod protection;

use std::process::Command;
use std::path::PathBuf;
use std::fs;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
struct BotDSL {
    version: String,
    bot: BotInfo,
    nodes: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
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
}

#[derive(Debug, Serialize, Deserialize)]
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

// Global debug process handle
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;
use std::process::{Child, Stdio};
use std::io::{BufRead, BufReader, Write};

static DEBUG_PROCESS: Lazy<Arc<TokioMutex<Option<Child>>>> = Lazy::new(|| Arc::new(TokioMutex::new(None)));

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
    let dsl_file = temp_dir.join("bot_dsl.json");
    std::fs::write(&dsl_file, &dsl).map_err(|e| e.to_string())?;
    
    // Run the compiler
    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')
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
        .map_err(|e| format!("Failed to execute Python: {}", e))?;
    
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
    let dsl_file = temp_dir.join("bot_run_dsl.json");
    std::fs::write(&dsl_file, &dsl).map_err(|e| e.to_string())?;
    
    // Run the bot
    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')
import json
import subprocess
from pathlib import Path
from skuldbot import Compiler, Executor, ExecutionMode
from skuldbot.dsl.validator import ValidationError

with open('{}', 'r') as f:
    dsl = json.load(f)

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

print('STATUS:', 'success' if result.returncode == 0 else 'failed')
print('SUCCESS:', result.returncode == 0)
if result.stderr:
    print('STDERR:', result.stderr)
"#,
            engine_path.display(),
            dsl_file.display(),
            temp_dir.join("bots_run").display()
        ))
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    
    println!("📝 Output: {}", stdout);
    if !stderr.is_empty() {
        println!("⚠️  Stderr: {}", stderr);
    }
    
    if output.status.success() {
        Ok(ExecutionResult {
            success: true,
            message: "Bot executed successfully".to_string(),
            output: Some(stdout.to_string()),
            logs: stdout.lines().map(|s| s.to_string()).collect(),
        })
    } else {
        Err(format!("Execution error: {}\n{}", stdout, stderr))
    }
}

// ============================================================
// Debug Commands (Interactive Debugging with Breakpoints)
// ============================================================

/// Start an interactive debug session
#[tauri::command]
async fn debug_start(dsl: String, breakpoints: Vec<String>) -> Result<DebugCommandResult, String> {
    println!("🐛 Starting debug session with {} breakpoints", breakpoints.len());

    let engine_path = get_engine_path();
    let python_exe = get_python_executable();

    // Kill any existing debug process
    {
        let mut process_guard = DEBUG_PROCESS.lock().await;
        if let Some(mut child) = process_guard.take() {
            let _ = child.kill();
        }
    }

    // Start the interactive executor
    let mut child = Command::new(&python_exe)
        .arg("-m")
        .arg("skuldbot.executor.interactive_executor")
        .current_dir(&engine_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start debug process: {}", e))?;

    // Get handles
    let stdin = child.stdin.take().ok_or("Failed to get stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;

    // Wait for ready message
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    // Read the ready message
    if let Some(Ok(line)) = lines.next() {
        println!("🐛 Debug executor: {}", line);
    }

    // Store the child process (we need to recreate stdin/stdout)
    // Since we consumed them, we need a different approach
    // Let's use a simpler synchronous approach for now

    // Re-spawn with fresh handles
    drop(child);

    // Use a simpler approach: spawn, send command, read response, done
    let temp_dir = std::env::temp_dir();
    let dsl_file = temp_dir.join("debug_dsl.json");
    std::fs::write(&dsl_file, &dsl).map_err(|e| e.to_string())?;

    // Create the start command
    let start_cmd = serde_json::json!({
        "command": "start",
        "dsl": serde_json::from_str::<serde_json::Value>(&dsl).unwrap_or(serde_json::json!({})),
        "breakpoints": breakpoints
    });

    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')
import json
from skuldbot.executor.interactive_executor import InteractiveExecutor

with open('{}', 'r') as f:
    dsl = json.load(f)

executor = InteractiveExecutor()
executor.start(dsl, {})

# Get final state
if executor.session:
    print(json.dumps({{"type": "state", "session": executor.session.to_dict()}}))
"#,
            engine_path.display(),
            dsl_file.display(),
            serde_json::to_string(&breakpoints).unwrap_or("[]".to_string())
        ))
        .output()
        .map_err(|e| format!("Failed to start debug: {}", e))?;

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    println!("🐛 Debug start output: {}", stdout_str);

    // Parse the last JSON line (the state)
    let mut session_state: Option<DebugSessionState> = None;
    let mut last_event: Option<serde_json::Value> = None;

    for line in stdout_str.lines() {
        if let Ok(msg) = serde_json::from_str::<serde_json::Value>(line) {
            if msg.get("type").and_then(|t| t.as_str()) == Some("state") {
                if let Some(session) = msg.get("session") {
                    session_state = serde_json::from_value(session.clone()).ok();
                }
            }
            last_event = Some(msg);
        }
    }

    Ok(DebugCommandResult {
        success: session_state.is_some(),
        message: if session_state.is_some() { Some("Debug session started".to_string()) } else { Some("Failed to start".to_string()) },
        session_state,
        last_event,
    })
}

/// Execute a single step in the debug session
#[tauri::command]
async fn debug_step(session_state_json: String) -> Result<DebugCommandResult, String> {
    println!("🐛 Debug step");

    let engine_path = get_engine_path();
    let python_exe = get_python_executable();

    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')
import json
from skuldbot.executor.interactive_executor import InteractiveExecutor, DebugSession, DebugState, NodeStatus, NodeExecution

# Restore session from JSON
session_data = json.loads('{}')

executor = InteractiveExecutor()

# Rebuild DSL node map from execution order and node executions
# We need to pass DSL separately for node definitions
# For now, create a minimal session

# Create a fresh executor and step through
# This is a simplified version - in production we'd persist the full state

executor.session = DebugSession(
    session_id=session_data.get('sessionId', ''),
    state=DebugState(session_data.get('state', 'paused')),
    current_node_id=session_data.get('currentNodeId'),
    breakpoints=set(session_data.get('breakpoints', [])),
    execution_order=session_data.get('executionOrder', []),
    node_executions={{}},
    global_variables=session_data.get('globalVariables', {{}}),
    start_time=session_data.get('startTime', 0),
    paused_at_breakpoint=session_data.get('pausedAtBreakpoint', False),
)

# Rebuild node executions
for node_id, node_data in session_data.get('nodeExecutions', {{}}).items():
    executor.session.node_executions[node_id] = NodeExecution(
        node_id=node_data.get('nodeId', node_id),
        node_type=node_data.get('nodeType', 'unknown'),
        label=node_data.get('label', node_id),
        status=NodeStatus(node_data.get('status', 'pending')),
        start_time=node_data.get('startTime'),
        end_time=node_data.get('endTime'),
        output=node_data.get('output'),
        error=node_data.get('error'),
        variables=node_data.get('variables', {{}}),
    )

# Build minimal node map for execution
executor._node_map = {{}}
for node_id in executor.session.execution_order:
    node_exec = executor.session.node_executions.get(node_id)
    if node_exec:
        executor._node_map[node_id] = {{
            'id': node_id,
            'type': node_exec.node_type,
            'label': node_exec.label,
            'config': {{}},
            'outputs': {{'success': '', 'error': ''}}
        }}

# Execute step
executor.step()

# Output final state
if executor.session:
    print(json.dumps({{"type": "state", "session": executor.session.to_dict()}}))
"#,
            engine_path.display(),
            session_state_json.replace("'", "\\'").replace("\n", "\\n")
        ))
        .output()
        .map_err(|e| format!("Failed to execute step: {}", e))?;

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let stderr_str = String::from_utf8_lossy(&output.stderr);

    println!("🐛 Debug step output: {}", stdout_str);
    if !stderr_str.is_empty() {
        println!("🐛 Debug step stderr: {}", stderr_str);
    }

    // Parse response
    let mut session_state: Option<DebugSessionState> = None;
    let mut last_event: Option<serde_json::Value> = None;

    for line in stdout_str.lines() {
        if let Ok(msg) = serde_json::from_str::<serde_json::Value>(line) {
            if msg.get("type").and_then(|t| t.as_str()) == Some("state") {
                if let Some(session) = msg.get("session") {
                    session_state = serde_json::from_value(session.clone()).ok();
                }
            }
            last_event = Some(msg);
        }
    }

    Ok(DebugCommandResult {
        success: session_state.is_some(),
        message: Some("Step executed".to_string()),
        session_state,
        last_event,
    })
}

/// Continue execution until next breakpoint or completion
#[tauri::command]
async fn debug_continue(session_state_json: String) -> Result<DebugCommandResult, String> {
    println!("🐛 Debug continue");

    let engine_path = get_engine_path();
    let python_exe = get_python_executable();

    let output = Command::new(&python_exe)
        .arg("-c")
        .arg(format!(
            r#"
import sys
sys.path.insert(0, '{}')
import json
from skuldbot.executor.interactive_executor import InteractiveExecutor, DebugSession, DebugState, NodeStatus, NodeExecution

# Restore session from JSON
session_data = json.loads('{}')

executor = InteractiveExecutor()

executor.session = DebugSession(
    session_id=session_data.get('sessionId', ''),
    state=DebugState(session_data.get('state', 'paused')),
    current_node_id=session_data.get('currentNodeId'),
    breakpoints=set(session_data.get('breakpoints', [])),
    execution_order=session_data.get('executionOrder', []),
    node_executions={{}},
    global_variables=session_data.get('globalVariables', {{}}),
    start_time=session_data.get('startTime', 0),
    paused_at_breakpoint=session_data.get('pausedAtBreakpoint', False),
)

# Rebuild node executions
for node_id, node_data in session_data.get('nodeExecutions', {{}}).items():
    executor.session.node_executions[node_id] = NodeExecution(
        node_id=node_data.get('nodeId', node_id),
        node_type=node_data.get('nodeType', 'unknown'),
        label=node_data.get('label', node_id),
        status=NodeStatus(node_data.get('status', 'pending')),
        start_time=node_data.get('startTime'),
        end_time=node_data.get('endTime'),
        output=node_data.get('output'),
        error=node_data.get('error'),
        variables=node_data.get('variables', {{}}),
    )

# Build minimal node map
executor._node_map = {{}}
for node_id in executor.session.execution_order:
    node_exec = executor.session.node_executions.get(node_id)
    if node_exec:
        executor._node_map[node_id] = {{
            'id': node_id,
            'type': node_exec.node_type,
            'label': node_exec.label,
            'config': {{}},
            'outputs': {{'success': '', 'error': ''}}
        }}

# Continue execution
executor.continue_execution()

# Output final state
if executor.session:
    print(json.dumps({{"type": "state", "session": executor.session.to_dict()}}))
"#,
            engine_path.display(),
            session_state_json.replace("'", "\\'").replace("\n", "\\n")
        ))
        .output()
        .map_err(|e| format!("Failed to continue: {}", e))?;

    let stdout_str = String::from_utf8_lossy(&output.stdout);

    // Parse response
    let mut session_state: Option<DebugSessionState> = None;
    let mut last_event: Option<serde_json::Value> = None;

    for line in stdout_str.lines() {
        if let Ok(msg) = serde_json::from_str::<serde_json::Value>(line) {
            if msg.get("type").and_then(|t| t.as_str()) == Some("state") {
                if let Some(session) = msg.get("session") {
                    session_state = serde_json::from_value(session.clone()).ok();
                }
            }
            last_event = Some(msg);
        }
    }

    Ok(DebugCommandResult {
        success: session_state.is_some(),
        message: Some("Continued".to_string()),
        session_state,
        last_event,
    })
}

/// Stop the debug session
#[tauri::command]
async fn debug_stop() -> Result<DebugCommandResult, String> {
    println!("🐛 Debug stop");

    // Kill any running debug process
    {
        let mut process_guard = DEBUG_PROCESS.lock().await;
        if let Some(mut child) = process_guard.take() {
            let _ = child.kill();
        }
    }

    Ok(DebugCommandResult {
        success: true,
        message: Some("Debug session stopped".to_string()),
        session_state: None,
        last_event: Some(serde_json::json!({"type": "stopped"})),
    })
}

/// Get variables for a node
#[tauri::command]
async fn debug_get_variables(session_state_json: String, node_id: Option<String>) -> Result<serde_json::Value, String> {
    println!("🐛 Debug get variables for {:?}", node_id);

    // Parse session state and extract variables
    let session: serde_json::Value = serde_json::from_str(&session_state_json)
        .map_err(|e| format!("Invalid session state: {}", e))?;

    if let Some(nid) = node_id {
        // Get specific node variables
        if let Some(node_exec) = session.get("nodeExecutions").and_then(|ne| ne.get(&nid)) {
            return Ok(node_exec.get("variables").cloned().unwrap_or(serde_json::json!({})));
        }
        Ok(serde_json::json!({}))
    } else {
        // Get global variables
        Ok(session.get("globalVariables").cloned().unwrap_or(serde_json::json!({})))
    }
}

#[tauri::command]
async fn validate_dsl(dsl: String) -> Result<bool, String> {
    println!("✓ Validating DSL...");
    
    let engine_path = get_engine_path();
    let python_exe = get_python_executable();
    
    let temp_dir = std::env::temp_dir();
    let dsl_file = temp_dir.join("bot_validate_dsl.json");
    std::fs::write(&dsl_file, &dsl).map_err(|e| e.to_string())?;
    
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
try:
    validator.validate(dsl)
    print('VALID')
except Exception as e:
    print('INVALID:', str(e))
    sys.exit(1)
"#,
            engine_path.display(),
            dsl_file.display()
        ))
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e))?;
    
    if output.status.success() {
        println!("✅ DSL is valid");
        Ok(true)
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        println!("❌ DSL is invalid: {}", error);
        Err(error.to_string())
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
        .map_err(|e| format!("Failed to read manifest: {}", e))?;

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
        .map_err(|e| format!("Failed to read bot file: {}", e))?;

    let bot: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse bot file: {}", e))?;

    println!("✅ Bot loaded");
    Ok(bot)
}

#[tauri::command]
async fn save_bot(bot_path: String, dsl: String) -> Result<(), String> {
    println!("💾 Saving bot: {}", bot_path);

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
    let vault_path = PathBuf::from(&path).join("secrets.vault");
    Ok(vault_path.exists())
}

#[tauri::command]
async fn vault_is_unlocked(path: String) -> Result<bool, String> {
    // For now, we can't check unlock status without trying to unlock
    // Return false to force unlock
    Ok(false)
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

#[tauri::command]
async fn vault_unlock(password: String, path: String) -> Result<bool, String> {
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
        Ok(true)
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to unlock vault: {}", error))
    }
}

#[tauri::command]
async fn vault_lock(path: String) -> Result<bool, String> {
    // Lock is handled by not storing the password
    // In a real implementation, we'd clear any cached state
    println!("Vault locked: {}", path);
    Ok(true)
}

#[tauri::command]
async fn vault_list_secrets(path: String) -> Result<Vec<VaultSecret>, String> {
    println!("Listing secrets from vault: {}", path);

    let engine_path = get_engine_path();
    let python_exe = get_python_executable();

    // Get password from environment
    let password = std::env::var("SKULDBOT_VAULT_PASSWORD")
        .map_err(|_| "SKULDBOT_VAULT_PASSWORD not set. Set it in your environment to use the vault.".to_string())?;

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

    let password = std::env::var("SKULDBOT_VAULT_PASSWORD")
        .map_err(|_| "SKULDBOT_VAULT_PASSWORD not set".to_string())?;

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

    let password = std::env::var("SKULDBOT_VAULT_PASSWORD")
        .map_err(|_| "SKULDBOT_VAULT_PASSWORD not set".to_string())?;

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

    let password = std::env::var("SKULDBOT_VAULT_PASSWORD")
        .map_err(|_| "SKULDBOT_VAULT_PASSWORD not set".to_string())?;

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

// AI Connection for visual connections between nodes (embeddings, memory, tools)
#[derive(Debug, Serialize, Deserialize, Clone)]
struct AIConnection {
    from: String,
    to: String,
    #[serde(rename = "type")]
    connection_type: String, // "embeddings", "memory", "tool"
    #[serde(rename = "toolName")]
    tool_name: Option<String>,
    #[serde(rename = "toolDescription")]
    tool_description: Option<String>,
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
    // AI-specific connections for RAG patterns (embeddings→memory→agent)
    #[serde(rename = "aiConnections", default)]
    ai_connections: Option<Vec<AIConnection>>,
}

#[derive(Debug, Serialize)]
struct AIPlanResponse {
    success: bool,
    plan: Option<Vec<AIPlanStep>>,
    error: Option<String>,
    #[serde(rename = "clarifyingQuestions")]
    clarifying_questions: Option<Vec<String>>,
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
  "nodeType": "category.action",
  "label": "Human readable step name",
  "description": "Clear explanation of what this step accomplishes",
  "config": {
    // Pre-filled configuration values
    // Use realistic placeholders like "${variable}" for dynamic values
  },
  "reasoning": "Brief explanation of why this step is needed in the workflow",
  "aiConnections": [
    // REQUIRED for AI nodes - defines visual connections
    { "from": "Source Node Label", "to": "Target Node Label", "type": "model|embeddings|memory|tool" }
  ]
}
</output_schema>

<ai_connection_types>
Visual connection types for AI workflows:
- "model": AI Model → AI Agent (sky blue connection, REQUIRED for ai.agent)
- "embeddings": Embeddings → AI Agent or Vector Memory (orange connection)
- "memory": Vector Memory → AI Agent (purple connection)
- "tool": Any node → AI Agent as callable tool (violet connection)
</ai_connection_types>

<examples>
## EXAMPLE 1: RAG Chatbot with Azure AI Foundry

User request: "Create a chatbot that uses Azure AI Foundry to answer questions about company documents"

Correct response:
[
  {
    "nodeType": "trigger.manual",
    "label": "Start Chat",
    "description": "Manual trigger to start the chatbot",
    "config": {},
    "reasoning": "Every workflow needs a trigger to start execution"
  },
  {
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
    "reasoning": "Azure AI Foundry provides enterprise-grade LLM access"
  },
  {
    "nodeType": "ai.embeddings",
    "label": "Azure Embeddings",
    "description": "Configure Azure embeddings for semantic search",
    "config": {
      "provider": "azure",
      "model": "text-embedding-ada-002",
      "base_url": "https://your-resource.openai.azure.com",
      "api_key": "${AZURE_OPENAI_KEY}"
    },
    "reasoning": "Embeddings enable semantic search in the vector database"
  },
  {
    "nodeType": "vectordb.memory",
    "label": "Company Docs Memory",
    "description": "Vector memory for company documentation",
    "config": {
      "provider": "chroma",
      "collection": "company_docs",
      "memory_type": "retrieve"
    },
    "reasoning": "Vector memory provides RAG context from company documents"
  },
  {
    "nodeType": "ai.agent",
    "label": "Company Assistant",
    "description": "AI agent that answers questions using company documentation",
    "config": {
      "goal": "Answer user questions accurately using company documentation context",
      "system_prompt": "You are a helpful company assistant. Use the provided context to answer questions accurately.",
      "max_iterations": 5
    },
    "reasoning": "The AI agent orchestrates the RAG pipeline and generates responses",
    "aiConnections": [
      { "from": "Azure GPT-4", "to": "Company Assistant", "type": "model" },
      { "from": "Azure Embeddings", "to": "Company Assistant", "type": "embeddings" },
      { "from": "Company Docs Memory", "to": "Company Assistant", "type": "memory" }
    ]
  },
  {
    "nodeType": "logging.log",
    "label": "Log Response",
    "description": "Log the assistant response for audit",
    "config": {
      "message": "${Company Assistant.output}",
      "level": "INFO"
    },
    "reasoning": "Logging responses helps with debugging and audit trails"
  }
]

## EXAMPLE 2: Document Indexing Pipeline

User request: "Index PDF documents into pgvector for later RAG queries"

Correct response:
[
  {
    "nodeType": "trigger.schedule",
    "label": "Daily Index",
    "description": "Run document indexing daily",
    "config": {
      "cron": "0 2 * * *"
    },
    "reasoning": "Schedule ensures documents are indexed regularly"
  },
  {
    "nodeType": "files.list",
    "label": "List PDFs",
    "description": "Get list of PDF files to index",
    "config": {
      "path": "/documents/incoming",
      "pattern": "*.pdf"
    },
    "reasoning": "Find all new PDF documents to process"
  },
  {
    "nodeType": "document.ocr",
    "label": "Extract Text",
    "description": "Extract text from PDF documents",
    "config": {
      "file_path": "${List PDFs.files}",
      "language": "en"
    },
    "reasoning": "OCR extracts text content from PDFs for embedding"
  },
  {
    "nodeType": "ai.embeddings",
    "label": "OpenAI Embeddings",
    "description": "Configure OpenAI embeddings model",
    "config": {
      "provider": "openai",
      "model": "text-embedding-3-small",
      "api_key": "${OPENAI_API_KEY}"
    },
    "reasoning": "Embeddings convert text to vectors for semantic search"
  },
  {
    "nodeType": "vectordb.pgvector_connect",
    "label": "Connect pgvector",
    "description": "Connect to PostgreSQL with pgvector extension",
    "config": {
      "connection_string": "${POSTGRES_URL}",
      "table_name": "document_embeddings",
      "dimension": 1536
    },
    "reasoning": "pgvector provides scalable vector storage in PostgreSQL"
  },
  {
    "nodeType": "vectordb.pgvector_upsert",
    "label": "Store Embeddings",
    "description": "Store document embeddings in pgvector",
    "config": {
      "texts": "${Extract Text.text}",
      "metadata": { "source": "${List PDFs.files}" }
    },
    "reasoning": "Upserting embeddings enables later RAG retrieval",
    "aiConnections": [
      { "from": "OpenAI Embeddings", "to": "Store Embeddings", "type": "embeddings" }
    ]
  }
]

## EXAMPLE 3: Compliance-First RAG with PII Detection

User request: "Create a RAG system that detects PII before storing documents"

Correct response:
[
  {
    "nodeType": "trigger.manual",
    "label": "Process Document",
    "description": "Manual trigger to process a document",
    "config": {},
    "reasoning": "Every workflow needs a trigger"
  },
  {
    "nodeType": "files.read",
    "label": "Read Document",
    "description": "Read the document content",
    "config": {
      "file_path": "${input.file_path}"
    },
    "reasoning": "Need to read the document before processing"
  },
  {
    "nodeType": "compliance.detect_pii",
    "label": "Detect PII",
    "description": "Scan document for personally identifiable information",
    "config": {
      "text": "${Read Document.content}",
      "entities": ["PERSON", "EMAIL", "PHONE", "SSN", "ADDRESS"]
    },
    "reasoning": "Compliance requires PII detection before storage"
  },
  {
    "nodeType": "compliance.redact_data",
    "label": "Redact Sensitive Data",
    "description": "Remove detected PII from the document",
    "config": {
      "data": "${Read Document.content}",
      "fields": "${Detect PII.entities}",
      "replacement": "[REDACTED]"
    },
    "reasoning": "Redact PII before storing in vector database"
  },
  {
    "nodeType": "ai.embeddings",
    "label": "OpenAI Embeddings",
    "description": "Generate embeddings from redacted text",
    "config": {
      "provider": "openai",
      "model": "text-embedding-3-small",
      "api_key": "${OPENAI_API_KEY}"
    },
    "reasoning": "Embeddings convert clean text to vectors"
  },
  {
    "nodeType": "vectordb.pgvector_upsert",
    "label": "Store Safe Vectors",
    "description": "Store redacted document embeddings",
    "config": {
      "texts": "${Redact Sensitive Data.redacted_text}",
      "metadata": { "original_file": "${input.file_path}", "pii_detected": "${Detect PII.count}" }
    },
    "reasoning": "Store only PII-free content in vector DB",
    "aiConnections": [
      { "from": "OpenAI Embeddings", "to": "Store Safe Vectors", "type": "embeddings" }
    ]
  },
  {
    "nodeType": "compliance.audit_log",
    "label": "Log Compliance Action",
    "description": "Create audit trail for compliance",
    "config": {
      "action": "document_processed",
      "details": { "pii_found": "${Detect PII.count}", "file": "${input.file_path}" }
    },
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
7. Are all AI connections properly defined?
</thinking_process>

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

    let output = std::process::Command::new(&python_cmd)
        .arg("-m")
        .arg("skuldbot.cli.ai_catalog")
        .arg("--format")
        .arg("text")
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

/// Validate that all node types in the plan are valid
fn validate_plan_node_types(plan: &[AIPlanStep]) -> Result<(), String> {
    let valid_types = match load_valid_node_types() {
        Ok(types) => types,
        Err(e) => {
            println!("⚠️  Could not load valid node types, skipping validation: {}", e);
            return Ok(()); // Skip validation if we can't load the catalog
        }
    };

    let mut invalid_types: Vec<String> = Vec::new();

    for step in plan {
        if !valid_types.contains(&step.node_type) {
            invalid_types.push(step.node_type.clone());
        }
    }

    if !invalid_types.is_empty() {
        return Err(format!(
            "Invalid node types detected: {}. These nodes do not exist in the SkuldBot catalog. Please use only valid node types.",
            invalid_types.join(", ")
        ));
    }

    Ok(())
}

fn get_api_key_from_env(provider: &str) -> Option<String> {
    match provider {
        "openai" => std::env::var("OPENAI_API_KEY").ok(),
        "anthropic" => std::env::var("ANTHROPIC_API_KEY").ok(),
        _ => None,
    }
}

// ============================================================
// Connections Commands (LLM Credentials Management)
// ============================================================

fn get_connections_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".skuldbot").join("connections.json")
}

#[tauri::command]
async fn save_connections(connections_json: String) -> Result<bool, String> {
    println!("💾 Saving LLM connections...");

    let connections_path = get_connections_path();

    // Create directory if it doesn't exist
    if let Some(parent) = connections_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // TODO: In production, encrypt the JSON before storing
    // For now, store as-is (the connections contain API keys)
    fs::write(&connections_path, &connections_json)
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

    let content = fs::read_to_string(&connections_path)
        .map_err(|e| format!("Failed to read connections: {}", e))?;

    println!("✅ Loaded connections from: {}", connections_path.display());
    Ok(content)
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

async fn call_openai_api(
    prompt: &str,
    system_prompt: &str,
    model: &str,
    temperature: f64,
    base_url: Option<&str>,
    api_key: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let url = base_url
        .map(|u| format!("{}/chat/completions", u.trim_end_matches('/')))
        .unwrap_or_else(|| "https://api.openai.com/v1/chat/completions".to_string());

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
) -> Result<String, String> {
    let client = reqwest::Client::new();

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
                // Return mock response if no API key
                println!("⚠️  No API key found for {}, using mock response", provider);
                let mock_plan = vec![
                    AIPlanStep {
                        id: None,
                        node_type: "trigger.manual".to_string(),
                        label: "Start Automation".to_string(),
                        description: "Manually trigger the automation".to_string(),
                        config: serde_json::json!({}),
                        reasoning: Some("Every automation needs a trigger to start".to_string()),
                        ai_connections: None,
                    },
                    AIPlanStep {
                        id: None,
                        node_type: "logging.log".to_string(),
                        label: "Log Start".to_string(),
                        description: "Log that the automation has started".to_string(),
                        config: serde_json::json!({ "message": "Automation started", "level": "INFO" }),
                        reasoning: Some("Good practice to log automation start for debugging".to_string()),
                        ai_connections: None,
                    },
                ];

                return Ok(AIPlanResponse {
                    success: true,
                    plan: Some(mock_plan),
                    error: None,
                    clarifying_questions: Some(vec![
                        "Note: Configure an LLM connection in Settings for real AI planning.".to_string()
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
            )
            .await
        }
        "anthropic" => {
            call_anthropic_api(&prompt, &system_prompt, &model, &api_key).await
        }
        _ => Err(format!("Unsupported provider: {}", provider)),
    };

    match result {
        Ok(response) => {
            println!("📝 LLM Response received ({} chars)", response.len());
            match parse_plan_from_response(&response) {
                Ok(plan) => {
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
Follow the same format as the original plan with nodeType, label, description, config, and reasoning fields."#,
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
            )
            .await
        }
        "anthropic" => {
            call_anthropic_api(&refinement_prompt, &system_prompt, &model, &api_key).await
        }
        _ => Err(format!("Unsupported provider: {}", provider)),
    };

    match result {
        Ok(response) => {
            match parse_plan_from_response(&response) {
                Ok(refined_plan) => {
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
// License Validation Commands
// ============================================================

#[tauri::command]
async fn validate_license(license_key: String) -> Result<LicenseValidationResult, String> {
    println!("🔑 Validating license: {}...", &license_key[..8.min(license_key.len())]);

    // TODO: Implement actual license validation against Orchestrator API
    // For development, we'll validate based on key format

    // Mock validation logic
    // In production: call POST /api/licenses/validate on Orchestrator

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
            validate_dsl,
            get_engine_setup_status,
            // Debug commands
            debug_start,
            debug_step,
            debug_continue,
            debug_stop,
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
            // AI Planner commands
            ai_generate_plan,
            ai_refine_plan,
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


