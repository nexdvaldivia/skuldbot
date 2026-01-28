//! MCP (Model Context Protocol) Client Module
//! 
//! This module provides an MCP CLIENT for SkuldBot Studio.
//! Studio can connect to external MCP servers (like Orchestrator's compliance server)
//! to enhance AI Planner with context-aware tools and resources.
//! 
//! Studio does NOT implement MCP servers - it only consumes them.

// Allow unused code - MCP features will be enabled in future releases
#![allow(dead_code)]
#![allow(unused_imports)]

pub mod client;
pub mod types;

// Re-exports for convenience
