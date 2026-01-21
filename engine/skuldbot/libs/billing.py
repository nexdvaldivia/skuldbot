"""
SkuldBot Billing Library - Usage tracking for marketplace bots.

This library provides keywords for tracking billable events in usage-based
pricing models. Events are sent to the Orchestrator for billing purposes.

When running locally (without Orchestrator), events are logged but not billed.

= Pricing Models Supported =

1. Per-event billing (e.g., $0.75 per call answered)
2. Per-action billing (e.g., $3.00 per claim created)
3. Hybrid with minimum (e.g., MAX($4000/month, usage))

= Example Usage =

| Track Billable Event | calls_answered |
| Track Billable Event | claims_created | metadata={"claim_id": "CLM-123"} |
| Track Billable Event | emails_processed | count=5 |

= Configuration =

The library reads configuration from environment variables:
- SKULDBOT_ORCHESTRATOR_URL: Base URL of the Orchestrator API
- SKULDBOT_RUNNER_TOKEN: Authentication token for the Runner
- SKULDBOT_INSTALLATION_ID: ID of the bot installation (set by Orchestrator)
- SKULDBOT_TENANT_ID: Tenant ID (set by Orchestrator)

When these are not set, the library operates in "local mode" and only logs events.

Copyright (c) 2026 Skuld, LLC - An Asgard Insight Company
"""

import os
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field, asdict
import logging

from robot.api.deco import keyword

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

logger = logging.getLogger(__name__)


@dataclass
class BillableEvent:
    """A single billable event."""
    metric: str
    count: int = 1
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class UsageReport:
    """Collection of billable events to send to Orchestrator."""
    installation_id: str
    tenant_id: str
    bot_id: str
    events: List[BillableEvent] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "installationId": self.installation_id,
            "tenantId": self.tenant_id,
            "botId": self.bot_id,
            "events": [asdict(e) for e in self.events],
            "reportedAt": datetime.now(timezone.utc).isoformat()
        }


