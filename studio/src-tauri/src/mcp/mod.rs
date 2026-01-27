//! MCP (Model Context Protocol) Module
//! 
//! This module implements the MCP layer for SkuldBot, enabling the AI Planner
//! to work with tools and resources in a standardized way.
//! 
//! MCP converts SkuldBot into a "cognitive operating layer" for regulated industries,
//! providing:
//! - Dynamic tool discovery and execution
//! - Context-aware resource access
//! - Compliance-first architecture
//! - Auditable operations

pub mod client;
pub mod server;
pub mod types;
pub mod servers;

// Re-exports for convenience
pub use client::MCPClient;
pub use server::{MCPServer, MCPServerTrait};
pub use types::{Tool, ToolCall, Resource, Prompt, MCPCapabilities, MCPError};

