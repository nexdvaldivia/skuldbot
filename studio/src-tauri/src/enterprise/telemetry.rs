//! Enterprise Telemetry
//! 
//! Provides:
//! - Structured logging (tracing)
//! - Prometheus metrics
//! - OpenTelemetry tracing
//! - Performance monitoring

use tracing::{info, warn, error, debug, trace};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use metrics::{counter, histogram, gauge, describe_counter, describe_histogram, describe_gauge};
use metrics_exporter_prometheus::PrometheusBuilder;
use std::time::Instant;
use std::sync::Arc;
use parking_lot::RwLock;

use crate::enterprise::config::ObservabilityConfig;

// ============================================================
// Metrics Registry
// ============================================================

pub struct MetricsRegistry {
    start_time: Instant,
}

impl MetricsRegistry {
    pub fn new() -> Self {
        Self {
            start_time: Instant::now(),
        }
    }
    
    /// Initialize metrics registry
    pub fn init(&self, config: &ObservabilityConfig) -> Result<(), Box<dyn std::error::Error>> {
        if !config.metrics.enabled {
            return Ok(());
        }
        
        // Register metric descriptions
        describe_counter!("mcp_tool_calls_total", "Total number of MCP tool calls");
        describe_counter!("mcp_tool_calls_failed", "Number of failed MCP tool calls");
        describe_histogram!("mcp_tool_call_duration_ms", "MCP tool call duration in milliseconds");
        
        describe_counter!("compliance_classifications_total", "Total number of data classifications");
        describe_counter!("compliance_phi_detected", "Number of PHI detections");
        describe_counter!("compliance_pii_detected", "Number of PII detections");
        describe_counter!("compliance_pci_detected", "Number of PCI detections");
        
        describe_counter!("ai_planner_requests_total", "Total number of AI planner requests");
        describe_counter!("ai_planner_requests_failed", "Number of failed AI planner requests");
        describe_histogram!("ai_planner_request_duration_ms", "AI planner request duration in milliseconds");
        describe_histogram!("ai_planner_confidence_score", "AI planner confidence scores");
        
        describe_gauge!("db_connections_active", "Number of active database connections");
        describe_gauge!("db_connections_idle", "Number of idle database connections");
        
        describe_counter!("audit_log_entries_total", "Total number of audit log entries");
        describe_gauge!("audit_log_size_bytes", "Size of audit log in bytes");
        
        // Start Prometheus exporter
        PrometheusBuilder::new()
            .with_http_listener((std::net::Ipv4Addr::LOCALHOST, config.metrics.port))
            .install()?;
        
        info!("📊 Prometheus metrics endpoint started on port {}", config.metrics.port);
        
        Ok(())
    }
    
    /// Get uptime in seconds
    pub fn uptime_seconds(&self) -> u64 {
        self.start_time.elapsed().as_secs()
    }
}

// ============================================================
// Logging Setup
// ============================================================

pub fn init_logging(config: &ObservabilityConfig) -> Result<(), Box<dyn std::error::Error>> {
    let log_config = &config.logging;
    
    // Parse log level
    let env_filter = EnvFilter::try_from_default_env()
        .or_else(|_| EnvFilter::try_new(&log_config.level))?;
    
    // Build subscriber based on format
    match log_config.format.as_str() {
        "json" => {
            tracing_subscriber::registry()
                .with(env_filter)
                .with(tracing_subscriber::fmt::layer().json())
                .init();
        }
        "pretty" => {
            tracing_subscriber::registry()
                .with(env_filter)
                .with(tracing_subscriber::fmt::layer().pretty())
                .init();
        }
        "compact" => {
            tracing_subscriber::registry()
                .with(env_filter)
                .with(tracing_subscriber::fmt::layer().compact())
                .init();
        }
        _ => {
            return Err(format!("Invalid log format: {}", log_config.format).into());
        }
    }
    
    info!("📝 Logging initialized (level: {}, format: {})", log_config.level, log_config.format);
    
    Ok(())
}

// ============================================================
// Instrumentation Helpers
// ============================================================

/// Record MCP tool call metrics
pub fn record_mcp_tool_call(
    server_name: &str,
    tool_name: &str,
    duration_ms: u64,
    success: bool,
) {
    counter!("mcp_tool_calls_total", "server" => server_name.to_string(), "tool" => tool_name.to_string()).increment(1);
    
    if !success {
        counter!("mcp_tool_calls_failed", "server" => server_name.to_string(), "tool" => tool_name.to_string()).increment(1);
    }
    
    histogram!("mcp_tool_call_duration_ms", "server" => server_name.to_string(), "tool" => tool_name.to_string()).record(duration_ms as f64);
}

/// Record compliance classification
pub fn record_compliance_classification(classification: &str) {
    counter!("compliance_classifications_total", "classification" => classification.to_string()).increment(1);
    
    match classification {
        "phi" => counter!("compliance_phi_detected").increment(1),
        "pii" => counter!("compliance_pii_detected").increment(1),
        "pci" => counter!("compliance_pci_detected").increment(1),
        _ => {}
    }
}

/// Record AI planner request
pub fn record_ai_planner_request(
    provider: &str,
    model: &str,
    duration_ms: u64,
    confidence: f64,
    success: bool,
) {
    counter!("ai_planner_requests_total", "provider" => provider.to_string(), "model" => model.to_string()).increment(1);
    
    if !success {
        counter!("ai_planner_requests_failed", "provider" => provider.to_string(), "model" => model.to_string()).increment(1);
    }
    
    histogram!("ai_planner_request_duration_ms", "provider" => provider.to_string(), "model" => model.to_string()).record(duration_ms as f64);
    histogram!("ai_planner_confidence_score").record(confidence);
}

/// Record audit log entry
pub fn record_audit_log_entry() {
    counter!("audit_log_entries_total").increment(1);
}

/// Update database connection metrics
pub fn update_db_connections(active: usize, idle: usize) {
    gauge!("db_connections_active").set(active as f64);
    gauge!("db_connections_idle").set(idle as f64);
}

// ============================================================
// Request Tracing
// ============================================================

/// Create a new span for tracing a request
#[macro_export]
macro_rules! trace_request {
    ($name:expr, $($field:tt)*) => {
        tracing::info_span!($name, $($field)*)
    };
}

/// Log structured event
#[macro_export]
macro_rules! log_event {
    ($level:ident, $message:expr, $($field:tt)*) => {
        tracing::$level!($message, $($field)*);
    };
}

// ============================================================
// Health Metrics
// ============================================================

#[derive(Debug, Clone)]
pub struct HealthMetrics {
    pub uptime_seconds: u64,
    pub mcp_tool_calls_total: u64,
    pub ai_planner_requests_total: u64,
    pub audit_log_entries_total: u64,
    pub db_connections_active: usize,
}

impl HealthMetrics {
    pub fn new(registry: &MetricsRegistry) -> Self {
        Self {
            uptime_seconds: registry.uptime_seconds(),
            mcp_tool_calls_total: 0, // Would query from metrics backend
            ai_planner_requests_total: 0,
            audit_log_entries_total: 0,
            db_connections_active: 0,
        }
    }
}

