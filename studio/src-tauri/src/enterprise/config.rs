//! Enterprise Configuration Management
//! 
//! Provides hierarchical configuration with:
//! - Multiple sources (YAML, TOML, JSON, ENV)
//! - Hot-reload support
//! - Validation
//! - Multi-tenant configurations
//! - Secrets management integration

use config::{Config, ConfigError, Environment, File};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use parking_lot::RwLock;
use notify::{Watcher, RecursiveMode, recommended_watcher};
use std::time::Duration;

// ============================================================
// Configuration Schema
// ============================================================

/// Root configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// Server configuration
    pub server: ServerConfig,
    
    /// MCP configuration
    pub mcp: MCPConfig,
    
    /// Database configuration
    pub database: DatabaseConfig,
    
    /// Observability configuration
    pub observability: ObservabilityConfig,
    
    /// Security configuration
    pub security: SecurityConfig,
    
    /// Multi-tenant configuration
    #[serde(default)]
    pub tenants: Vec<TenantConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    /// Server name
    pub name: String,
    
    /// Server version
    pub version: String,
    
    /// Environment (dev, staging, production)
    pub environment: String,
    
    /// API version
    #[serde(default = "default_api_version")]
    pub api_version: String,
    
    /// Graceful shutdown timeout (seconds)
    #[serde(default = "default_shutdown_timeout")]
    pub shutdown_timeout_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPConfig {
    /// Enable MCP layer
    #[serde(default = "default_true")]
    pub enabled: bool,
    
    /// MCP servers to load
    pub servers: Vec<MCPServerConfig>,
    
    /// Request timeout (seconds)
    #[serde(default = "default_request_timeout")]
    pub request_timeout_secs: u64,
    
    /// Max concurrent requests
    #[serde(default = "default_max_concurrent")]
    pub max_concurrent_requests: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPServerConfig {
    /// Server identifier
    pub name: String,
    
    /// Server type (compliance, document_intake, industry_core, etc.)
    pub server_type: String,
    
    /// Enabled flag
    #[serde(default = "default_true")]
    pub enabled: bool,
    
    /// Server-specific configuration
    #[serde(default)]
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    /// Database type (sqlite, postgres)
    pub db_type: String,
    
    /// Connection URL
    pub url: String,
    
    /// Connection pool size
    #[serde(default = "default_pool_size")]
    pub pool_size: u32,
    
    /// Connection timeout (seconds)
    #[serde(default = "default_connection_timeout")]
    pub connection_timeout_secs: u64,
    
    /// Enable auto-migration
    #[serde(default = "default_true")]
    pub auto_migrate: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObservabilityConfig {
    /// Logging configuration
    pub logging: LoggingConfig,
    
    /// Metrics configuration
    pub metrics: MetricsConfig,
    
    /// Tracing configuration
    pub tracing: TracingConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    /// Log level (trace, debug, info, warn, error)
    #[serde(default = "default_log_level")]
    pub level: String,
    
    /// Log format (json, pretty, compact)
    #[serde(default = "default_log_format")]
    pub format: String,
    
    /// Log to file
    #[serde(default)]
    pub file: Option<LogFileConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogFileConfig {
    /// Log file path
    pub path: PathBuf,
    
    /// Max file size (MB)
    #[serde(default = "default_log_max_size")]
    pub max_size_mb: u64,
    
    /// Max number of rotated files
    #[serde(default = "default_log_max_backups")]
    pub max_backups: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsConfig {
    /// Enable metrics
    #[serde(default = "default_true")]
    pub enabled: bool,
    
    /// Metrics endpoint path
    #[serde(default = "default_metrics_path")]
    pub endpoint: String,
    
    /// Metrics port
    #[serde(default = "default_metrics_port")]
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TracingConfig {
    /// Enable tracing
    #[serde(default)]
    pub enabled: bool,
    
    /// Tracing endpoint (OpenTelemetry)
    pub endpoint: Option<String>,
    
    /// Sampling rate (0.0 - 1.0)
    #[serde(default = "default_sampling_rate")]
    pub sampling_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    /// Secrets backend (vault, aws_secrets, azure_keyvault, env)
    #[serde(default = "default_secrets_backend")]
    pub secrets_backend: String,
    
    /// Vault configuration (if using Vault)
    pub vault: Option<VaultConfig>,
    
    /// Enable encryption at rest
    #[serde(default = "default_true")]
    pub encryption_at_rest: bool,
    
    /// Encryption key ID (from KMS)
    pub encryption_key_id: Option<String>,
    
    /// TLS configuration
    pub tls: Option<TLSConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultConfig {
    /// Vault address
    pub address: String,
    
    /// Vault token (should be from env or file, not hardcoded)
    pub token: Option<String>,
    
    /// Vault namespace
    pub namespace: Option<String>,
    
    /// Vault mount path
    #[serde(default = "default_vault_mount")]
    pub mount_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TLSConfig {
    /// Enable TLS
    #[serde(default = "default_true")]
    pub enabled: bool,
    
    /// Certificate path
    pub cert_path: PathBuf,
    
    /// Key path
    pub key_path: PathBuf,
    
    /// CA bundle path
    pub ca_path: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantConfig {
    /// Tenant identifier
    pub id: String,
    
    /// Tenant name
    pub name: String,
    
    /// Tenant-specific compliance policies
    pub compliance_policy: CompliancePolicyConfig,
    
    /// Tenant-specific LLM routing
    pub llm_routing: LLMRoutingConfig,
    
    /// Enabled flag
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompliancePolicyConfig {
    /// PHI provider/model
    pub phi_provider: String,
    pub phi_model: String,
    pub phi_base_url: Option<String>,
    
    /// PII provider/model
    pub pii_provider: String,
    pub pii_model: String,
    pub pii_base_url: Option<String>,
    
    /// PCI provider/model
    pub pci_provider: String,
    pub pci_model: String,
    pub pci_base_url: Option<String>,
    
    /// Default provider/model
    pub default_provider: String,
    pub default_model: String,
    pub default_base_url: Option<String>,
    
    /// Audit retention (days)
    #[serde(default = "default_audit_retention")]
    pub audit_retention_days: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMRoutingConfig {
    /// Custom routing rules (beyond default compliance)
    #[serde(default)]
    pub custom_rules: Vec<RoutingRule>,
    
    /// Fallback behavior
    #[serde(default = "default_fallback")]
    pub fallback: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingRule {
    /// Rule name
    pub name: String,
    
    /// Condition (e.g., "contains:medical")
    pub condition: String,
    
    /// Target provider
    pub provider: String,
    
    /// Target model
    pub model: String,
}

// ============================================================
// Default values
// ============================================================

fn default_true() -> bool { true }
fn default_api_version() -> String { "v1".to_string() }
fn default_shutdown_timeout() -> u64 { 30 }
fn default_request_timeout() -> u64 { 300 }
fn default_max_concurrent() -> usize { 100 }
fn default_pool_size() -> u32 { 10 }
fn default_connection_timeout() -> u64 { 30 }
fn default_log_level() -> String { "info".to_string() }
fn default_log_format() -> String { "json".to_string() }
fn default_log_max_size() -> u64 { 100 }
fn default_log_max_backups() -> usize { 10 }
fn default_metrics_path() -> String { "/metrics".to_string() }
fn default_metrics_port() -> u16 { 9090 }
fn default_sampling_rate() -> f64 { 0.1 }
fn default_secrets_backend() -> String { "env".to_string() }
fn default_vault_mount() -> String { "secret".to_string() }
fn default_audit_retention() -> u32 { 2555 } // 7 years
fn default_fallback() -> String { "error".to_string() }

// ============================================================
// Configuration Manager
// ============================================================

/// Configuration manager with hot-reload support
pub struct ConfigManager {
    config: Arc<RwLock<AppConfig>>,
    config_path: PathBuf,
}

impl ConfigManager {
    /// Load configuration from file
    pub fn load(config_path: PathBuf) -> Result<Self, ConfigError> {
        let config = Self::load_config(&config_path)?;
        
        Ok(Self {
            config: Arc::new(RwLock::new(config)),
            config_path,
        })
    }
    
    /// Load configuration from default locations
    pub fn load_default() -> Result<Self, ConfigError> {
        // Try multiple locations in order:
        // 1. ./config.yaml
        // 2. ./config/default.yaml
        // 3. ~/.skuldbot/config.yaml
        // 4. /etc/skuldbot/config.yaml
        
        let paths = vec![
            PathBuf::from("config.yaml"),
            PathBuf::from("config/default.yaml"),
            dirs::home_dir().map(|h| h.join(".skuldbot/config.yaml")),
            Some(PathBuf::from("/etc/skuldbot/config.yaml")),
        ];
        
        for path_opt in paths {
            if let Some(path) = path_opt {
                if path.exists() {
                    return Self::load(path);
                }
            }
        }
        
        Err(ConfigError::Message("No configuration file found".to_string()))
    }
    
    /// Reload configuration from file
    pub fn reload(&self) -> Result<(), ConfigError> {
        let new_config = Self::load_config(&self.config_path)?;
        *self.config.write() = new_config;
        Ok(())
    }
    
    /// Get current configuration (read-only)
    pub fn get(&self) -> AppConfig {
        self.config.read().clone()
    }
    
    /// Get configuration for specific tenant
    pub fn get_tenant(&self, tenant_id: &str) -> Option<TenantConfig> {
        self.config
            .read()
            .tenants
            .iter()
            .find(|t| t.id == tenant_id && t.enabled)
            .cloned()
    }
    
    /// Watch configuration file for changes and auto-reload
    pub fn watch(&self) -> Result<(), Box<dyn std::error::Error>> {
        let config_path = self.config_path.clone();
        let config = self.config.clone();
        
        let mut watcher = recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
            match res {
                Ok(event) if event.kind.is_modify() => {
                    println!("📝 Configuration file changed, reloading...");
                    match Self::load_config(&config_path) {
                        Ok(new_config) => {
                            *config.write() = new_config;
                            println!("✅ Configuration reloaded successfully");
                        }
                        Err(e) => {
                            eprintln!("❌ Failed to reload configuration: {}", e);
                        }
                    }
                }
                Err(e) => eprintln!("❌ Watch error: {}", e),
                _ => {}
            }
        })?;
        
        watcher.watch(&self.config_path, RecursiveMode::NonRecursive)?;
        
        // Keep watcher alive (in real impl, this would be managed by the app lifecycle)
        std::mem::forget(watcher);
        
        Ok(())
    }
    
    // Internal helper to load config from file
    fn load_config(path: &PathBuf) -> Result<AppConfig, ConfigError> {
        let builder = Config::builder()
            .add_source(File::from(path.clone()))
            .add_source(Environment::with_prefix("SKULDBOT").separator("__"));
        
        let config = builder.build()?;
        config.try_deserialize()
    }
}

// ============================================================
// Validation
// ============================================================

impl AppConfig {
    /// Validate configuration
    pub fn validate(&self) -> Result<(), String> {
        // Server validation
        if self.server.name.is_empty() {
            return Err("server.name cannot be empty".to_string());
        }
        
        if !["dev", "staging", "production"].contains(&self.server.environment.as_str()) {
            return Err(format!("Invalid environment: {}", self.server.environment));
        }
        
        // Database validation
        if self.database.url.is_empty() {
            return Err("database.url cannot be empty".to_string());
        }
        
        if self.database.pool_size == 0 {
            return Err("database.pool_size must be > 0".to_string());
        }
        
        // Observability validation
        if !["trace", "debug", "info", "warn", "error"].contains(&self.observability.logging.level.as_str()) {
            return Err(format!("Invalid log level: {}", self.observability.logging.level));
        }
        
        // Tenant validation
        for tenant in &self.tenants {
            if tenant.id.is_empty() {
                return Err("tenant.id cannot be empty".to_string());
            }
            
            if tenant.compliance_policy.audit_retention_days == 0 {
                return Err(format!("tenant {} has invalid audit_retention_days", tenant.id));
            }
        }
        
        Ok(())
    }
}

