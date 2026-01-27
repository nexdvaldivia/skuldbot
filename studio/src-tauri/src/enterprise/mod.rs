//! Enterprise Module
//! 
//! Enterprise-grade features:
//! - Configuration management
//! - Database persistence
//! - Multi-tenancy
//! - Secrets management
//! - Observability
//! - Resilience patterns
//! - Health checks

pub mod config;
pub mod persistence;
pub mod telemetry;
pub mod resilience;
pub mod health;

// Re-exports
pub use config::{AppConfig, ConfigManager, TenantConfig};
pub use persistence::DatabaseManager;
pub use telemetry::{MetricsRegistry, init_logging, HealthMetrics};
pub use resilience::{CircuitBreaker, RetryPolicy, RateLimiterManager, ResilientExecutor};
pub use health::{HealthChecker, HealthStatus};

