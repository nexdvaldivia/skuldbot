//! Compliance MCP Server
//! 
//! Provides compliance-first capabilities for regulated industries:
//! - Data classification (PHI/PII/PCI/None)
//! - LLM routing based on data sensitivity
//! - Redaction of sensitive data
//! - Audit logging
//! 
//! This is the MOST CRITICAL MCP for healthcare, insurance, and financial industries.

use async_trait::async_trait;
use regex::Regex;
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use chrono::Utc;

use crate::mcp::types::{
    Tool, Resource, ToolCall, ToolResult, ResourceContent,
    ServerMetadata, MCPError, DataClassification, LLMRoute, AuditLogEntry,
};
use crate::mcp::server::MCPServerTrait;

/// Compliance MCP Server
/// 
/// This server ensures that all AI operations comply with industry regulations
/// (HIPAA, SOC 2, PCI-DSS, GDPR)
pub struct ComplianceMCP {
    /// Classification patterns (compiled regexes for performance)
    phi_patterns: Vec<Regex>,
    pii_patterns: Vec<Regex>,
    pci_patterns: Vec<Regex>,
    
    /// Audit log storage (in-memory for now, will be persisted later)
    /// Using Arc<Mutex<>> for thread-safe interior mutability
    audit_log: Arc<Mutex<Vec<AuditLogEntry>>>,
    
    /// Compliance policies (loaded from config/vault)
    policies: CompliancePolicies,
}

/// Compliance policies configuration
#[derive(Debug, Clone)]
pub struct CompliancePolicies {
    /// PHI data must use Azure OpenAI in customer tenant
    pub phi_llm_provider: String,
    pub phi_llm_model: String,
    pub phi_base_url: Option<String>,
    
    /// PII data can use Azure OpenAI or Anthropic with redaction
    pub pii_llm_provider: String,
    pub pii_llm_model: String,
    pub pii_base_url: Option<String>,
    
    /// PCI data must use local/on-prem models only
    pub pci_llm_provider: String,
    pub pci_llm_model: String,
    pub pci_base_url: Option<String>,
    
    /// Non-sensitive data can use any provider
    pub default_llm_provider: String,
    pub default_llm_model: String,
    pub default_base_url: Option<String>,
    
    /// Retention policy (days)
    pub audit_retention_days: u32,
    pub log_retention_days: u32,
    
    /// Redaction settings
    pub redaction_char: String,
    pub preserve_format: bool,
}

impl Default for CompliancePolicies {
    fn default() -> Self {
        Self {
            // PHI: Azure OpenAI in customer tenant (most secure)
            phi_llm_provider: "azure_openai".to_string(),
            phi_llm_model: "gpt-4o".to_string(),
            phi_base_url: None, // Must be configured per customer
            
            // PII: Azure OpenAI or Anthropic
            pii_llm_provider: "azure_openai".to_string(),
            pii_llm_model: "gpt-4o".to_string(),
            pii_base_url: None,
            
            // PCI: Local models only
            pci_llm_provider: "local".to_string(),
            pci_llm_model: "llama3.1:70b".to_string(),
            pci_base_url: Some("http://localhost:11434".to_string()),
            
            // Default: OpenAI (for non-sensitive)
            default_llm_provider: "openai".to_string(),
            default_llm_model: "gpt-4o".to_string(),
            default_base_url: None,
            
            // Retention
            audit_retention_days: 2555, // 7 years (regulatory requirement)
            log_retention_days: 90,
            
            // Redaction
            redaction_char: "█".to_string(),
            preserve_format: true,
        }
    }
}

impl ComplianceMCP {
    /// Create a new Compliance MCP server with default policies
    pub fn new() -> Self {
        Self::with_policies(CompliancePolicies::default())
    }
    
