"""
Evidence Pack Data Models

Modelos de datos para el Evidence Pack.
IMPORTANTE: Ningún modelo almacena PII/PHI en crudo.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
import uuid


class Classification(Enum):
    """Data classification levels"""
    UNCLASSIFIED = "UNCLASSIFIED"
    PII = "PII"
    PHI = "PHI"
    PCI = "PCI"
    CREDENTIALS = "CREDENTIALS"


class DecisionType(Enum):
    """Types of agent decisions"""
    CLASSIFICATION = "classification"      # Data classification decision
    ROUTING = "routing"                    # Flow routing decision
    EXTRACTION = "extraction"              # Data extraction decision
    VALIDATION = "validation"              # Data validation decision
    TRANSFORMATION = "transformation"      # Data transformation decision
    APPROVAL = "approval"                  # Human approval request
    ERROR_HANDLING = "error_handling"      # Error handling decision


class ComplianceStatus(Enum):
    """Compliance check status"""
    PASSED = "passed"
    FAILED = "failed"
    WARNING = "warning"
    SKIPPED = "skipped"


@dataclass
class DataLineageEntry:
    """
    Tracks data flow through the bot WITHOUT storing actual values.
    Only stores references and classifications.
    """
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    # Source
    source_node_id: str = ""
    source_node_type: str = ""
    source_field: str = ""

    # Destination
    dest_node_id: str = ""
    dest_node_type: str = ""
    dest_field: str = ""

    # Classification (NOT the actual data)
    classification: str = "UNCLASSIFIED"
    classifications_detected: List[str] = field(default_factory=list)

    # Transformations applied (NOT the values)
    transformations: List[str] = field(default_factory=list)  # ["redact", "mask", "encrypt"]

    # Policy evaluation
    policy_applied: Optional[str] = None
    controls_required: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "source": {
                "nodeId": self.source_node_id,
                "nodeType": self.source_node_type,
                "field": self.source_field,
            },
            "destination": {
                "nodeId": self.dest_node_id,
                "nodeType": self.dest_node_type,
                "field": self.dest_field,
            },
            "classification": self.classification,
            "classificationsDetected": self.classifications_detected,
            "transformations": self.transformations,
            "policyApplied": self.policy_applied,
            "controlsRequired": self.controls_required,
        }


@dataclass
class AgentDecision:
    """
    Records AI agent decisions WITHOUT storing the data it processed.
    Only stores WHAT was decided, not the values used.
    """
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    # Decision context
    node_id: str = ""
    node_type: str = ""
    decision_type: str = "classification"

    # Decision details (no PII/PHI)
    decision: str = ""                    # What was decided
    confidence: float = 0.0               # Confidence score
    reasoning: str = ""                   # Why (redacted if needed)
    alternatives_considered: List[str] = field(default_factory=list)

    # LLM details (for compliance)
    llm_provider: Optional[str] = None    # "openai", "anthropic", etc.
    llm_model: Optional[str] = None       # "gpt-4", "claude-3", etc.
    llm_request_id: Optional[str] = None  # For audit trail

    # Compliance
    data_classifications_in_context: List[str] = field(default_factory=list)
    controls_applied: List[str] = field(default_factory=list)
    human_approved: bool = False
    approver_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "nodeId": self.node_id,
            "nodeType": self.node_type,
            "decisionType": self.decision_type,
            "decision": self.decision,
            "confidence": self.confidence,
            "reasoning": self.reasoning,
            "alternativesConsidered": self.alternatives_considered,
            "llm": {
                "provider": self.llm_provider,
                "model": self.llm_model,
                "requestId": self.llm_request_id,
            } if self.llm_provider else None,
            "compliance": {
                "dataClassificationsInContext": self.data_classifications_in_context,
                "controlsApplied": self.controls_applied,
                "humanApproved": self.human_approved,
                "approverId": self.approver_id,
            },
        }


@dataclass
class ComplianceResult:
    """Results of compliance policy evaluation"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    # Policy info
    policy_pack_id: str = ""
    policy_pack_version: str = ""
    rule_id: str = ""
    rule_description: str = ""

    # Result
    status: str = "passed"  # passed, failed, warning, skipped
    severity: str = "LOW"   # LOW, MEDIUM, HIGH, CRITICAL
    message: str = ""

    # Context (no PII/PHI)
    node_id: str = ""
    node_type: str = ""
    classifications_evaluated: List[str] = field(default_factory=list)
    controls_required: List[str] = field(default_factory=list)
    controls_present: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "policy": {
                "packId": self.policy_pack_id,
                "packVersion": self.policy_pack_version,
                "ruleId": self.rule_id,
                "ruleDescription": self.rule_description,
            },
            "result": {
                "status": self.status,
                "severity": self.severity,
                "message": self.message,
            },
            "context": {
                "nodeId": self.node_id,
                "nodeType": self.node_type,
                "classificationsEvaluated": self.classifications_evaluated,
                "controlsRequired": self.controls_required,
                "controlsPresent": self.controls_present,
            },
        }


