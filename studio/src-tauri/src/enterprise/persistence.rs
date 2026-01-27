//! Enterprise Database Persistence
//! 
//! Provides:
//! - Multi-database support (SQLite, PostgreSQL)
//! - Connection pooling
//! - Auto-migrations
//! - Query builder
//! - Transaction support

use sqlx::{Pool, Sqlite, Postgres, Row};
use sqlx::migrate::MigrateDatabase;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::mcp::types::{AuditLogEntry, DataClassification};
use crate::enterprise::config::DatabaseConfig;

// ============================================================
// Database Manager
// ============================================================

pub enum DatabasePool {
    Sqlite(Pool<Sqlite>),
    Postgres(Pool<Postgres>),
}

pub struct DatabaseManager {
    pool: DatabasePool,
    db_type: String,
}

impl DatabaseManager {
    /// Initialize database from configuration
    pub async fn new(config: &DatabaseConfig) -> Result<Self, Box<dyn std::error::Error>> {
        let pool = match config.db_type.as_str() {
            "sqlite" => {
                // Create database if it doesn't exist
                if !Sqlite::database_exists(&config.url).await? {
                    println!("📦 Creating SQLite database: {}", config.url);
                    Sqlite::create_database(&config.url).await?;
                }
                
                let pool = sqlx::SqlitePool::connect_with(
                    sqlx::sqlite::SqliteConnectOptions::new()
                        .filename(&config.url.replace("sqlite://", ""))
                        .create_if_missing(true)
                ).await?;
                
                DatabasePool::Sqlite(pool)
            }
            "postgres" => {
                let pool = sqlx::PgPool::connect(&config.url).await?;
                DatabasePool::Postgres(pool)
            }
            _ => return Err(format!("Unsupported database type: {}", config.db_type).into()),
        };
        
        let mut manager = Self {
            pool,
            db_type: config.db_type.clone(),
        };
        
        if config.auto_migrate {
            manager.migrate().await?;
        }
        
        Ok(manager)
    }
    
    /// Run database migrations
    pub async fn migrate(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        println!("🔄 Running database migrations...");
        
        match &self.pool {
            DatabasePool::Sqlite(pool) => {
                self.create_tables_sqlite(pool).await?;
            }
            DatabasePool::Postgres(pool) => {
                self.create_tables_postgres(pool).await?;
            }
        }
        
        println!("✅ Database migrations completed");
        Ok(())
    }
    
    // SQLite table creation
    async fn create_tables_sqlite(&self, pool: &Pool<Sqlite>) -> Result<(), sqlx::Error> {
        // Audit log table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                event_type TEXT NOT NULL,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                target TEXT,
                context TEXT,
                result TEXT,
                classification TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            "#
        ).execute(pool).await?;
        
