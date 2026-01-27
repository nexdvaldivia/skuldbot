//! MCP Types
//! 
//! Core data structures for the Model Context Protocol implementation

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================
// Core MCP Types (following MCP specification)
// ============================================================

/// MCP Tool definition
/// Tools are executable actions that the AI can invoke
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    /// Unique identifier for the tool
    pub name: String,
    
    /// Human-readable description of what the tool does
    pub description: String,
    
    /// JSON Schema for the tool's input parameters
    #[serde(rename = "inputSchema")]
    pub input_schema: serde_json::Value,
    
    /// Optional: Whether this tool requires approval before execution
    #[serde(default)]
    pub requires_approval: bool,
    
    /// Optional: Tags for categorization (e.g., "compliance", "document", "data")
    #[serde(default)]
    pub tags: Vec<String>,
}

/// MCP Resource definition
/// Resources provide read-only context to the AI (files, configs, policies)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Resource {
    /// Unique URI for the resource (e.g., "compliance://data_classification")
    pub uri: String,
    
    /// Human-readable name
    pub name: String,
    
    /// Optional: Description of what this resource contains
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    
    /// MIME type of the resource content
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    
    /// Optional: Tags for categorization
    #[serde(default)]
    pub tags: Vec<String>,
}

/// MCP Prompt definition
/// Prompts are reusable templates for common tasks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prompt {
    /// Unique identifier for the prompt
    pub name: String,
    
    /// Human-readable description
    pub description: String,
    
    /// The prompt template (may include {{variables}})
    pub template: String,
    
    /// Arguments that can be passed to the prompt
    #[serde(default)]
    pub arguments: Vec<PromptArgument>,
}

/// Argument for a prompt template
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptArgument {
    pub name: String,
    pub description: String,
    pub required: bool,
}

/// Tool call request (when AI wants to execute a tool)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    /// Name of the tool to call
    pub name: String,
    
    /// Arguments to pass to the tool (must match input_schema)
    pub arguments: serde_json::Value,
    
    /// Optional: Unique ID for this call (for tracking/auditing)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

/// Tool call result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    /// Whether the tool execution was successful
    pub success: bool,
    
    /// Result data (if successful)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    
    /// Error message (if failed)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    
    /// Optional: ID matching the ToolCall
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

/// Resource content (when reading a resource)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceContent {
    /// The URI that was requested
    pub uri: String,
    
    /// The actual content
    pub content: String,
    
    /// MIME type of the content
    #[serde(rename = "mimeType")]
    pub mime_type: String,
}

/// MCP server capabilities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPCapabilities {
    /// List of available tools
    pub tools: Vec<Tool>,
    
    /// List of available resources
    pub resources: Vec<Resource>,
    
    /// List of available prompts
    pub prompts: Vec<Prompt>,
    
    /// Server metadata
    pub metadata: ServerMetadata,
}

/// Server metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerMetadata {
    /// Server name (e.g., "skuldbot-compliance-mcp")
    pub name: String,
    
    /// Server version
    pub version: String,
    
    /// Short description
    pub description: String,
    
    /// Optional: Server vendor/author
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vendor: Option<String>,
}

// ============================================================
// SkuldBot-specific extensions
// ============================================================

/// Data classification levels (for compliance)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DataClassification {
    /// Protected Health Information (HIPAA)
    PHI,
    
    /// Personally Identifiable Information (GDPR)
    PII,
    
    /// Payment Card Industry data
    PCI,
    
    /// No sensitive data
    None,
}

/// LLM routing decision (based on data classification)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMRoute {
    /// Which provider to use
    pub provider: String, // "openai", "azure_openai", "anthropic", "local"
    
    /// Which model to use
    pub model: String,
    
    /// Optional: Base URL (for Azure or local)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    
    /// Optional: Additional config
    #[serde(default)]
    pub config: HashMap<String, serde_json::Value>,
    
    /// Reason for this routing decision
    pub reason: String,
}

/// Audit log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogEntry {
    /// Timestamp (ISO 8601)
    pub timestamp: String,
    
    /// Event type (e.g., "tool_call", "resource_read", "llm_route")
    pub event_type: String,
    
    /// Actor (user, system, or AI)
    pub actor: String,
    
    /// Action performed
    pub action: String,
    
    /// Optional: Target resource/tool
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    
    /// Optional: Additional context
    #[serde(default)]
    pub context: HashMap<String, serde_json::Value>,
    
    /// Optional: Result (success/failure)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
}

// ============================================================
// Error types
// ============================================================

/// MCP-specific errors
#[derive(Debug, thiserror::Error)]
pub enum MCPError {
    #[error("Server not found: {0}")]
    ServerNotFound(String),
    
    #[error("Tool not found: {0}")]
    ToolNotFound(String),
    
    #[error("Resource not found: {0}")]
    ResourceNotFound(String),
    
    #[error("Invalid tool arguments: {0}")]
    InvalidArguments(String),
    
    #[error("Tool execution failed: {0}")]
    ExecutionFailed(String),
    
    #[error("Permission denied: {0}")]
    PermissionDenied(String),
    
    #[error("Approval required for tool: {0}")]
    ApprovalRequired(String),
    
    #[error("Serialization error: {0}")]
    SerializationError(String),
    
    #[error("IO error: {0}")]
    IoError(String),
}

// Implement From for common error types
impl From<serde_json::Error> for MCPError {
    fn from(err: serde_json::Error) -> Self {
        MCPError::SerializationError(err.to_string())
    }
}

impl From<std::io::Error> for MCPError {
    fn from(err: std::io::Error) -> Self {
        MCPError::IoError(err.to_string())
    }
}

