//! MCP Client
//! 
//! Client for interacting with MCP servers from the AI Planner

use std::collections::HashMap;

use super::types::{
    Tool, Resource, Prompt, ToolCall, ToolResult, ResourceContent,
    MCPCapabilities, MCPError,
};
use super::server::MCPServer;

/// MCP Client for AI Planner integration
pub struct MCPClient {
    server: MCPServer,
}

impl MCPClient {
    /// Create a new MCP client with default servers
    pub fn new() -> Self {
        Self {
            server: MCPServer::with_defaults(),
        }
    }
    
    /// Create a new MCP client with custom server
    pub fn with_server(server: MCPServer) -> Self {
        Self { server }
    }
    
    /// List all available tools across all servers
    pub fn list_tools(&self) -> Vec<Tool> {
        self.server.registry.all_tools()
    }
    
    /// List all available resources across all servers
    pub fn list_resources(&self) -> Vec<Resource> {
        self.server.registry.all_resources()
    }
    
    /// Get full capabilities from all servers
    pub fn get_capabilities(&self) -> HashMap<String, MCPCapabilities> {
        self.server.get_all_capabilities()
    }
    
    /// Call a tool on a specific server
    pub async fn call_tool(&self, server_name: &str, call: ToolCall) -> Result<ToolResult, MCPError> {
        self.server.call_tool(server_name, call).await
    }
    
    /// Read a resource from a specific server
    pub async fn read_resource(&self, server_name: &str, uri: &str) -> Result<ResourceContent, MCPError> {
        self.server.read_resource(server_name, uri).await
    }
    
    /// Format tools for inclusion in LLM prompt
    pub fn format_tools_for_prompt(&self) -> String {
        let tools = self.list_tools();
        
        if tools.is_empty() {
            return String::new();
        }
        
        let mut prompt = String::from("## AVAILABLE MCP TOOLS\n\n");
        prompt.push_str("You can use these tools to gather information and perform actions:\n\n");
        
        for tool in tools {
            prompt.push_str(&format!("### {}\n", tool.name));
            prompt.push_str(&format!("{}\n\n", tool.description));
            
            if tool.requires_approval {
                prompt.push_str("⚠️ **Requires approval before execution**\n\n");
            }
            
            prompt.push_str("**Input Schema:**\n```json\n");
            prompt.push_str(&serde_json::to_string_pretty(&tool.input_schema).unwrap_or_default());
            prompt.push_str("\n```\n\n");
            
            if !tool.tags.is_empty() {
                prompt.push_str(&format!("**Tags:** {}\n\n", tool.tags.join(", ")));
            }
        }
        
        prompt
    }
    
    /// Format resources for inclusion in LLM prompt
    pub fn format_resources_for_prompt(&self) -> String {
        let resources = self.list_resources();
        
        if resources.is_empty() {
            return String::new();
        }
        
        let mut prompt = String::from("## AVAILABLE MCP RESOURCES\n\n");
        prompt.push_str("You can read these resources to get context:\n\n");
        
        for resource in resources {
            prompt.push_str(&format!("### {}\n", resource.name));
            prompt.push_str(&format!("**URI:** `{}`\n", resource.uri));
            
            if let Some(desc) = &resource.description {
                prompt.push_str(&format!("{}\n", desc));
            }
            
            prompt.push_str(&format!("**Type:** {}\n\n", resource.mime_type));
            
            if !resource.tags.is_empty() {
                prompt.push_str(&format!("**Tags:** {}\n\n", resource.tags.join(", ")));
            }
        }
        
        prompt
    }
    
    /// Get combined context for AI Planner
    /// Returns both tools and resources formatted for LLM prompt
    pub fn get_context_for_planner(&self) -> String {
        let mut context = String::new();
        
        let tools = self.format_tools_for_prompt();
        if !tools.is_empty() {
            context.push_str(&tools);
            context.push_str("\n---\n\n");
        }
        
        let resources = self.format_resources_for_prompt();
        if !resources.is_empty() {
            context.push_str(&resources);
        }
        
        context
    }
}

impl Default for MCPClient {
    fn default() -> Self {
        Self::new()
    }
}

