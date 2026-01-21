"""
Decision Collector for AI Agents

Records decisions made by AI agents during bot execution.
Critical for compliance - must prove:
1. WHAT the agent decided
2. WHY it decided that (reasoning)
3. What alternatives were considered
4. What data classifications were in context
5. Whether human approval was obtained

NEVER stores the actual data that was processed.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
import uuid


class DecisionType(Enum):
    """Types of decisions agents can make"""
    # Data decisions
    CLASSIFICATION = "classification"      # Classifying data (PII, PHI, etc.)
    EXTRACTION = "extraction"              # Extracting data from documents
    VALIDATION = "validation"              # Validating data accuracy
    TRANSFORMATION = "transformation"      # Transforming/mapping data

    # Flow decisions
    ROUTING = "routing"                    # Routing to different paths
    APPROVAL = "approval"                  # Requesting human approval
    ESCALATION = "escalation"              # Escalating to human

    # Action decisions
    ACTION_SELECTION = "action_selection"  # Selecting which action to take
    PARAMETER_CHOICE = "parameter_choice"  # Choosing parameters for action

    # Error handling
    ERROR_HANDLING = "error_handling"      # How to handle an error
    RETRY_DECISION = "retry_decision"      # Whether to retry


@dataclass
class Decision:
    """A single decision made by an agent"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    # Context
    node_id: str = ""
    node_type: str = ""
    decision_type: str = "classification"

    # Decision details (NO PII/PHI)
    decision: str = ""                     # What was decided
    confidence: float = 0.0                # Confidence score (0-1)
    reasoning: str = ""                    # Why (REDACTED)
    alternatives: List[str] = field(default_factory=list)

    # LLM info (for audit)
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    llm_request_id: Optional[str] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None

    # Compliance
    data_classifications_in_context: List[str] = field(default_factory=list)
    controls_applied: List[str] = field(default_factory=list)
    human_approved: bool = False
    approver_id: Optional[str] = None
    approval_timestamp: Optional[str] = None


