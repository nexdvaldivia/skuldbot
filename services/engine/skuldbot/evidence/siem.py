"""
SIEM Integration - Splunk, DataDog, CloudWatch, ELK

Enterprise-grade audit log forwarding to Security Information
and Event Management (SIEM) systems.

Features:
- Real-time event streaming
- Batch log forwarding
- Multiple SIEM support (Splunk, DataDog, CloudWatch, ELK)
- Structured logging in CEF/LEEF formats
- Retry with exponential backoff
- Dead letter queue for failed events

Compliance Requirements:
- SOC2 CC7.2: Evidence of monitoring and logging
- HIPAA: Centralized audit logging
- PCI-DSS 10.x: Tracking and monitoring
"""

import json
import time
import hashlib
import threading
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from queue import Queue, Empty
from typing import Any, Dict, List, Optional, Callable

# HTTP client
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# AWS CloudWatch
try:
    import boto3
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False


class EventSeverity(Enum):
    """Event severity levels"""
    DEBUG = 0
    INFO = 1
    LOW = 2
    MEDIUM = 3
    HIGH = 4
    CRITICAL = 5


class EventCategory(Enum):
    """Event categories for SIEM classification"""
    EVIDENCE_PACK = "evidence_pack"
    COMPLIANCE = "compliance"
    SECURITY = "security"
    EXECUTION = "execution"
    ACCESS = "access"
    DATA = "data"
    ERROR = "error"


@dataclass
class SIEMEvent:
    """Standardized event for SIEM forwarding"""
    event_id: str = ""
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    category: str = EventCategory.EVIDENCE_PACK.value
    severity: int = EventSeverity.INFO.value
    severity_name: str = "INFO"

    # Source identification
    source: str = "skuldbot"
    source_type: str = "evidence_pack"
    tenant_id: str = ""
    environment: str = "production"

    # Event details
    event_type: str = ""
    description: str = ""
    outcome: str = "success"  # success, failure, unknown

    # Context
    execution_id: str = ""
    bot_id: str = ""
    bot_name: str = ""
    user_id: str = ""
    node_id: str = ""

    # Data (no PII/PHI)
    data: Dict[str, Any] = field(default_factory=dict)

    # Compliance
    classifications_involved: List[str] = field(default_factory=list)
    compliance_frameworks: List[str] = field(default_factory=list)
    controls_applied: List[str] = field(default_factory=list)

    def __post_init__(self):
        if not self.event_id:
            self.event_id = hashlib.sha256(
                f"{self.timestamp}{self.event_type}{self.execution_id}".encode()
            ).hexdigest()[:16]

        self.severity_name = EventSeverity(self.severity).name

    def to_dict(self) -> Dict[str, Any]:
        return {
            "eventId": self.event_id,
            "timestamp": self.timestamp,
            "category": self.category,
            "severity": self.severity,
            "severityName": self.severity_name,
            "source": self.source,
            "sourceType": self.source_type,
            "tenantId": self.tenant_id,
            "environment": self.environment,
            "eventType": self.event_type,
            "description": self.description,
            "outcome": self.outcome,
            "context": {
                "executionId": self.execution_id,
                "botId": self.bot_id,
                "botName": self.bot_name,
                "userId": self.user_id,
                "nodeId": self.node_id,
            },
            "data": self.data,
            "compliance": {
                "classificationsInvolved": self.classifications_involved,
                "frameworks": self.compliance_frameworks,
                "controlsApplied": self.controls_applied,
            },
        }

    def to_cef(self) -> str:
        """
        Convert to Common Event Format (CEF) for SIEM.

        CEF format: CEF:Version|Device Vendor|Device Product|Device Version|
                    Signature ID|Name|Severity|Extension
        """
        extension = " ".join([
            f"src={self.source}",
            f"spt={self.source_type}",
            f"cs1={self.tenant_id}",
            f"cs1Label=TenantId",
            f"cs2={self.execution_id}",
            f"cs2Label=ExecutionId",
            f"cs3={self.bot_id}",
            f"cs3Label=BotId",
            f"outcome={self.outcome}",
        ])

        return (
            f"CEF:0|SkuldBot|EvidencePack|1.0|{self.event_type}|"
            f"{self.description}|{self.severity}|{extension}"
        )

    def to_leef(self) -> str:
        """
        Convert to Log Event Extended Format (LEEF) for QRadar.

        LEEF format: LEEF:Version|Vendor|Product|Version|EventID|Extension
        """
        extension = "\t".join([
            f"devTime={self.timestamp}",
            f"cat={self.category}",
            f"sev={self.severity}",
            f"src={self.source}",
            f"usrName={self.user_id}",
            f"executionId={self.execution_id}",
            f"botId={self.bot_id}",
        ])

        return f"LEEF:2.0|SkuldBot|EvidencePack|1.0|{self.event_type}|{extension}"


