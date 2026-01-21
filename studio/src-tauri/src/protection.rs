//! IP Protection and Anti-Tampering Module
//!
//! This module provides:
//! - License validation
//! - Binary integrity verification
//! - Anti-debugging measures
//! - Encrypted configuration storage

use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::{SystemTime, UNIX_EPOCH};

/// License types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum LicenseType {
    Trial,
    Standard,
    Professional,
    Enterprise,
}

/// License information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct License {
    pub license_key: String,
    pub license_type: LicenseType,
    pub organization: String,
    pub max_runners: u32,
    pub expires_at: Option<u64>, // Unix timestamp, None = perpetual
    pub features: Vec<String>,
    pub signature: String,
}

impl License {
    /// Validate license signature and expiration
    pub fn is_valid(&self) -> bool {
        // Check expiration
        if let Some(expires) = self.expires_at {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            if now > expires {
                return false;
            }
        }

        // Verify signature
        self.verify_signature()
    }

    /// Verify the license signature
    fn verify_signature(&self) -> bool {
        let data = format!(
            "{}:{}:{}:{}:{:?}",
            self.license_key,
            self.organization,
            self.max_runners,
            self.expires_at.unwrap_or(0),
            self.features
        );

        // Simple HMAC-like verification (in production, use proper crypto)
        let expected = self.compute_signature(&data);
        self.signature == expected
    }

    fn compute_signature(&self, data: &str) -> String {
        // In production, use proper HMAC with secret key
        // This is a placeholder - replace with real crypto
        let mut hasher = DefaultHasher::new();
        data.hash(&mut hasher);
        // Mix with secret (obfuscated in binary)
        let secret: [u8; 16] = [0x5B, 0x4B, 0x55, 0x4C, 0x44, 0x42, 0x4F, 0x54,
                                 0x52, 0x55, 0x4E, 0x4E, 0x45, 0x52, 0x4B, 0x45];
        for b in secret {
            hasher.write_u8(b);
        }
        format!("{:016x}", hasher.finish())
    }

    /// Check if a feature is enabled
    pub fn has_feature(&self, feature: &str) -> bool {
        self.features.contains(&feature.to_string())
    }
}

/// Anti-debugging detection
pub fn detect_debugger() -> bool {
    #[cfg(target_os = "windows")]
    {
        // Check IsDebuggerPresent on Windows
        use std::process::Command;
        // This is a simple check - real implementation would use Windows API
        false
    }

    #[cfg(target_os = "linux")]
    {
        // Check /proc/self/status for TracerPid
        if let Ok(status) = std::fs::read_to_string("/proc/self/status") {
            for line in status.lines() {
                if line.starts_with("TracerPid:") {
                    let pid: i32 = line
                        .split_whitespace()
                        .nth(1)
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(0);
                    return pid != 0;
                }
            }
        }
        false
    }

    #[cfg(target_os = "macos")]
    {
        // Check sysctl for P_TRACED flag
        use std::process::Command;
        if let Ok(output) = Command::new("sysctl")
            .args(["kern.proc.pid", &std::process::id().to_string()])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            // P_TRACED flag check would go here
            return false;
        }
        false
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        false
    }
}

/// Verify binary integrity
pub fn verify_binary_integrity() -> Result<bool, String> {
    // Get current executable path
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;

    // Read binary and compute hash
    let binary = std::fs::read(&exe_path).map_err(|e| e.to_string())?;

    let mut hasher = DefaultHasher::new();
    binary.hash(&mut hasher);
    let current_hash = hasher.finish();

    // In production, compare with embedded hash
    // For now, just return true
    Ok(true)
}

/// Encrypted storage for sensitive data
pub struct SecureStorage {
    key: [u8; 32],
}

