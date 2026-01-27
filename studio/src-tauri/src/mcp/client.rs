//! MCP Client
//! 
//! Client for connecting to EXTERNAL MCP servers (e.g., Orchestrator)
//! Studio does NOT implement MCP servers - it only consumes them.

use serde::{Deserialize, Serialize};

use super::types::{
    Tool, Resource, ToolCall, ToolResult, ResourceContent,
    MCPError,
};

/// Configuration for an external MCP server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPServerConfig {
    pub name: String,
    pub url: String,
    pub api_key: Option<String>,
}

/// MCP Client for connecting to external servers
/// 
/// Studio uses this to connect to Orchestrator's MCP servers for:
/// - Compliance checks (HIPAA, SOC 2, etc)
/// - Context-aware AI suggestions
/// - Enterprise features
pub struct MCPClient {
    servers: Vec<MCPServerConfig>,
    // HTTP client for making requests
    client: reqwest::Client,
}

impl MCPClient {
    /// Create a new MCP client (no servers configured)
    pub fn new() -> Self {
        Self {
            servers: Vec::new(),
            client: reqwest::Client::new(),
        }
    }
    
    /// Add an external server to connect to
    pub fn add_server(&mut self, config: MCPServerConfig) {
        self.servers.push(config);
    }
    
    /// List all configured servers
    pub fn list_servers(&self) -> Vec<String> {
        self.servers.iter().map(|s| s.name.clone()).collect()
    }
    
    /// Check if client has any servers configured
    pub fn is_connected(&self) -> bool {
        !self.servers.is_empty()
    }
    
    /// List all available tools from all servers
    pub async fn list_tools(&self) -> Result<Vec<Tool>, MCPError> {
        let mut tools = Vec::new();
        
        for server in &self.servers {
            match self.fetch_tools_from_server(server).await {
                Ok(server_tools) => tools.extend(server_tools),
                Err(e) => {
                    eprintln!("Failed to fetch tools from {}: {:?}", server.name, e);
                    // Continue to next server instead of failing
                }
            }
        }
        
        Ok(tools)
    }
    
    async fn fetch_tools_from_server(&self, server: &MCPServerConfig) -> Result<Vec<Tool>, MCPError> {
        let url = format!("{}/api/v1/mcp/tools", server.url);
        let mut request = self.client.get(&url);
        
        if let Some(api_key) = &server.api_key {
            request = request.header("x-api-key", api_key);
        }
        
        let response = request
            .send()
            .await
            .map_err(|e| MCPError::InternalError(format!("HTTP request failed: {}", e)))?;
            
        if !response.status().is_success() {
            return Err(MCPError::InternalError(
                format!("Server returned error: {}", response.status())
            ));
        }
        
        #[derive(Deserialize)]
        struct ToolsResponse {
            tools: Vec<Tool>,
        }
        
        let response_data: ToolsResponse = response
            .json()
            .await
            .map_err(|e| MCPError::InternalError(format!("JSON parse failed: {}", e)))?;
            
        Ok(response_data.tools)
    }
    
    /// List all available resources from all servers
    pub async fn list_resources(&self) -> Result<Vec<Resource>, MCPError> {
        let mut resources = Vec::new();
        
        for server in &self.servers {
            match self.fetch_resources_from_server(server).await {
                Ok(server_resources) => resources.extend(server_resources),
                Err(e) => {
                    eprintln!("Failed to fetch resources from {}: {:?}", server.name, e);
                }
            }
        }
        
        Ok(resources)
    }
    
    async fn fetch_resources_from_server(&self, server: &MCPServerConfig) -> Result<Vec<Resource>, MCPError> {
        let url = format!("{}/api/v1/mcp/resources", server.url);
        let mut request = self.client.get(&url);
        
        if let Some(api_key) = &server.api_key {
            request = request.header("x-api-key", api_key);
        }
        
        let response = request
            .send()
            .await
            .map_err(|e| MCPError::InternalError(format!("HTTP request failed: {}", e)))?;
            
        if !response.status().is_success() {
            return Err(MCPError::InternalError(
                format!("Server returned error: {}", response.status())
            ));
        }
        
        #[derive(Deserialize)]
        struct ResourcesResponse {
            resources: Vec<Resource>,
        }
        
        let response_data: ResourcesResponse = response
            .json()
            .await
            .map_err(|e| MCPError::InternalError(format!("JSON parse failed: {}", e)))?;
            
        Ok(response_data.resources)
    }
    
