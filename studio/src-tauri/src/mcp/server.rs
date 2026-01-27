//! MCP Server Trait and Base Implementation
//! 
//! Defines the interface that all MCP servers must implement

use async_trait::async_trait;
use std::collections::HashMap;

use super::types::{
    Tool, Resource, Prompt, ToolCall, ToolResult, ResourceContent,
    MCPCapabilities, ServerMetadata, MCPError,
};

/// Trait that all MCP servers must implement
#[async_trait]
pub trait MCPServerTrait: Send + Sync {
    /// Get server metadata
    fn metadata(&self) -> ServerMetadata;
    
    /// List all available tools
    fn list_tools(&self) -> Vec<Tool>;
    
    /// List all available resources
    fn list_resources(&self) -> Vec<Resource>;
    
    /// List all available prompts
    fn list_prompts(&self) -> Vec<Prompt> {
        Vec::new() // Default: no prompts
    }
    
    /// Execute a tool
    async fn call_tool(&self, call: ToolCall) -> Result<ToolResult, MCPError>;
    
    /// Read a resource
    async fn read_resource(&self, uri: &str) -> Result<ResourceContent, MCPError>;
    
    /// Get full server capabilities
    fn capabilities(&self) -> MCPCapabilities {
        MCPCapabilities {
            tools: self.list_tools(),
            resources: self.list_resources(),
            prompts: self.list_prompts(),
            metadata: self.metadata(),
        }
    }
}

/// MCP Server registry
/// Manages multiple MCP servers
pub struct MCPServerRegistry {
    servers: HashMap<String, Box<dyn MCPServerTrait>>,
}

impl MCPServerRegistry {
    /// Create a new empty registry
    pub fn new() -> Self {
        Self {
            servers: HashMap::new(),
        }
    }
    
    /// Register a new MCP server
    pub fn register(&mut self, name: String, server: Box<dyn MCPServerTrait>) {
        self.servers.insert(name, server);
    }
    
    /// Get a server by name
    pub fn get(&self, name: &str) -> Option<&dyn MCPServerTrait> {
        self.servers.get(name).map(|s| s.as_ref())
    }
    
    /// List all registered servers
    pub fn list_servers(&self) -> Vec<String> {
        self.servers.keys().cloned().collect()
    }
    
    /// Get capabilities from all servers
    pub fn all_capabilities(&self) -> HashMap<String, MCPCapabilities> {
        self.servers
            .iter()
            .map(|(name, server)| (name.clone(), server.capabilities()))
            .collect()
    }
    
    /// List all tools across all servers
    pub fn all_tools(&self) -> Vec<Tool> {
        self.servers
            .values()
            .flat_map(|server| server.list_tools())
            .collect()
    }
    
    /// List all resources across all servers
    pub fn all_resources(&self) -> Vec<Resource> {
        self.servers
            .values()
            .flat_map(|server| server.list_resources())
            .collect()
    }
}

impl Default for MCPServerRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Base MCP server implementation
/// Provides common functionality for all servers
pub struct MCPServer {
    pub registry: MCPServerRegistry,
}

impl MCPServer {
    /// Create a new MCP server manager
    pub fn new() -> Self {
        Self {
            registry: MCPServerRegistry::new(),
        }
    }
    
    /// Initialize with default servers
    pub fn with_defaults() -> Self {
        let mut server = Self::new();
        
        // Register built-in servers
        use crate::mcp::servers::ComplianceMCP;
        
        server.registry.register(
            "compliance".to_string(),
            Box::new(ComplianceMCP::new()),
        );
        
        server
    }
    
    /// Call a tool on any registered server
    pub async fn call_tool(&self, server_name: &str, call: ToolCall) -> Result<ToolResult, MCPError> {
        let server = self.registry.get(server_name)
            .ok_or_else(|| MCPError::ServerNotFound(server_name.to_string()))?;
        
        server.call_tool(call).await
    }
    
    /// Read a resource from any registered server
    pub async fn read_resource(&self, server_name: &str, uri: &str) -> Result<ResourceContent, MCPError> {
        let server = self.registry.get(server_name)
            .ok_or_else(|| MCPError::ServerNotFound(server_name.to_string()))?;
        
        server.read_resource(uri).await
    }
    
    /// Get all capabilities across all servers
    pub fn get_all_capabilities(&self) -> HashMap<String, MCPCapabilities> {
        self.registry.all_capabilities()
    }
}

impl Default for MCPServer {
    fn default() -> Self {
        Self::new()
    }
}