    /// Create a new Compliance MCP server with custom policies
    pub fn with_policies(policies: CompliancePolicies) -> Self {
        Self {
            // PHI patterns (Protected Health Information - HIPAA)
            phi_patterns: vec![
                // Medical Record Numbers
                Regex::new(r"\b(?:MRN|Medical Record|Patient ID)[:\s]+\d{6,10}\b").unwrap(),
                // ICD codes
                Regex::new(r"\b[A-Z]\d{2}(?:\.\d{1,4})?\b").unwrap(),
                // Diagnosis mentions
                Regex::new(r"(?i)\b(?:diagnosis|diagnosed with|condition|disease|disorder)[:\s]+[A-Za-z\s]{3,50}\b").unwrap(),
            ],
            
            // PII patterns (Personally Identifiable Information - GDPR)
            pii_patterns: vec![
                // Email addresses
                Regex::new(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b").unwrap(),
                // Phone numbers (US format)
                Regex::new(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b").unwrap(),
                // SSN (US Social Security Number)
                Regex::new(r"\b\d{3}-\d{2}-\d{4}\b").unwrap(),
                // Names (simple pattern - firstname lastname)
                // Note: This is overly broad, but better safe than sorry
                Regex::new(r"\b[A-Z][a-z]+ [A-Z][a-z]+\b").unwrap(),
                // Addresses
                Regex::new(r"\d{1,5}\s+([A-Z][a-z]*\s*)+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir)\b").unwrap(),
            ],
            
            // PCI patterns (Payment Card Industry data)
            pci_patterns: vec![
                // Credit card numbers (simplified - matches 13-19 digit sequences)
                Regex::new(r"\b(?:\d{4}[-\s]?){3}\d{1,7}\b").unwrap(),
                // CVV
                Regex::new(r"\b(?:CVV|CVC|Security Code)[:\s]+\d{3,4}\b").unwrap(),
                // Expiration date
                Regex::new(r"\b(?:EXP|Expiration)[:\s]+\d{2}/\d{2,4}\b").unwrap(),
            ],
            
            audit_log: Arc::new(Mutex::new(Vec::new())),
            policies,
        }
    }
    
    /// Classify data sensitivity
    fn classify_internal(&self, text: &str) -> DataClassification {
        // Priority order: PCI > PHI > PII > None
        // (Most sensitive first)
        
        // Check for PCI data (credit cards, payment info)
        for pattern in &self.pci_patterns {
            if pattern.is_match(text) {
                return DataClassification::PCI;
            }
        }
        
        // Check for PHI data (medical records, diagnoses)
        for pattern in &self.phi_patterns {
            if pattern.is_match(text) {
                return DataClassification::PHI;
            }
        }
        
        // Check for PII data (names, emails, addresses)
        for pattern in &self.pii_patterns {
            if pattern.is_match(text) {
                return DataClassification::PII;
            }
        }
        
        DataClassification::None
    }
    
    /// Route LLM based on data classification
    fn route_llm_internal(&self, classification: DataClassification) -> LLMRoute {
        match classification {
            DataClassification::PHI => LLMRoute {
                provider: self.policies.phi_llm_provider.clone(),
                model: self.policies.phi_llm_model.clone(),
                base_url: self.policies.phi_base_url.clone(),
                config: HashMap::from([
                    ("logging".to_string(), json!("minimal")),
                    ("redact_logs".to_string(), json!(true)),
                ]),
                reason: "PHI detected - using Azure OpenAI in customer tenant (HIPAA compliant)".to_string(),
            },
            DataClassification::PII => LLMRoute {
                provider: self.policies.pii_llm_provider.clone(),
                model: self.policies.pii_llm_model.clone(),
                base_url: self.policies.pii_base_url.clone(),
                config: HashMap::from([
                    ("redact_logs".to_string(), json!(true)),
                ]),
                reason: "PII detected - using Azure OpenAI with redaction (GDPR compliant)".to_string(),
            },
            DataClassification::PCI => LLMRoute {
                provider: self.policies.pci_llm_provider.clone(),
                model: self.policies.pci_llm_model.clone(),
                base_url: self.policies.pci_base_url.clone(),
                config: HashMap::from([
                    ("logging".to_string(), json!("none")),
                    ("redact_logs".to_string(), json!(true)),
                    ("on_premise".to_string(), json!(true)),
                ]),
                reason: "PCI data detected - using local model only (PCI-DSS compliant)".to_string(),
            },
            DataClassification::None => LLMRoute {
                provider: self.policies.default_llm_provider.clone(),
                model: self.policies.default_llm_model.clone(),
                base_url: self.policies.default_base_url.clone(),
                config: HashMap::new(),
                reason: "No sensitive data detected - using default provider".to_string(),
            },
        }
    }
    
    /// Redact sensitive data
    fn redact_internal(&self, text: &str, level: DataClassification) -> String {
        let mut redacted = text.to_string();
        
        let patterns = match level {
            DataClassification::PHI => &self.phi_patterns,
            DataClassification::PII => &self.pii_patterns,
            DataClassification::PCI => &self.pci_patterns,
            DataClassification::None => return redacted,
        };
        
        for pattern in patterns {
            redacted = pattern.replace_all(&redacted, |caps: &regex::Captures| {
                let matched = caps.get(0).unwrap().as_str();
                if self.policies.preserve_format {
                    // Preserve length and some structure
                    matched.chars().map(|c| {
                        if c.is_whitespace() || c == '-' || c == '/' {
                            c
                        } else {
                            self.policies.redaction_char.chars().next().unwrap_or('█')
                        }
                    }).collect::<String>()
                } else {
                    format!("[REDACTED-{}]", level.to_string().to_uppercase())
                }
            }).to_string();
        }
        
        redacted
    }
    
    /// Add entry to audit log
    fn log_audit(&self, entry: AuditLogEntry) {
        if let Ok(mut log) = self.audit_log.lock() {
            log.push(entry);
            
            // TODO: Persist to database/file
            // TODO: Implement retention policy cleanup
        }
    }
}

impl Default for ComplianceMCP {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl MCPServerTrait for ComplianceMCP {
    fn metadata(&self) -> ServerMetadata {
        ServerMetadata {
            name: "skuldbot-compliance-mcp".to_string(),
            version: "0.1.0".to_string(),
            description: "Compliance-first MCP for regulated industries (HIPAA, SOC 2, PCI-DSS, GDPR)".to_string(),
            vendor: Some("Khipus Group".to_string()),
        }
    }
    
    fn list_tools(&self) -> Vec<Tool> {
        vec![
            Tool {
                name: "classify_sensitivity".to_string(),
                description: "Classify text data sensitivity level (PHI/PII/PCI/None) for compliance routing".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "Text to classify"
                        }
                    },
                    "required": ["text"]
                }),
                requires_approval: false,
                tags: vec!["compliance".to_string(), "classification".to_string()],
            },
            Tool {
                name: "route_llm".to_string(),
                description: "Determine which LLM provider/model to use based on data classification (ensures compliance)".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "classification": {
                            "type": "string",
                            "enum": ["phi", "pii", "pci", "none"],
                            "description": "Data classification level"
                        }
                    },
                    "required": ["classification"]
                }),
                requires_approval: false,
                tags: vec!["compliance".to_string(), "routing".to_string()],
            },
            Tool {
                name: "redact".to_string(),
                description: "Redact sensitive data before logging or transmission (removes PHI/PII/PCI)".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "Text to redact"
                        },
                        "level": {
                            "type": "string",
                            "enum": ["phi", "pii", "pci", "auto"],
                            "description": "Classification level to redact (or 'auto' to detect)"
                        }
                    },
                    "required": ["text", "level"]
                }),
                requires_approval: false,
                tags: vec!["compliance".to_string(), "redaction".to_string()],
            },
            Tool {
                name: "audit_log".to_string(),
                description: "Log an auditable event for compliance tracking (required for SOC 2, HIPAA)".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "event_type": {
                            "type": "string",
                            "description": "Type of event (tool_call, resource_read, llm_route, etc.)"
                        },
                        "actor": {
                            "type": "string",
                            "description": "Who performed the action (user, system, AI)"
                        },
                        "action": {
                            "type": "string",
                            "description": "Action performed"
                        },
                        "target": {
                            "type": "string",
                            "description": "Optional: Target resource/tool"
                        },
                        "context": {
                            "type": "object",
                            "description": "Optional: Additional context"
                        },
                        "result": {
                            "type": "string",
                            "description": "Optional: Result (success/failure)"
                        }
                    },
                    "required": ["event_type", "actor", "action"]
                }),
                requires_approval: false,
                tags: vec!["compliance".to_string(), "audit".to_string()],
            },
        ]
    }
    
    fn list_resources(&self) -> Vec<Resource> {
        vec![
            Resource {
                uri: "compliance://data_classification_policy".to_string(),
                name: "Data Classification Policy".to_string(),
                description: Some("Rules for classifying data as PHI/PII/PCI/None".to_string()),
                mime_type: "application/json".to_string(),
                tags: vec!["compliance".to_string(), "policy".to_string()],
            },
            Resource {
                uri: "compliance://llm_routing_rules".to_string(),
                name: "LLM Routing Rules".to_string(),
                description: Some("Which LLM providers to use for each data classification level".to_string()),
                mime_type: "application/json".to_string(),
                tags: vec!["compliance".to_string(), "routing".to_string()],
            },
            Resource {
                uri: "compliance://retention_policy".to_string(),
                name: "Data Retention Policy".to_string(),
                description: Some("How long to retain audit logs and other data".to_string()),
                mime_type: "application/json".to_string(),
                tags: vec!["compliance".to_string(), "policy".to_string()],
            },
            Resource {
                uri: "compliance://audit_log".to_string(),
                name: "Audit Log".to_string(),
                description: Some("Recent audit log entries (last 100)".to_string()),
                mime_type: "application/json".to_string(),
                tags: vec!["compliance".to_string(), "audit".to_string()],
            },
        ]
    }
    
    async fn call_tool(&self, call: ToolCall) -> Result<ToolResult, MCPError> {
        match call.name.as_str() {
            "classify_sensitivity" => {
                let text = call.arguments["text"]
                    .as_str()
                    .ok_or_else(|| MCPError::InvalidArguments("Missing 'text' argument".to_string()))?;
                
                let classification = self.classify_internal(text);
                
                Ok(ToolResult {
                    success: true,
                    result: Some(json!({
                        "classification": classification,
                        "confidence": 0.95, // TODO: Implement confidence scoring
                    })),
                    error: None,
                    id: call.id,
                })
            },
            
            "route_llm" => {
                let classification_str = call.arguments["classification"]
                    .as_str()
                    .ok_or_else(|| MCPError::InvalidArguments("Missing 'classification' argument".to_string()))?;
                
                let classification = match classification_str.to_lowercase().as_str() {
                    "phi" => DataClassification::PHI,
                    "pii" => DataClassification::PII,
                    "pci" => DataClassification::PCI,
                    "none" => DataClassification::None,
                    _ => return Err(MCPError::InvalidArguments(format!("Invalid classification: {}", classification_str))),
                };
                
                let route = self.route_llm_internal(classification);
                
                Ok(ToolResult {
                    success: true,
                    result: Some(serde_json::to_value(route).unwrap()),
                    error: None,
                    id: call.id,
                })
            },
            
            "redact" => {
                let text = call.arguments["text"]
                    .as_str()
                    .ok_or_else(|| MCPError::InvalidArguments("Missing 'text' argument".to_string()))?;
                
                let level_str = call.arguments["level"]
                    .as_str()
                    .ok_or_else(|| MCPError::InvalidArguments("Missing 'level' argument".to_string()))?;
                
                let level = if level_str.to_lowercase() == "auto" {
                    self.classify_internal(text)
                } else {
                    match level_str.to_lowercase().as_str() {
                        "phi" => DataClassification::PHI,
                        "pii" => DataClassification::PII,
                        "pci" => DataClassification::PCI,
                        _ => return Err(MCPError::InvalidArguments(format!("Invalid level: {}", level_str))),
                    }
                };
                
                let redacted = self.redact_internal(text, level);
                
                Ok(ToolResult {
                    success: true,
                    result: Some(json!({
                        "original_length": text.len(),
                        "redacted_text": redacted,
                        "redacted_length": redacted.len(),
                        "classification": level,
                    })),
                    error: None,
                    id: call.id,
                })
            },
            
            "audit_log" => {
                let event_type = call.arguments["event_type"]
                    .as_str()
                    .ok_or_else(|| MCPError::InvalidArguments("Missing 'event_type' argument".to_string()))?
                    .to_string();
                
                let actor = call.arguments["actor"]
                    .as_str()
                    .ok_or_else(|| MCPError::InvalidArguments("Missing 'actor' argument".to_string()))?
                    .to_string();
                
                let action = call.arguments["action"]
                    .as_str()
                    .ok_or_else(|| MCPError::InvalidArguments("Missing 'action' argument".to_string()))?
                    .to_string();
                
                let target = call.arguments.get("target").and_then(|v| v.as_str()).map(|s| s.to_string());
                let result = call.arguments.get("result").and_then(|v| v.as_str()).map(|s| s.to_string());
                let context = call.arguments.get("context")
                    .and_then(|v| v.as_object())
                    .map(|obj| obj.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
                    .unwrap_or_default();
                
                let entry = AuditLogEntry {
                    timestamp: Utc::now().to_rfc3339(),
                    event_type,
                    actor,
                    action,
                    target,
                    context,
                    result,
                };
                
                // Log the audit entry
                self.log_audit(entry.clone());
                
                Ok(ToolResult {
                    success: true,
                    result: Some(json!({
                        "logged": true,
                        "timestamp": entry.timestamp,
                    })),
                    error: None,
                    id: call.id,
                })
            },
            
            _ => Err(MCPError::ToolNotFound(call.name)),
        }
    }
    
    async fn read_resource(&self, uri: &str) -> Result<ResourceContent, MCPError> {
        match uri {
            "compliance://data_classification_policy" => {
                let policy = json!({
                    "phi": {
                        "description": "Protected Health Information (HIPAA)",
                        "patterns": ["MRN", "Medical Record", "ICD codes", "Diagnoses"],
                        "severity": "critical",
                        "requires": "Azure OpenAI in customer tenant"
                    },
                    "pii": {
                        "description": "Personally Identifiable Information (GDPR)",
                        "patterns": ["Email", "Phone", "SSN", "Names", "Addresses"],
                        "severity": "high",
                        "requires": "Azure OpenAI or Anthropic with redaction"
                    },
                    "pci": {
                        "description": "Payment Card Industry data",
                        "patterns": ["Credit cards", "CVV", "Expiration dates"],
                        "severity": "critical",
                        "requires": "Local/on-premise models only"
                    },
                    "none": {
                        "description": "No sensitive data detected",
                        "severity": "low",
                        "requires": "Any provider"
                    }
                });
                
                Ok(ResourceContent {
                    uri: uri.to_string(),
                    content: serde_json::to_string_pretty(&policy).unwrap(),
                    mime_type: "application/json".to_string(),
                })
            },
            
            "compliance://llm_routing_rules" => {
                let rules = json!({
                    "phi": {
                        "provider": self.policies.phi_llm_provider,
                        "model": self.policies.phi_llm_model,
                        "base_url": self.policies.phi_base_url,
                        "logging": "minimal",
                        "redact_logs": true
                    },
                    "pii": {
                        "provider": self.policies.pii_llm_provider,
                        "model": self.policies.pii_llm_model,
                        "base_url": self.policies.pii_base_url,
                        "redact_logs": true
                    },
                    "pci": {
                        "provider": self.policies.pci_llm_provider,
                        "model": self.policies.pci_llm_model,
                        "base_url": self.policies.pci_base_url,
                        "logging": "none",
                        "on_premise": true
                    },
                    "none": {
                        "provider": self.policies.default_llm_provider,
                        "model": self.policies.default_llm_model,
                        "base_url": self.policies.default_base_url
                    }
                });
                
                Ok(ResourceContent {
                    uri: uri.to_string(),
                    content: serde_json::to_string_pretty(&rules).unwrap(),
                    mime_type: "application/json".to_string(),
                })
            },
            
            "compliance://retention_policy" => {
                let policy = json!({
                    "audit_logs": {
                        "retention_days": self.policies.audit_retention_days,
                        "reason": "SOC 2, HIPAA, PCI-DSS requirements (7 years)"
                    },
                    "execution_logs": {
                        "retention_days": self.policies.log_retention_days,
                        "reason": "Operational troubleshooting"
                    },
                    "artifacts": {
                        "retention_days": 365,
                        "reason": "Business continuity"
                    }
                });
                
                Ok(ResourceContent {
                    uri: uri.to_string(),
                    content: serde_json::to_string_pretty(&policy).unwrap(),
                    mime_type: "application/json".to_string(),
                })
            },
            
            "compliance://audit_log" => {
                let log = self.audit_log.lock().unwrap();
                let recent_logs: Vec<_> = log.iter().rev().take(100).collect();
                let logs_json = serde_json::to_value(recent_logs).unwrap();
                
                Ok(ResourceContent {
                    uri: uri.to_string(),
                    content: serde_json::to_string_pretty(&logs_json).unwrap(),
                    mime_type: "application/json".to_string(),
                })
            },
            
            _ => Err(MCPError::ResourceNotFound(uri.to_string())),
        }
    }
}

// Helper trait to convert DataClassification to string
impl ToString for DataClassification {
    fn to_string(&self) -> String {
        match self {
            DataClassification::PHI => "phi".to_string(),
            DataClassification::PII => "pii".to_string(),
            DataClassification::PCI => "pci".to_string(),
            DataClassification::None => "none".to_string(),
        }
    }
}