class SIEMBackend(ABC):
    """Abstract SIEM backend"""

    @abstractmethod
    def send_event(self, event: SIEMEvent) -> bool:
        """Send single event"""
        pass

    @abstractmethod
    def send_batch(self, events: List[SIEMEvent]) -> int:
        """Send batch of events, return count of successful sends"""
        pass

    @abstractmethod
    def health_check(self) -> bool:
        """Check if backend is healthy"""
        pass


class SplunkHECBackend(SIEMBackend):
    """
    Splunk HTTP Event Collector (HEC) backend.

    Requires Splunk with HEC enabled and token configured.
    """

    def __init__(
        self,
        hec_url: str,
        hec_token: str,
        index: str = "main",
        source: str = "skuldbot",
        sourcetype: str = "skuldbot:evidence",
        verify_ssl: bool = True,
        timeout: int = 30,
    ):
        """
        Initialize Splunk HEC backend.

        Args:
            hec_url: HEC endpoint URL (e.g., https://splunk:8088/services/collector)
            hec_token: HEC authentication token
            index: Splunk index
            source: Event source
            sourcetype: Event sourcetype
            verify_ssl: Verify SSL certificates
            timeout: Request timeout in seconds
        """
        if not HAS_REQUESTS:
            raise ImportError("requests package required for Splunk HEC")

        self.hec_url = hec_url.rstrip("/")
        self.hec_token = hec_token
        self.index = index
        self.source = source
        self.sourcetype = sourcetype
        self.verify_ssl = verify_ssl
        self.timeout = timeout

        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Splunk {hec_token}",
            "Content-Type": "application/json",
        })

    def send_event(self, event: SIEMEvent) -> bool:
        """Send event to Splunk HEC"""
        try:
            payload = {
                "time": int(datetime.fromisoformat(
                    event.timestamp.replace("Z", "+00:00")
                ).timestamp()),
                "source": self.source,
                "sourcetype": self.sourcetype,
                "index": self.index,
                "event": event.to_dict(),
            }

            response = self._session.post(
                f"{self.hec_url}/event",
                json=payload,
                verify=self.verify_ssl,
                timeout=self.timeout,
            )

            return response.status_code == 200

        except Exception:
            return False

    def send_batch(self, events: List[SIEMEvent]) -> int:
        """Send batch of events to Splunk HEC"""
        successful = 0

        # Splunk HEC supports batch via multiple JSON objects
        payload_lines = []
        for event in events:
            payload = {
                "time": int(datetime.fromisoformat(
                    event.timestamp.replace("Z", "+00:00")
                ).timestamp()),
                "source": self.source,
                "sourcetype": self.sourcetype,
                "index": self.index,
                "event": event.to_dict(),
            }
            payload_lines.append(json.dumps(payload))

        try:
            response = self._session.post(
                f"{self.hec_url}/event",
                data="\n".join(payload_lines),
                verify=self.verify_ssl,
                timeout=self.timeout,
            )

            if response.status_code == 200:
                successful = len(events)

        except Exception:
            pass

        return successful

    def health_check(self) -> bool:
        """Check Splunk HEC health"""
        try:
            response = self._session.get(
                f"{self.hec_url}/health",
                verify=self.verify_ssl,
                timeout=10,
            )
            return response.status_code == 200
        except Exception:
            return False