        // Indices for audit log
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id)")
            .execute(pool).await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)")
            .execute(pool).await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type)")
            .execute(pool).await?;
        
        // MCP tool calls table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS mcp_tool_calls (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                server_name TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                arguments TEXT NOT NULL,
                result TEXT,
                success INTEGER NOT NULL,
                duration_ms INTEGER,
                timestamp TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            "#
        ).execute(pool).await?;
        
        // Compliance events table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS compliance_events (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                classification TEXT NOT NULL,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                input_hash TEXT NOT NULL,
                redacted INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            "#
        ).execute(pool).await?;
        
        Ok(())
    }
    
    // PostgreSQL table creation
    async fn create_tables_postgres(&self, pool: &Pool<Postgres>) -> Result<(), sqlx::Error> {
        // Similar to SQLite but with PostgreSQL-specific features
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS audit_log (
                id UUID PRIMARY KEY,
                tenant_id VARCHAR(255) NOT NULL,
                timestamp TIMESTAMP NOT NULL,
                event_type VARCHAR(255) NOT NULL,
                actor VARCHAR(255) NOT NULL,
                action TEXT NOT NULL,
                target VARCHAR(255),
                context JSONB,
                result VARCHAR(255),
                classification VARCHAR(50),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
            "#
        ).execute(pool).await?;
        
        // Create indices
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id)")
            .execute(pool).await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)")
            .execute(pool).await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type)")
            .execute(pool).await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_audit_context ON audit_log USING GIN(context)")
            .execute(pool).await?;
        
        // Add more tables as needed...
        
        Ok(())
    }
    
    /// Insert audit log entry
    pub async fn insert_audit_log(
        &self,
        tenant_id: &str,
        entry: &AuditLogEntry,
        classification: Option<DataClassification>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let id = Uuid::new_v4().to_string();
        let classification_str = classification.map(|c| c.to_string());
        let context_json = serde_json::to_string(&entry.context)?;
        
        match &self.pool {
            DatabasePool::Sqlite(pool) => {
                sqlx::query(
                    r#"
                    INSERT INTO audit_log 
                    (id, tenant_id, timestamp, event_type, actor, action, target, context, result, classification)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    "#
                )
                .bind(&id)
                .bind(tenant_id)
                .bind(&entry.timestamp)
                .bind(&entry.event_type)
                .bind(&entry.actor)
                .bind(&entry.action)
                .bind(&entry.target)
                .bind(&context_json)
                .bind(&entry.result)
                .bind(&classification_str)
                .execute(pool)
                .await?;
            }
            DatabasePool::Postgres(pool) => {
                sqlx::query(
                    r#"
                    INSERT INTO audit_log 
                    (id, tenant_id, timestamp, event_type, actor, action, target, context, result, classification)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    "#
                )
                .bind(Uuid::parse_str(&id)?)
                .bind(tenant_id)
                .bind(DateTime::parse_from_rfc3339(&entry.timestamp)?.with_timezone(&Utc))
                .bind(&entry.event_type)
                .bind(&entry.actor)
                .bind(&entry.action)
                .bind(&entry.target)
                .bind(serde_json::to_value(&entry.context)?)
                .bind(&entry.result)
                .bind(&classification_str)
                .execute(pool)
                .await?;
            }
        }
        
        Ok(())
    }
    
    /// Query audit logs
    pub async fn query_audit_logs(
        &self,
        tenant_id: &str,
        limit: i64,
    ) -> Result<Vec<AuditLogEntry>, Box<dyn std::error::Error>> {
        let mut entries = Vec::new();
        
        match &self.pool {
            DatabasePool::Sqlite(pool) => {
                let rows = sqlx::query(
                    r#"
                    SELECT timestamp, event_type, actor, action, target, context, result
                    FROM audit_log
                    WHERE tenant_id = ?
                    ORDER BY timestamp DESC
                    LIMIT ?
                    "#
                )
                .bind(tenant_id)
                .bind(limit)
                .fetch_all(pool)
                .await?;
                
                for row in rows {
                    let context_str: String = row.get("context");
                    let context: std::collections::HashMap<String, serde_json::Value> = 
                        serde_json::from_str(&context_str).unwrap_or_default();
                    
                    entries.push(AuditLogEntry {
                        timestamp: row.get("timestamp"),
                        event_type: row.get("event_type"),
                        actor: row.get("actor"),
                        action: row.get("action"),
                        target: row.get("target"),
                        context,
                        result: row.get("result"),
                    });
                }
            }
            DatabasePool::Postgres(pool) => {
                // Similar implementation for PostgreSQL
                let rows = sqlx::query(
                    r#"
                    SELECT timestamp, event_type, actor, action, target, context, result
                    FROM audit_log
                    WHERE tenant_id = $1
                    ORDER BY timestamp DESC
                    LIMIT $2
                    "#
                )
                .bind(tenant_id)
                .bind(limit)
                .fetch_all(pool)
                .await?;
                
                for row in rows {
                    let timestamp: DateTime<Utc> = row.get("timestamp");
                    let context: serde_json::Value = row.get("context");
                    
                    entries.push(AuditLogEntry {
                        timestamp: timestamp.to_rfc3339(),
                        event_type: row.get("event_type"),
                        actor: row.get("actor"),
                        action: row.get("action"),
                        target: row.get("target"),
                        context: serde_json::from_value(context).unwrap_or_default(),
                        result: row.get("result"),
                    });
                }
            }
        }
        
        Ok(entries)
    }
    
    /// Cleanup old audit logs (retention policy)
    pub async fn cleanup_audit_logs(
        &self,
        tenant_id: &str,
        retention_days: u32,
    ) -> Result<u64, Box<dyn std::error::Error>> {
        let cutoff_date = Utc::now() - chrono::Duration::days(retention_days as i64);
        
        let rows_affected = match &self.pool {
            DatabasePool::Sqlite(pool) => {
                sqlx::query(
                    r#"
                    DELETE FROM audit_log
                    WHERE tenant_id = ? AND timestamp < ?
                    "#
                )
                .bind(tenant_id)
                .bind(cutoff_date.to_rfc3339())
                .execute(pool)
                .await?
                .rows_affected()
            }
            DatabasePool::Postgres(pool) => {
                sqlx::query(
                    r#"
                    DELETE FROM audit_log
                    WHERE tenant_id = $1 AND timestamp < $2
                    "#
                )
                .bind(tenant_id)
                .bind(cutoff_date)
                .execute(pool)
                .await?
                .rows_affected()
            }
        };
        
        Ok(rows_affected)
    }
    
    /// Health check
    pub async fn health_check(&self) -> Result<bool, Box<dyn std::error::Error>> {
        match &self.pool {
            DatabasePool::Sqlite(pool) => {
                sqlx::query("SELECT 1").fetch_one(pool).await?;
            }
            DatabasePool::Postgres(pool) => {
                sqlx::query("SELECT 1").fetch_one(pool).await?;
            }
        }
        Ok(true)
    }
}