    /// Call a tool on a specific server
    pub async fn call_tool(&self, server_name: &str, call: ToolCall) -> Result<ToolResult, MCPError> {
        let server = self.servers
            .iter()
            .find(|s| s.name == server_name)
            .ok_or_else(|| MCPError::ServerNotFound(server_name.to_string()))?;
        
        let url = format!("{}/api/v1/mcp/tools/call", server.url);
        let mut request = self.client.post(&url).json(&call);
        
        if let Some(api_key) = &server.api_key {
            request = request.header("x-api-key", api_key);
        }
        
        let response = request
            .send()
            .await
            .map_err(|e| MCPError::InternalError(format!("HTTP request failed: {}", e)))?;
            
        if !response.status().is_success() {
            return Err(MCPError::InternalError(
                format!("Server returned error: {}", response.status())
            ));
        }
        
        let result: ToolResult = response
            .json()
            .await
            .map_err(|e| MCPError::InternalError(format!("JSON parse failed: {}", e)))?;
            
        Ok(result)
    }
    
    /// Read a resource from a specific server
    pub async fn read_resource(&self, server_name: &str, uri: &str) -> Result<ResourceContent, MCPError> {
        let server = self.servers
            .iter()
            .find(|s| s.name == server_name)
            .ok_or_else(|| MCPError::ServerNotFound(server_name.to_string()))?;
        
        let encoded_uri = urlencoding::encode(uri);
        let url = format!("{}/api/v1/mcp/resources/{}", server.url, encoded_uri);
        let mut request = self.client.get(&url);
        
        if let Some(api_key) = &server.api_key {
            request = request.header("x-api-key", api_key);
        }
        
        let response = request
            .send()
            .await
            .map_err(|e| MCPError::InternalError(format!("HTTP request failed: {}", e)))?;
            
        if !response.status().is_success() {
            return Err(MCPError::InternalError(
                format!("Server returned error: {}", response.status())
            ));
        }
        
        let content: ResourceContent = response
            .json()
            .await
            .map_err(|e| MCPError::InternalError(format!("JSON parse failed: {}", e)))?;
            
        Ok(content)
    }
    
    /// Format tools for inclusion in LLM prompt
    /// 
    /// Returns empty string if no servers configured or no tools available
    pub async fn format_tools_for_prompt(&self) -> String {
        match self.list_tools().await {
            Ok(tools) if !tools.is_empty() => {
                let mut prompt = String::from("## AVAILABLE MCP TOOLS\n\n");
                prompt.push_str("You can use these tools from connected MCP servers:\n\n");
                
                for tool in tools {
                    prompt.push_str(&format!("### {}\n", tool.name));
                    prompt.push_str(&format!("{}\n\n", tool.description));
                    
                    prompt.push_str("**Input Schema:**\n```json\n");
                    prompt.push_str(&serde_json::to_string_pretty(&tool.input_schema).unwrap_or_default());
                    prompt.push_str("\n```\n\n");
                }
                
                prompt
            }
            _ => String::new()
        }
    }
    
    /// Format resources for inclusion in LLM prompt
    pub async fn format_resources_for_prompt(&self) -> String {
        match self.list_resources().await {
            Ok(resources) if !resources.is_empty() => {
                let mut prompt = String::from("## AVAILABLE MCP RESOURCES\n\n");
                prompt.push_str("You can read these resources from connected MCP servers:\n\n");
                
                for resource in resources {
                    prompt.push_str(&format!("### {}\n", resource.name));
                    prompt.push_str(&format!("**URI:** `{}`\n", resource.uri));
                    
                    if let Some(desc) = &resource.description {
                        prompt.push_str(&format!("{}\n", desc));
                    }
                    
                    prompt.push_str(&format!("**Type:** {}\n\n", resource.mime_type));
                }
                
                prompt
            }
            _ => String::new()
        }
    }
    
    /// Get combined context for AI Planner
    /// 
    /// Returns both tools and resources formatted for LLM prompt
    /// Returns empty string if no servers configured
    pub async fn get_context_for_planner(&self) -> String {
        if !self.is_connected() {
            return String::new();
        }
        
        let mut context = String::new();
        
        let tools = self.format_tools_for_prompt().await;
        if !tools.is_empty() {
            context.push_str(&tools);
            context.push_str("\n---\n\n");
        }
        
        let resources = self.format_resources_for_prompt().await;
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

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_client_creation() {
        let client = MCPClient::new();
        assert!(!client.is_connected());
        assert_eq!(client.list_servers().len(), 0);
    }
    
    #[test]
    fn test_add_server() {
        let mut client = MCPClient::new();
        client.add_server(MCPServerConfig {
            name: "orchestrator".to_string(),
            url: "https://orchestrator.example.com".to_string(),
            api_key: Some("key123".to_string()),
        });
        
        assert!(client.is_connected());
        assert_eq!(client.list_servers(), vec!["orchestrator"]);
    }
}
