//! MCP (Model Context Protocol) Client Module
//! 
//! This module provides an MCP CLIENT for SkuldBot Studio.
//! Studio can connect to external MCP servers (like Orchestrator's compliance server)
//! to enhance AI Planner with context-aware tools and resources.
//! 
//! Studio does NOT implement MCP servers - it only consumes them.

pub mod client;
pub mod types;

// Re-exports for convenience
pub use client::MCPClient;
pub use types::{Tool, ToolCall, Resource, MCPError};

