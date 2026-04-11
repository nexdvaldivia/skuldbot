use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use directories::ProjectDirs;

const SERVICE_NAME: &str = "skuldbot-runner";

/// Secret metadata (stored in config file, not the actual value)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretMetadata {
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Secrets index stored in config directory
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SecretsIndex {
    pub secrets: HashMap<String, SecretMetadata>,
}

fn get_secrets_index_path() -> PathBuf {
    ProjectDirs::from("com", "khipus", "skuldbot-runner")
        .map(|dirs| dirs.config_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
        .join("secrets_index.json")
}

fn load_secrets_index() -> SecretsIndex {
    let path = get_secrets_index_path();

    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(content) => {
                match serde_json::from_str(&content) {
                    Ok(index) => return index,
                    Err(e) => eprintln!("Failed to parse secrets index: {}", e),
                }
            }
            Err(e) => eprintln!("Failed to read secrets index: {}", e),
        }
    }

    SecretsIndex::default()
}

fn save_secrets_index(index: &SecretsIndex) -> Result<(), String> {
    let path = get_secrets_index_path();

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;

    Ok(())
}

fn get_keyring_entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, key).map_err(|e| format!("Failed to access keyring: {}", e))
}

fn get_current_timestamp() -> String {
    chrono::Utc::now().to_rfc3339()
}

// Tauri Commands

/// List all secrets (only metadata, not values)
#[tauri::command]
pub fn list_secrets() -> Vec<SecretMetadata> {
    let index = load_secrets_index();
    index.secrets.into_values().collect()
}

/// Set a secret value
#[tauri::command]
pub fn set_secret(key: String, value: String, description: Option<String>) -> Result<(), String> {
    // Store in OS keyring
    let entry = get_keyring_entry(&key)?;
    entry.set_password(&value).map_err(|e| format!("Failed to store secret: {}", e))?;

    // Update index
    let mut index = load_secrets_index();
    let now = get_current_timestamp();

    let metadata = if let Some(existing) = index.secrets.get(&key) {
        SecretMetadata {
            name: key.clone(),
            description: description.or_else(|| existing.description.clone()),
            created_at: existing.created_at.clone(),
            updated_at: now,
        }
    } else {
        SecretMetadata {
            name: key.clone(),
            description,
            created_at: now.clone(),
            updated_at: now,
        }
    };

    index.secrets.insert(key, metadata);
    save_secrets_index(&index)?;

    Ok(())
}

/// Get a secret value (for internal use / bots)
#[tauri::command]
pub fn get_secret(key: String) -> Result<String, String> {
    let entry = get_keyring_entry(&key)?;
    entry.get_password().map_err(|e| format!("Secret not found or access denied: {}", e))
}

/// Delete a secret
#[tauri::command]
pub fn delete_secret(key: String) -> Result<(), String> {
    // Remove from keyring
    let entry = get_keyring_entry(&key)?;
    let _ = entry.delete_credential(); // Ignore if not exists

    // Remove from index
    let mut index = load_secrets_index();
    index.secrets.remove(&key);
    save_secrets_index(&index)?;

    Ok(())
}

/// Check if a secret exists
#[tauri::command]
pub fn has_secret(key: String) -> bool {
    let index = load_secrets_index();
    index.secrets.contains_key(&key)
}