class DataDogBackend(SIEMBackend):
    """
    DataDog Logs API backend.

    Requires DataDog API key with logs:write permission.
    """

    def __init__(
        self,
        api_key: str,
        site: str = "datadoghq.com",  # or datadoghq.eu
        service: str = "skuldbot",
        env: str = "production",
        timeout: int = 30,
    ):
        """
        Initialize DataDog backend.

        Args:
            api_key: DataDog API key
            site: DataDog site (datadoghq.com or datadoghq.eu)
            service: Service name for tagging
            env: Environment tag
            timeout: Request timeout
        """
        if not HAS_REQUESTS:
            raise ImportError("requests package required for DataDog")

        self.api_key = api_key
        self.site = site
        self.service = service
        self.env = env
        self.timeout = timeout

        self._url = f"https://http-intake.logs.{site}/api/v2/logs"
        self._session = requests.Session()
        self._session.headers.update({
            "DD-API-KEY": api_key,
            "Content-Type": "application/json",
        })

    def send_event(self, event: SIEMEvent) -> bool:
        """Send event to DataDog Logs API"""
        try:
            payload = [{
                "ddsource": "skuldbot",
                "ddtags": f"env:{self.env},service:{self.service},tenant:{event.tenant_id}",
                "hostname": "skuldbot-runner",
                "service": self.service,
                "status": event.severity_name.lower(),
                "message": event.description,
                "data": event.to_dict(),
            }]

            response = self._session.post(
                self._url,
                json=payload,
                timeout=self.timeout,
            )

            return response.status_code == 202

        except Exception:
            return False

    def send_batch(self, events: List[SIEMEvent]) -> int:
        """Send batch of events to DataDog"""
        try:
            payload = [
                {
                    "ddsource": "skuldbot",
                    "ddtags": f"env:{self.env},service:{self.service},tenant:{e.tenant_id}",
                    "hostname": "skuldbot-runner",
                    "service": self.service,
                    "status": e.severity_name.lower(),
                    "message": e.description,
                    "data": e.to_dict(),
                }
                for e in events
            ]

            response = self._session.post(
                self._url,
                json=payload,
                timeout=self.timeout,
            )

            if response.status_code == 202:
                return len(events)
            return 0

        except Exception:
            return 0

    def health_check(self) -> bool:
        """Check DataDog API health"""
        try:
            # Use validate endpoint
            response = requests.get(
                f"https://api.{self.site}/api/v1/validate",
                headers={"DD-API-KEY": self.api_key},
                timeout=10,
            )
            return response.status_code == 200
        except Exception:
            return False


class CloudWatchLogsBackend(SIEMBackend):
    """
    AWS CloudWatch Logs backend.

    Requires AWS credentials with logs:PutLogEvents permission.
    """

    def __init__(
        self,
        log_group: str,
        log_stream: str,
        region: Optional[str] = None,
        profile: Optional[str] = None,
    ):
        """
        Initialize CloudWatch Logs backend.

        Args:
            log_group: CloudWatch log group name
            log_stream: CloudWatch log stream name
            region: AWS region
            profile: AWS profile name
        """
        if not HAS_BOTO3:
            raise ImportError("boto3 required for CloudWatch Logs")

        self.log_group = log_group
        self.log_stream = log_stream

        session_kwargs = {}
        if profile:
            session_kwargs["profile_name"] = profile
        if region:
            session_kwargs["region_name"] = region

        session = boto3.Session(**session_kwargs)
        self.logs = session.client("logs")

        self._sequence_token = None

    def send_event(self, event: SIEMEvent) -> bool:
        """Send event to CloudWatch Logs"""
        return self.send_batch([event]) == 1

    def send_batch(self, events: List[SIEMEvent]) -> int:
        """Send batch of events to CloudWatch Logs"""
        try:
            log_events = [
                {
                    "timestamp": int(datetime.fromisoformat(
                        e.timestamp.replace("Z", "+00:00")
                    ).timestamp() * 1000),
                    "message": json.dumps(e.to_dict()),
                }
                for e in events
            ]

            # Sort by timestamp (required by CloudWatch)
            log_events.sort(key=lambda x: x["timestamp"])

            kwargs = {
                "logGroupName": self.log_group,
                "logStreamName": self.log_stream,
                "logEvents": log_events,
            }

            if self._sequence_token:
                kwargs["sequenceToken"] = self._sequence_token

            response = self.logs.put_log_events(**kwargs)
            self._sequence_token = response.get("nextSequenceToken")

            return len(events)

        except Exception:
            return 0

    def health_check(self) -> bool:
        """Check CloudWatch Logs health"""
        try:
            self.logs.describe_log_groups(limit=1)
            return True
        except Exception:
            return False


