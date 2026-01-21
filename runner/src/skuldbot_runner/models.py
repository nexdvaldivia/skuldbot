"""Data models for runner communication with Orchestrator."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class RunStatus(str, Enum):
    """Status of a run."""

    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"


class StepStatus(str, Enum):
    """Status of a step within a run."""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


class LogLevel(str, Enum):
    """Log level for streaming logs."""

    DEBUG = "debug"
    INFO = "info"
    WARN = "warn"
    ERROR = "error"


# ============================================
# Registration
# ============================================


class SystemInfo(BaseModel):
    """System information about the runner machine."""

    hostname: str
    os: str
    os_version: str
    python_version: str
    cpu_count: int
    memory_total_mb: int
    memory_available_mb: int


class RegisterRequest(BaseModel):
    """Request to register a new runner."""

    name: str
    labels: dict[str, str] = Field(default_factory=dict)
    capabilities: list[str] = Field(default_factory=list)
    system_info: SystemInfo


class RegisterResponse(BaseModel):
    """Response from runner registration."""

    id: str
    api_key: str
    name: str
    tenant_id: str


# ============================================
# Heartbeat
# ============================================


class HeartbeatRequest(BaseModel):
    """Heartbeat request with current status."""

    status: str = "online"  # online, busy, offline
    current_run_id: str | None = None
    system_info: SystemInfo | None = None


class HeartbeatResponse(BaseModel):
    """Heartbeat response."""

    acknowledged: bool
    server_time: datetime


# ============================================
# Jobs
# ============================================


class Job(BaseModel):
    """A job (run) to be executed."""

    id: str
    bot_id: str
    bot_version_id: str
    bot_name: str
    package_url: str  # URL to download bot package
    inputs: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class ClaimResponse(BaseModel):
    """Response from claiming a job."""

    success: bool
    job: Job | None = None
    message: str | None = None


# ============================================
# Progress Reporting
# ============================================


class StepProgress(BaseModel):
    """Progress report for a single step."""

    step_id: str
    node_id: str
    node_type: str
    status: StepStatus
    started_at: datetime | None = None
    completed_at: datetime | None = None
    output: Any | None = None
    error: str | None = None


class ProgressReport(BaseModel):
    """Progress report for a run."""

    run_id: str
    status: RunStatus
    current_step: int | None = None
    total_steps: int | None = None
    steps: list[StepProgress] = Field(default_factory=list)
    logs: list[str] = Field(default_factory=list)


class LogEntry(BaseModel):
    """A single log entry for streaming."""

    run_id: str
    timestamp: datetime
    level: LogLevel
    message: str
    node_id: str | None = None
    step_index: int | None = None


# ============================================
# Completion
# ============================================


class RunResult(BaseModel):
    """Final result of a run."""

    run_id: str
    status: RunStatus
    started_at: datetime
    completed_at: datetime
    duration_ms: int
    steps_completed: int
    steps_failed: int
    output: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    logs: list[str] = Field(default_factory=list)
    artifacts: list[str] = Field(default_factory=list)  # Paths to artifact files