class DecisionCollector:
    """
    Collects decisions made by AI agents during bot execution.

    All reasoning is automatically redacted to remove PII/PHI.
    Only records WHAT was decided, not the data used.
    """

    def __init__(self):
        self._decisions: List[Decision] = []
        self._compliance_lib = None

        # Try to load compliance library for redaction
        try:
            from skuldbot.libs.compliance import SkuldCompliance
            self._compliance_lib = SkuldCompliance()
        except ImportError:
            pass

    def _redact(self, text: str) -> str:
        """Redact PII/PHI from text"""
        if not text:
            return ""

        if self._compliance_lib:
            result = self._compliance_lib.redact_sensitive_data(text)
            return result.get("redacted_text", text)

        # Basic fallback redaction
        import re
        text = re.sub(r'\b\d{3}-\d{2}-\d{4}\b', '[SSN]', text)
        text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL]', text)
        text = re.sub(r'\b\d{10,}\b', '[ID]', text)
        return text

    def record_decision(
        self,
        node_id: str,
        node_type: str,
        decision_type: str,
        decision: str,
        reasoning: str = "",
        confidence: float = 1.0,
        alternatives: Optional[List[str]] = None,
        llm_provider: Optional[str] = None,
        llm_model: Optional[str] = None,
        llm_request_id: Optional[str] = None,
        prompt_tokens: Optional[int] = None,
        completion_tokens: Optional[int] = None,
        data_classifications: Optional[List[str]] = None,
        controls_applied: Optional[List[str]] = None,
    ) -> Decision:
        """
        Record a decision made by an AI agent.

        Args:
            node_id: Node making the decision
            node_type: Type of node
            decision_type: Type of decision
            decision: What was decided (will NOT be redacted - should not contain PII)
            reasoning: Why (WILL be redacted)
            confidence: Confidence score (0-1)
            alternatives: Alternative decisions considered
            llm_provider: LLM provider (openai, anthropic, etc.)
            llm_model: Model used
            llm_request_id: Request ID for audit trail
            prompt_tokens: Tokens in prompt
            completion_tokens: Tokens in completion
            data_classifications: Classifications of data in context
            controls_applied: Controls that were applied

        Returns:
            Decision record
        """
        # Redact reasoning
        redacted_reasoning = self._redact(reasoning)

        decision_record = Decision(
            node_id=node_id,
            node_type=node_type,
            decision_type=decision_type,
            decision=decision,
            confidence=confidence,
            reasoning=redacted_reasoning,
            alternatives=alternatives or [],
            llm_provider=llm_provider,
            llm_model=llm_model,
            llm_request_id=llm_request_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            data_classifications_in_context=data_classifications or [],
            controls_applied=controls_applied or [],
        )

        self._decisions.append(decision_record)
        return decision_record

    def record_classification_decision(
        self,
        node_id: str,
        node_type: str,
        field_name: str,
        classification: str,
        confidence: float,
        reasoning: str = "",
        llm_provider: Optional[str] = None,
        llm_model: Optional[str] = None,
    ) -> Decision:
        """
        Record a data classification decision.

        Args:
            node_id: Node making classification
            node_type: Node type
            field_name: Field being classified
            classification: Classification assigned (PII, PHI, etc.)
            confidence: Confidence in classification
            reasoning: Why this classification
            llm_provider: LLM provider used
            llm_model: Model used

        Returns:
            Decision record
        """
        return self.record_decision(
            node_id=node_id,
            node_type=node_type,
            decision_type=DecisionType.CLASSIFICATION.value,
            decision=f"Classified field '{field_name}' as {classification}",
            reasoning=reasoning,
            confidence=confidence,
            alternatives=[c for c in ["UNCLASSIFIED", "PII", "PHI", "PCI"] if c != classification],
            llm_provider=llm_provider,
            llm_model=llm_model,
            data_classifications=[classification],
        )

    def record_routing_decision(
        self,
        node_id: str,
        node_type: str,
        selected_route: str,
        available_routes: List[str],
        confidence: float,
        reasoning: str = "",
    ) -> Decision:
        """
        Record a routing decision.

        Args:
            node_id: Node making routing decision
            node_type: Node type
            selected_route: Route selected
            available_routes: All available routes
            confidence: Confidence in decision
            reasoning: Why this route

        Returns:
            Decision record
        """
        return self.record_decision(
            node_id=node_id,
            node_type=node_type,
            decision_type=DecisionType.ROUTING.value,
            decision=f"Selected route: {selected_route}",
            reasoning=reasoning,
            confidence=confidence,
            alternatives=[r for r in available_routes if r != selected_route],
        )

    def record_approval_request(
        self,
        node_id: str,
        node_type: str,
        what_needs_approval: str,
        reason_for_approval: str,
        data_classifications: List[str],
    ) -> Decision:
        """
        Record that human approval was requested.

        Args:
            node_id: Node requesting approval
            node_type: Node type
            what_needs_approval: What action needs approval (NO PII)
            reason_for_approval: Why approval needed
            data_classifications: Classifications involved

        Returns:
            Decision record
        """
        return self.record_decision(
            node_id=node_id,
            node_type=node_type,
            decision_type=DecisionType.APPROVAL.value,
            decision=f"Requested human approval for: {what_needs_approval}",
            reasoning=reason_for_approval,
            confidence=1.0,
            data_classifications=data_classifications,
            controls_applied=["HITL_APPROVAL"],
        )

    def record_approval_response(
        self,
        decision_id: str,
        approved: bool,
        approver_id: str,
    ):
        """
        Record the response to an approval request.

        Args:
            decision_id: ID of the approval decision
            approved: Whether it was approved
            approver_id: ID of approver
        """
        for decision in self._decisions:
            if decision.id == decision_id:
                decision.human_approved = approved
                decision.approver_id = approver_id
                decision.approval_timestamp = datetime.utcnow().isoformat()
                break

    def get_all_decisions(self) -> List[Dict[str, Any]]:
        """Get all decisions as dictionaries"""
        return [self._decision_to_dict(d) for d in self._decisions]

    def get_decisions_by_type(self, decision_type: str) -> List[Dict[str, Any]]:
        """Get decisions of a specific type"""
        return [
            self._decision_to_dict(d)
            for d in self._decisions
            if d.decision_type == decision_type
        ]

    def get_decisions_requiring_approval(self) -> List[Dict[str, Any]]:
        """Get decisions that required/requested human approval"""
        return [
            self._decision_to_dict(d)
            for d in self._decisions
            if d.decision_type == DecisionType.APPROVAL.value
        ]

    def get_llm_usage_summary(self) -> Dict[str, Any]:
        """Get summary of LLM usage for cost/audit"""
        total_prompt = 0
        total_completion = 0
        by_provider: Dict[str, Dict[str, int]] = {}

        for d in self._decisions:
            if d.llm_provider:
                if d.llm_provider not in by_provider:
                    by_provider[d.llm_provider] = {
                        "decisions": 0,
                        "prompt_tokens": 0,
                        "completion_tokens": 0,
                    }
                by_provider[d.llm_provider]["decisions"] += 1
                by_provider[d.llm_provider]["prompt_tokens"] += d.prompt_tokens or 0
                by_provider[d.llm_provider]["completion_tokens"] += d.completion_tokens or 0

                total_prompt += d.prompt_tokens or 0
                total_completion += d.completion_tokens or 0

        return {
            "totalDecisions": len([d for d in self._decisions if d.llm_provider]),
            "totalPromptTokens": total_prompt,
            "totalCompletionTokens": total_completion,
            "byProvider": by_provider,
        }

    def _decision_to_dict(self, decision: Decision) -> Dict[str, Any]:
        """Convert decision to dictionary"""
        return {
            "id": decision.id,
            "timestamp": decision.timestamp,
            "nodeId": decision.node_id,
            "nodeType": decision.node_type,
            "decisionType": decision.decision_type,
            "decision": decision.decision,
            "confidence": decision.confidence,
            "reasoning": decision.reasoning,
            "alternatives": decision.alternatives,
            "llm": {
                "provider": decision.llm_provider,
                "model": decision.llm_model,
                "requestId": decision.llm_request_id,
                "promptTokens": decision.prompt_tokens,
                "completionTokens": decision.completion_tokens,
            } if decision.llm_provider else None,
            "compliance": {
                "dataClassificationsInContext": decision.data_classifications_in_context,
                "controlsApplied": decision.controls_applied,
                "humanApproved": decision.human_approved,
                "approverId": decision.approver_id,
                "approvalTimestamp": decision.approval_timestamp,
            },
        }