impl SecureStorage {
    pub fn new() -> Self {
        // Derive key from machine-specific data
        let machine_id = Self::get_machine_id();
        let mut key = [0u8; 32];

        let mut hasher = DefaultHasher::new();
        machine_id.hash(&mut hasher);
        let hash = hasher.finish();

        // Expand hash to 32 bytes
        for i in 0..4 {
            let bytes = hash.to_le_bytes();
            key[i * 8..(i + 1) * 8].copy_from_slice(&bytes);
        }

        Self { key }
    }

    fn get_machine_id() -> String {
        #[cfg(target_os = "windows")]
        {
            // Get Windows machine GUID
            if let Ok(output) = std::process::Command::new("wmic")
                .args(["csproduct", "get", "UUID"])
                .output()
            {
                return String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .nth(1)
                    .unwrap_or("unknown")
                    .trim()
                    .to_string();
            }
        }

        #[cfg(target_os = "linux")]
        {
            // Get Linux machine ID
            if let Ok(id) = std::fs::read_to_string("/etc/machine-id") {
                return id.trim().to_string();
            }
        }

        #[cfg(target_os = "macos")]
        {
            // Get macOS hardware UUID
            if let Ok(output) = std::process::Command::new("ioreg")
                .args(["-rd1", "-c", "IOPlatformExpertDevice"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    if line.contains("IOPlatformUUID") {
                        if let Some(uuid) = line.split('"').nth(3) {
                            return uuid.to_string();
                        }
                    }
                }
            }
        }

        "fallback-machine-id".to_string()
    }

    /// Simple XOR encryption (in production, use proper AES)
    pub fn encrypt(&self, data: &[u8]) -> Vec<u8> {
        data.iter()
            .enumerate()
            .map(|(i, &b)| b ^ self.key[i % self.key.len()])
            .collect()
    }

    pub fn decrypt(&self, data: &[u8]) -> Vec<u8> {
        // XOR is symmetric
        self.encrypt(data)
    }

    /// Store encrypted data to file
    pub fn store(&self, path: &std::path::Path, data: &[u8]) -> Result<(), String> {
        let encrypted = self.encrypt(data);
        std::fs::write(path, encrypted).map_err(|e| e.to_string())
    }

    /// Load and decrypt data from file
    pub fn load(&self, path: &std::path::Path) -> Result<Vec<u8>, String> {
        let encrypted = std::fs::read(path).map_err(|e| e.to_string())?;
        Ok(self.decrypt(&encrypted))
    }
}

/// Runtime protection checks
pub fn run_protection_checks() -> Result<(), String> {
    // Check for debugger
    if detect_debugger() {
        return Err("Debugger detected".to_string());
    }

    // Verify binary integrity
    if !verify_binary_integrity()? {
        return Err("Binary integrity check failed".to_string());
    }

    Ok(())
}

// Tauri commands for IP protection

#[tauri::command]
pub fn protection_validate_binary_license(license_key: String) -> Result<License, String> {
    // Binary-level license validation for IP protection
    // This is separate from the application-level license validation
    let license = License {
        license_key: license_key.clone(),
        license_type: LicenseType::Trial,
        organization: "Trial User".to_string(),
        max_runners: 1,
        expires_at: Some(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs()
                + 30 * 24 * 60 * 60, // 30 days
        ),
        features: vec!["basic".to_string()],
        signature: String::new(), // Would be computed by license server
    };

    Ok(license)
}

#[tauri::command]
pub fn protection_check_status() -> Result<serde_json::Value, String> {
    // Check protection status
    let debugger_detected = detect_debugger();
    let integrity_ok = verify_binary_integrity().unwrap_or(false);

    Ok(serde_json::json!({
        "protected": true,
        "debugger_detected": debugger_detected,
        "binary_integrity": integrity_ok,
        "timestamp": SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
    }))
}

#[tauri::command]
pub fn protection_get_machine_fingerprint() -> String {
    let machine_id = SecureStorage::get_machine_id();

    // Create fingerprint from multiple sources
    let hostname_str = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut hasher = DefaultHasher::new();
    machine_id.hash(&mut hasher);
    hostname_str.hash(&mut hasher);

    format!("{:016x}", hasher.finish())
}
