// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

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

// Get the path to the engine directory
fn get_engine_path() -> PathBuf {
    // In development: ../engine
    // In production: bundle the engine with the app
    let mut path = std::env::current_exe()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf();
    
    // Go up to find engine directory
    for _ in 0..3 {
        path.pop();
    }
    path.push("engine");
    
    // If engine not found, try relative path (development)
    if !path.exists() {
        path = PathBuf::from("../../engine");
    }
    
    path
}

// Get Python executable from the engine's venv
fn get_python_executable() -> String {
    let engine_path = get_engine_path();
    let venv_python = engine_path.join(".venv").join("bin").join("python3");

    // Use venv Python if available, otherwise fall back to system python
    if venv_python.exists() {
        venv_python.to_string_lossy().to_string()
    } else if Command::new("python3").arg("--version").output().is_ok() {
        "python3".to_string()
    } else {
        "python".to_string()
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
        
        Err(format!("Error al compilar: {}", error))
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

with open('{}', 'r') as f:
    dsl = json.load(f)

# Compile
compiler = Compiler()
output_dir = '{}'
bot_dir = compiler.compile_to_disk(dsl, output_dir)

# Execute with captured output
main_robot = Path(bot_dir) / "main.robot"
output_path = Path(bot_dir) / "output"
output_path.mkdir(exist_ok=True)

# Get robot executable
python_dir = Path(sys.executable).parent
robot_exe = str(python_dir / "robot") if (python_dir / "robot").exists() else "robot"

# Run robot and capture output
result = subprocess.run(
    [robot_exe, "--loglevel", "DEBUG", "--outputdir", str(output_path), "--consolecolors", "off", str(main_robot)],
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
            message: "Bot ejecutado".to_string(),
            output: Some(stdout.to_string()),
            logs: stdout.lines().map(|s| s.to_string()).collect(),
        })
    } else {
        Err(format!("Error al ejecutar: {}\n{}", stdout, stderr))
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            compile_dsl,
            run_bot,
            validate_dsl,
            save_project,
            load_project,
            get_engine_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