@dataclass
class ScreenshotEntry:
    """Metadata for a redacted screenshot"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    node_id: str = ""
    node_type: str = ""
    filename: str = ""

    # Redaction info
    redaction_applied: bool = True
    regions_redacted: int = 0
    redaction_method: str = "blur"  # blur, mask, pixelate

    # File info
    file_hash: str = ""
    file_size: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "nodeId": self.node_id,
            "nodeType": self.node_type,
            "filename": self.filename,
            "redaction": {
                "applied": self.redaction_applied,
                "regionsRedacted": self.regions_redacted,
                "method": self.redaction_method,
            },
            "file": {
                "hash": self.file_hash,
                "size": self.file_size,
            },
        }


@dataclass
class EvidenceManifest:
    """Manifest for the evidence pack"""
    # Execution info
    execution_id: str = ""
    bot_id: str = ""
    bot_name: str = ""
    bot_version: str = ""

    # Timing
    started_at: str = ""
    completed_at: str = ""
    duration_ms: int = 0

    # Environment (sanitized)
    runner_id: str = ""
    runner_version: str = ""
    environment: str = "production"  # production, staging, development

    # Tenant
    tenant_id: str = ""

    # Statistics
    nodes_executed: int = 0
    nodes_succeeded: int = 0
    nodes_failed: int = 0

    screenshots_count: int = 0
    decisions_count: int = 0
    lineage_entries_count: int = 0
    compliance_checks_count: int = 0

    # Compliance summary
    policy_pack_id: str = ""
    policy_pack_version: str = ""
    compliance_passed: int = 0
    compliance_failed: int = 0
    compliance_warnings: int = 0

    # Classifications detected (just types, no values)
    classifications_detected: List[str] = field(default_factory=list)

    # Integrity
    pack_version: str = "1.0.0"
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    checksum: str = ""
    signature: str = ""

    # Chain of custody
    chain_of_custody: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "packVersion": self.pack_version,
            "createdAt": self.created_at,
            "execution": {
                "id": self.execution_id,
                "botId": self.bot_id,
                "botName": self.bot_name,
                "botVersion": self.bot_version,
                "startedAt": self.started_at,
                "completedAt": self.completed_at,
                "durationMs": self.duration_ms,
            },
            "environment": {
                "runnerId": self.runner_id,
                "runnerVersion": self.runner_version,
                "environment": self.environment,
                "tenantId": self.tenant_id,
            },
            "statistics": {
                "nodesExecuted": self.nodes_executed,
                "nodesSucceeded": self.nodes_succeeded,
                "nodesFailed": self.nodes_failed,
                "screenshotsCount": self.screenshots_count,
                "decisionsCount": self.decisions_count,
                "lineageEntriesCount": self.lineage_entries_count,
                "complianceChecksCount": self.compliance_checks_count,
            },
            "compliance": {
                "policyPackId": self.policy_pack_id,
                "policyPackVersion": self.policy_pack_version,
                "passed": self.compliance_passed,
                "failed": self.compliance_failed,
                "warnings": self.compliance_warnings,
                "classificationsDetected": self.classifications_detected,
            },
            "integrity": {
                "checksum": self.checksum,
                "signature": self.signature,
            },
            "chainOfCustody": self.chain_of_custody,
        }


@dataclass
class EvidencePack:
    """Complete evidence pack"""
    manifest: EvidenceManifest = field(default_factory=EvidenceManifest)
    screenshots: List[ScreenshotEntry] = field(default_factory=list)
    decisions: List[AgentDecision] = field(default_factory=list)
    lineage: List[DataLineageEntry] = field(default_factory=list)
    compliance_results: List[ComplianceResult] = field(default_factory=list)
    logs: List[Dict[str, Any]] = field(default_factory=list)  # Redacted logs
    checksums: Dict[str, str] = field(default_factory=dict)
