// LLM Connections Database
// SQLite storage for LLM connection metadata

use rusqlite::{Connection, params};
use anyhow::Result;
use serde_json;
use crate::ai_planner::types::LLMConnection;

pub struct ConnectionsDb {
    conn: Connection,
}

impl ConnectionsDb {
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        
        // Create tables if they don't exist
        conn.execute(
            "CREATE TABLE IF NOT EXISTS llm_connections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                provider TEXT NOT NULL,
                config_json TEXT NOT NULL,
                is_default INTEGER NOT NULL DEFAULT 0,
                last_used_at TEXT,
                health_status_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;
        
        // Create index for faster lookups
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_provider ON llm_connections(provider)",
            [],
        )?;
        
        Ok(Self { conn })
    }
    
    pub fn save_connection(&self, connection: &LLMConnection) -> Result<()> {
        // Serialize config and health_status to JSON
        let config_json = serde_json::to_string(&connection.config)?;
        let health_status_json = connection.health_status
            .as_ref()
            .map(|h| serde_json::to_string(h).ok())
            .flatten();
        
        self.conn.execute(
            "INSERT OR REPLACE INTO llm_connections 
             (id, name, provider, config_json, is_default, last_used_at, 
              health_status_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                &connection.id,
                &connection.name,
                &connection.provider,
                &config_json,
                if connection.is_default { 1 } else { 0 },
                &connection.last_used_at,
                &health_status_json,
                &connection.created_at,
                &connection.updated_at,
            ],
        )?;
        
        Ok(())
    }
    
    pub fn load_all_connections(&self) -> Result<Vec<LLMConnection>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, provider, config_json, is_default, last_used_at, 
                    health_status_json, created_at, updated_at 
             FROM llm_connections 
             ORDER BY is_default DESC, created_at DESC"
        )?;
        
        let connections = stmt.query_map([], |row| {
            let config_json: String = row.get(3)?;
            let health_status_json: Option<String> = row.get(6)?;
            
            let config = serde_json::from_str(&config_json)
                .map_err(|_| rusqlite::Error::InvalidQuery)?;
            
            let health_status = health_status_json
                .and_then(|json| serde_json::from_str(&json).ok());
            
            Ok(LLMConnection {
                id: row.get(0)?,
                name: row.get(1)?,
                provider: row.get(2)?,
                config,
                is_default: row.get::<_, i32>(4)? != 0,
                last_used_at: row.get(5)?,
                health_status,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(connections)
    }
    
    /// Load a specific connection by ID (reserved for future features)
    #[allow(dead_code)]
    pub fn load_connection(&self, id: &str) -> Result<Option<LLMConnection>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, provider, config_json, is_default, last_used_at, 
                    health_status_json, created_at, updated_at 
             FROM llm_connections 
             WHERE id = ?1"
        )?;
        
        let mut rows = stmt.query(params![id])?;
        
        if let Some(row) = rows.next()? {
            let config_json: String = row.get(3)?;
            let health_status_json: Option<String> = row.get(6)?;
            
            let config = serde_json::from_str(&config_json)?;
            let health_status = health_status_json
                .and_then(|json| serde_json::from_str(&json).ok());
            
            Ok(Some(LLMConnection {
                id: row.get(0)?,
                name: row.get(1)?,
                provider: row.get(2)?,
                config,
                is_default: row.get::<_, i32>(4)? != 0,
                last_used_at: row.get(5)?,
                health_status,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            }))
        } else {
            Ok(None)
        }
    }
    
    pub fn delete_connection(&self, id: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM llm_connections WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }
    
    pub fn set_default_connection(&self, id: &str) -> Result<()> {
        // First, unset all defaults
        self.conn.execute(
            "UPDATE llm_connections SET is_default = 0",
            [],
        )?;
        
        // Then set the specified connection as default
        self.conn.execute(
            "UPDATE llm_connections SET is_default = 1 WHERE id = ?1",
            params![id],
        )?;
        
        Ok(())
    }
    
    /// Update connection health status (reserved for future health checks)
    #[allow(dead_code)]
    pub fn update_health_status(&self, id: &str, health_status_json: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE llm_connections SET health_status_json = ?1, updated_at = ?2 WHERE id = ?3",
            params![health_status_json, chrono::Utc::now().to_rfc3339(), id],
        )?;
        Ok(())
    }
    
    /// Update last used timestamp (reserved for usage analytics)
    #[allow(dead_code)]
    pub fn update_last_used(&self, id: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE llm_connections SET last_used_at = ?1 WHERE id = ?2",
            params![chrono::Utc::now().to_rfc3339(), id],
        )?;
        Ok(())
    }
}