class ElasticsearchBackend(SIEMBackend):
    """
    Elasticsearch/OpenSearch backend for ELK stack.
    """

    def __init__(
        self,
        hosts: List[str],
        index_prefix: str = "skuldbot-evidence",
        api_key: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        verify_ssl: bool = True,
        timeout: int = 30,
    ):
        """
        Initialize Elasticsearch backend.

        Args:
            hosts: List of Elasticsearch hosts
            index_prefix: Index name prefix (date will be appended)
            api_key: API key for authentication
            username: Username for basic auth
            password: Password for basic auth
            verify_ssl: Verify SSL certificates
            timeout: Request timeout
        """
        if not HAS_REQUESTS:
            raise ImportError("requests package required for Elasticsearch")

        self.hosts = hosts
        self.index_prefix = index_prefix
        self.verify_ssl = verify_ssl
        self.timeout = timeout

        self._session = requests.Session()

        if api_key:
            self._session.headers["Authorization"] = f"ApiKey {api_key}"
        elif username and password:
            self._session.auth = (username, password)

        self._session.headers["Content-Type"] = "application/json"

    def _get_index_name(self) -> str:
        """Get index name with current date"""
        date_str = datetime.utcnow().strftime("%Y.%m.%d")
        return f"{self.index_prefix}-{date_str}"

    def send_event(self, event: SIEMEvent) -> bool:
        """Send event to Elasticsearch"""
        try:
            host = self.hosts[0]
            index = self._get_index_name()

            response = self._session.post(
                f"{host}/{index}/_doc",
                json=event.to_dict(),
                verify=self.verify_ssl,
                timeout=self.timeout,
            )

            return response.status_code in (200, 201)

        except Exception:
            return False

    def send_batch(self, events: List[SIEMEvent]) -> int:
        """Send batch using bulk API"""
        try:
            host = self.hosts[0]
            index = self._get_index_name()

            # Build bulk request body
            bulk_body = []
            for event in events:
                bulk_body.append(json.dumps({"index": {"_index": index}}))
                bulk_body.append(json.dumps(event.to_dict()))

            response = self._session.post(
                f"{host}/_bulk",
                data="\n".join(bulk_body) + "\n",
                headers={"Content-Type": "application/x-ndjson"},
                verify=self.verify_ssl,
                timeout=self.timeout,
            )

            if response.status_code == 200:
                result = response.json()
                errors = result.get("errors", True)
                if not errors:
                    return len(events)
                # Count successful items
                successful = sum(
                    1 for item in result.get("items", [])
                    if item.get("index", {}).get("status") in (200, 201)
                )
                return successful

            return 0

        except Exception:
            return 0

    def health_check(self) -> bool:
        """Check Elasticsearch health"""
        try:
            host = self.hosts[0]
            response = self._session.get(
                f"{host}/_cluster/health",
                verify=self.verify_ssl,
                timeout=10,
            )
            if response.status_code == 200:
                health = response.json()
                return health.get("status") in ("green", "yellow")
            return False
        except Exception:
            return False


