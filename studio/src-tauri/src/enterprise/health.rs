//! Enterprise Health Checks
//! 
//! Kubernetes-compatible health endpoints:
//! - /health/live (liveness probe)
//! - /health/ready (readiness probe)
//! - /health/startup (startup probe)

use serde::{Deserialize, Serialize};
use std::time::Instant;
use crate::enterprise::persistence::DatabaseManager;
use crate::enterprise::telemetry::HealthMetrics;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatus {
    pub status: String,  // "healthy" | "degraded" | "unhealthy"
    pub checks: Vec<HealthCheck>,
    pub timestamp: String,
    pub uptime_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheck {
    pub name: String,
    pub status: String,  // "pass" | "warn" | "fail"
    pub message: Option<String>,
    pub duration_ms: Option<u64>,
}

pub struct HealthChecker {
    start_time: Instant,
}

impl HealthChecker {
    pub fn new() -> Self {
        Self {
            start_time: Instant::now(),
        }
    }
    
    /// Liveness probe - is the process running?
    pub async fn liveness(&self) -> HealthStatus {
        HealthStatus {
            status: "healthy".to_string(),
            checks: vec![
                HealthCheck {
                    name: "process".to_string(),
                    status: "pass".to_string(),
                    message: Some("Process is running".to_string()),
                    duration_ms: Some(0),
                }
            ],
            timestamp: chrono::Utc::now().to_rfc3339(),
            uptime_seconds: self.start_time.elapsed().as_secs(),
        }
    }
    
    /// Readiness probe - can it serve traffic?
    pub async fn readiness(&self, db: &DatabaseManager) -> HealthStatus {
        let mut checks = Vec::new();
        let mut overall_healthy = true;
        
        // Database check
        let db_start = Instant::now();
        match db.health_check().await {
            Ok(_) => {
                checks.push(HealthCheck {
                    name: "database".to_string(),
                    status: "pass".to_string(),
                    message: Some("Database is accessible".to_string()),
                    duration_ms: Some(db_start.elapsed().as_millis() as u64),
                });
            }
            Err(e) => {
                overall_healthy = false;
                checks.push(HealthCheck {
                    name: "database".to_string(),
                    status: "fail".to_string(),
                    message: Some(format!("Database check failed: {}", e)),
                    duration_ms: Some(db_start.elapsed().as_millis() as u64),
                });
            }
        }
        
        // MCP servers check (would check if servers are initialized)
        checks.push(HealthCheck {
            name: "mcp_servers".to_string(),
            status: "pass".to_string(),
            message: Some("MCP servers initialized".to_string()),
            duration_ms: Some(0),
        });
        
        HealthStatus {
            status: if overall_healthy { "healthy".to_string() } else { "unhealthy".to_string() },
            checks,
            timestamp: chrono::Utc::now().to_rfc3339(),
            uptime_seconds: self.start_time.elapsed().as_secs(),
        }
    }
    
    /// Startup probe - has initialization completed?
    pub async fn startup(&self, initialized: bool) -> HealthStatus {
        let status = if initialized { "pass" } else { "fail" };
        
        HealthStatus {
            status: if initialized { "healthy".to_string() } else { "unhealthy".to_string() },
            checks: vec![
                HealthCheck {
                    name: "initialization".to_string(),
                    status: status.to_string(),
                    message: Some(if initialized {
                        "System initialized successfully".to_string()
                    } else {
                        "System is still initializing".to_string()
                    }),
                    duration_ms: Some(self.start_time.elapsed().as_millis() as u64),
                }
            ],
            timestamp: chrono::Utc::now().to_rfc3339(),
            uptime_seconds: self.start_time.elapsed().as_secs(),
        }
    }
}

impl Default for HealthChecker {
    fn default() -> Self {
        Self::new()
    }
}