class BillingLibrary:
    """
    Track billable events for usage-based pricing in SkuldBot marketplace.

    = Supported Metrics =

    Common metrics:
    - calls_answered: Voice calls processed
    - claims_created: Insurance claims created
    - emails_processed: Emails handled
    - documents_extracted: Documents with OCR/extraction
    - ai_tokens: LLM tokens consumed

    = Example =

    | Track Billable Event | claims_created | metadata={"claim_id": "CLM-123"} |
    | ${stats}= | Get Usage Stats |
    | Log | Processed ${stats}[total_events] events |
    """

    ROBOT_LIBRARY_SCOPE = 'GLOBAL'

    def __init__(self):
        self._orchestrator_url = os.environ.get("SKULDBOT_ORCHESTRATOR_URL", "")
        self._runner_token = os.environ.get("SKULDBOT_RUNNER_TOKEN", "")
        self._installation_id = os.environ.get("SKULDBOT_INSTALLATION_ID", "local")
        self._tenant_id = os.environ.get("SKULDBOT_TENANT_ID", "local")
        self._bot_id = os.environ.get("SKULDBOT_BOT_ID", "local")

        self._events: List[BillableEvent] = []
        self._session_start = datetime.now(timezone.utc)
        self._batch_size = int(os.environ.get("SKULDBOT_BILLING_BATCH_SIZE", "10"))
        self._pending_events: List[BillableEvent] = []
        self._is_production = bool(self._orchestrator_url and self._runner_token)

    # =========================================================================
    # MAIN KEYWORDS
    # =========================================================================

    @keyword("Track Billable Event")
    def track_billable_event(
        self,
        metric: str,
        count: int = 1,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Track a billable event for usage-based billing.

        Args:
            metric: Event type (e.g., "claims_created", "calls_answered")
            count: Number of events (default: 1)
            metadata: Optional context (claim_id, call_sid, etc.)

        Returns:
            Dict with event details and tracking status

        Example:
            | Track Billable Event | calls_answered |
            | Track Billable Event | claims_created | metadata={"claim_id": "CLM-123"} |
        """
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except json.JSONDecodeError:
                metadata = {"raw": metadata}

        event = BillableEvent(
            metric=metric,
            count=int(count),
            metadata=metadata or {}
        )

        self._events.append(event)
        self._pending_events.append(event)
        self._log_event(event)

        if self._is_production and len(self._pending_events) >= self._batch_size:
            self._flush_events()

        return {
            "status": "tracked",
            "metric": metric,
            "count": count,
            "mode": "production" if self._is_production else "local",
            "total_session_events": len(self._events)
        }

    @keyword("Flush Billing Events")
    def flush_billing_events(self) -> Dict[str, Any]:
        """
        Force send all pending events to Orchestrator.

        Example:
            | Flush Billing Events |
        """
        return self._flush_events()

    @keyword("Get Usage Stats")
    def get_usage_stats(self) -> Dict[str, Any]:
        """
        Get usage statistics for the current session.

        Returns:
            Dict with usage statistics grouped by metric

        Example:
            | ${stats}= | Get Usage Stats |
            | Log | Claims: ${stats}[by_metric][claims_created] |
        """
        by_metric: Dict[str, int] = {}
        for event in self._events:
            by_metric[event.metric] = by_metric.get(event.metric, 0) + event.count

        return {
            "total_events": len(self._events),
            "total_count": sum(e.count for e in self._events),
            "by_metric": by_metric,
            "session_start": self._session_start.isoformat(),
            "mode": "production" if self._is_production else "local",
            "pending_events": len(self._pending_events)
        }

    @keyword("Get Billing Mode")
    def get_billing_mode(self) -> str:
        """
        Get the current billing mode.

        Returns:
            "production" if connected to Orchestrator, "local" otherwise
        """
        return "production" if self._is_production else "local"

    # =========================================================================
    # CONVENIENCE KEYWORDS
    # =========================================================================

    @keyword("Track Call Answered")
    def track_call_answered(
        self,
        call_sid: Optional[str] = None,
        from_number: Optional[str] = None,
        duration_seconds: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Track a voice call that was answered.

        Args:
            call_sid: Twilio call SID
            from_number: Caller number (will be redacted)
            duration_seconds: Call duration

        Example:
            | Track Call Answered | call_sid=${call}[sid] |
        """
        metadata = {}
        if call_sid:
            metadata["call_sid"] = call_sid
        if from_number:
            metadata["from_number"] = f"***{from_number[-4:]}" if len(from_number) >= 4 else "***"
        if duration_seconds:
            metadata["duration_seconds"] = duration_seconds

        return self.track_billable_event("calls_answered", metadata=metadata)

    @keyword("Track Claim Created")
    def track_claim_created(
        self,
        claim_id: str,
        claim_type: Optional[str] = None,
        amount: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Track an insurance claim creation.

        Args:
            claim_id: Unique claim identifier
            claim_type: Type of claim (auto, property, health)
            amount: Claim amount

        Example:
            | Track Claim Created | claim_id=CLM-2026-001 | claim_type=auto |
        """
        metadata = {"claim_id": claim_id}
        if claim_type:
            metadata["claim_type"] = claim_type
        if amount is not None:
            metadata["amount"] = float(amount)

        return self.track_billable_event("claims_created", metadata=metadata)

    @keyword("Track Email Processed")
    def track_email_processed(
        self,
        email_id: Optional[str] = None,
        action: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Track an email that was processed.

        Args:
            email_id: Email message ID
            action: Action taken (read, replied, forwarded, etc.)

        Example:
            | Track Email Processed | email_id=${email}[id] | action=replied |
        """
        metadata = {}
        if email_id:
            metadata["email_id"] = email_id
        if action:
            metadata["action"] = action

        return self.track_billable_event("emails_processed", metadata=metadata)

    @keyword("Track Document Extracted")
    def track_document_extracted(
        self,
        document_type: Optional[str] = None,
        pages: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Track a document processed with OCR/extraction.

        Args:
            document_type: Type (invoice, form, contract)
            pages: Number of pages

        Example:
            | Track Document Extracted | document_type=invoice | pages=3 |
        """
        metadata = {}
        if document_type:
            metadata["document_type"] = document_type
        if pages is not None:
            metadata["pages"] = int(pages)

        return self.track_billable_event("documents_extracted", metadata=metadata)

    @keyword("Track AI Tokens")
    def track_ai_tokens(
        self,
        prompt_tokens: int,
        completion_tokens: int,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Track LLM token usage.

        Args:
            prompt_tokens: Input tokens
            completion_tokens: Output tokens
            model: Model name (gpt-4, claude-3, etc.)

        Example:
            | Track AI Tokens | prompt_tokens=500 | completion_tokens=200 |
        """
        total = int(prompt_tokens) + int(completion_tokens)
        metadata = {
            "prompt_tokens": int(prompt_tokens),
            "completion_tokens": int(completion_tokens),
            "total_tokens": total
        }
        if model:
            metadata["model"] = model

        return self.track_billable_event("ai_tokens", count=total, metadata=metadata)

    # =========================================================================
    # INTERNAL
    # =========================================================================

    def _log_event(self, event: BillableEvent):
        """Log event to console."""
        try:
            from robot.libraries.BuiltIn import BuiltIn
            builtin = BuiltIn()
            mode = "PROD" if self._is_production else "LOCAL"
            builtin.log(
                f"[BILLING:{mode}] {event.metric}: {event.count}",
                console=True
            )
        except Exception:
            mode = "PROD" if self._is_production else "LOCAL"
            logger.info(f"[BILLING:{mode}] {event.metric}: {event.count}")

    def _flush_events(self) -> Dict[str, Any]:
        """Send pending events to Orchestrator."""
        if not self._pending_events:
            return {"status": "no_events", "sent": 0}

        events_to_send = self._pending_events.copy()
        self._pending_events.clear()

        if not self._is_production:
            return {
                "status": "local_mode",
                "events_logged": len(events_to_send)
            }

        if not HAS_REQUESTS:
            return {"status": "error", "message": "requests not installed"}

        report = UsageReport(
            installation_id=self._installation_id,
            tenant_id=self._tenant_id,
            bot_id=self._bot_id,
            events=events_to_send
        )

        try:
            response = requests.post(
                f"{self._orchestrator_url}/api/usage/track",
                json=report.to_dict(),
                headers={
                    "Authorization": f"Bearer {self._runner_token}",
                    "Content-Type": "application/json"
                },
                timeout=10
            )
            response.raise_for_status()

            return {
                "status": "sent",
                "events_sent": len(events_to_send)
            }
        except requests.exceptions.RequestException as e:
            self._pending_events = events_to_send + self._pending_events
            logger.error(f"Failed to send billing events: {e}")
            return {
                "status": "error",
                "message": str(e),
                "events_requeued": len(events_to_send)
            }

    def __del__(self):
        """Flush remaining events on cleanup."""
        if self._pending_events and self._is_production:
            try:
                self._flush_events()
            except Exception:
                pass