class SIEMForwarder:
    """
    Main SIEM forwarder with buffering, retry, and dead letter queue.

    Handles:
    - Event buffering for batch sending
    - Automatic retry with exponential backoff
    - Dead letter queue for failed events
    - Multiple backend support
    - Health monitoring
    """

    def __init__(
        self,
        backends: List[SIEMBackend],
        batch_size: int = 100,
        flush_interval: float = 5.0,
        max_retries: int = 3,
        retry_backoff: float = 1.0,
    ):
        """
        Initialize SIEM forwarder.

        Args:
            backends: List of SIEM backends to send to
            batch_size: Events to buffer before sending
            flush_interval: Seconds between flushes
            max_retries: Maximum retry attempts
            retry_backoff: Initial backoff seconds (doubles each retry)
        """
        self.backends = backends
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self.max_retries = max_retries
        self.retry_backoff = retry_backoff

        self._buffer: Queue = Queue()
        self._dead_letter: Queue = Queue()
        self._running = False
        self._flush_thread: Optional[threading.Thread] = None

        # Stats
        self._events_sent = 0
        self._events_failed = 0

    def start(self):
        """Start background flush thread"""
        if self._running:
            return

        self._running = True
        self._flush_thread = threading.Thread(target=self._flush_loop, daemon=True)
        self._flush_thread.start()

    def stop(self):
        """Stop forwarder and flush remaining events"""
        self._running = False
        if self._flush_thread:
            self._flush_thread.join(timeout=10)
        self._flush_now()

    def send(self, event: SIEMEvent):
        """
        Queue event for sending.

        Args:
            event: Event to send
        """
        self._buffer.put(event)

        # Auto-flush if buffer is full
        if self._buffer.qsize() >= self.batch_size:
            self._flush_now()

    def send_immediate(self, event: SIEMEvent) -> bool:
        """
        Send event immediately to all backends.

        Args:
            event: Event to send

        Returns:
            True if sent to at least one backend
        """
        success = False
        for backend in self.backends:
            try:
                if backend.send_event(event):
                    success = True
                    self._events_sent += 1
            except Exception:
                self._events_failed += 1

        return success

    def _flush_loop(self):
        """Background flush loop"""
        while self._running:
            time.sleep(self.flush_interval)
            self._flush_now()

    def _flush_now(self):
        """Flush buffered events"""
        events = []
        while not self._buffer.empty() and len(events) < self.batch_size:
            try:
                events.append(self._buffer.get_nowait())
            except Empty:
                break

        if events:
            self._send_batch_with_retry(events)

    def _send_batch_with_retry(self, events: List[SIEMEvent]):
        """Send batch with retry logic"""
        for backend in self.backends:
            retry_events = events.copy()

            for attempt in range(self.max_retries):
                if not retry_events:
                    break

                try:
                    sent = backend.send_batch(retry_events)
                    self._events_sent += sent

                    if sent == len(retry_events):
                        retry_events = []
                    else:
                        # Some failed, retry remaining
                        retry_events = retry_events[sent:]
                        time.sleep(self.retry_backoff * (2 ** attempt))

                except Exception:
                    time.sleep(self.retry_backoff * (2 ** attempt))

            # Move failed events to dead letter queue
            for event in retry_events:
                self._dead_letter.put(event)
                self._events_failed += 1

    def get_dead_letter_events(self) -> List[SIEMEvent]:
        """Get events from dead letter queue"""
        events = []
        while not self._dead_letter.empty():
            try:
                events.append(self._dead_letter.get_nowait())
            except Empty:
                break
        return events

    def get_stats(self) -> Dict[str, Any]:
        """Get forwarder statistics"""
        return {
            "eventsSent": self._events_sent,
            "eventsFailed": self._events_failed,
            "bufferSize": self._buffer.qsize(),
            "deadLetterSize": self._dead_letter.qsize(),
            "backends": len(self.backends),
            "running": self._running,
        }

    def health_check(self) -> Dict[str, bool]:
        """Check health of all backends"""
        return {
            f"backend_{i}": backend.health_check()
            for i, backend in enumerate(self.backends)
        }


def create_evidence_pack_event(
    evidence_pack,
    event_type: str,
    description: str,
    severity: EventSeverity = EventSeverity.INFO,
    additional_data: Optional[Dict[str, Any]] = None,
) -> SIEMEvent:
    """
    Create SIEM event from evidence pack.

    Args:
        evidence_pack: EvidencePack instance
        event_type: Type of event
        description: Event description
        severity: Event severity
        additional_data: Additional data to include

    Returns:
        SIEMEvent
    """
    manifest = evidence_pack.manifest

    event = SIEMEvent(
        category=EventCategory.EVIDENCE_PACK.value,
        severity=severity.value,
        event_type=event_type,
        description=description,
        execution_id=manifest.execution_id,
        bot_id=manifest.bot_id,
        bot_name=manifest.bot_name,
        tenant_id=manifest.tenant_id,
        environment=manifest.environment,
        classifications_involved=manifest.classifications_detected,
        compliance_frameworks=[manifest.policy_pack_id] if manifest.policy_pack_id else [],
    )

    if additional_data:
        event.data = additional_data

    return event
