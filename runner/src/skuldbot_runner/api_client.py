"""HTTP client for communicating with the Orchestrator API."""

from typing import Any

import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from .config import RunnerConfig
from .models import (
    ClaimResponse,
    HeartbeatRequest,
    HeartbeatResponse,
    Job,
    LogEntry,
    ProgressReport,
    RegisterRequest,
    RegisterResponse,
    RunResult,
    StepProgress,
    StepStatus,
)

logger = structlog.get_logger()


class OrchestratorClient:
    """Client for the Orchestrator API."""

    def __init__(self, config: RunnerConfig):
        self.config = config
        self.base_url = config.orchestrator_url.rstrip("/")
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers=self._get_headers(),
                timeout=30.0,
            )
        return self._client

    def _get_headers(self) -> dict[str, str]:
        """Get headers for API requests."""
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "SkuldBot-Runner/0.1.0",
        }
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return headers

    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    # ============================================
    # Registration (no auth required)
    # ============================================

    async def register(self, request: RegisterRequest) -> RegisterResponse:
        """Register this runner with the Orchestrator."""
        logger.info("Registering runner", name=request.name)

        response = await self.client.post(
            "/runners/register",
            json=request.model_dump(),
        )
        response.raise_for_status()

        data = response.json()
        result = RegisterResponse.from_api_payload(data)

        logger.info("Runner registered", runner_id=result.id)
        return result

    # ============================================
    # Heartbeat
    # ============================================

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
    )
    async def heartbeat(self, request: HeartbeatRequest) -> HeartbeatResponse:
        """Send heartbeat to Orchestrator."""
        payload: dict[str, Any] = {"status": request.status}
        if request.current_run_id:
            payload["currentRunId"] = request.current_run_id

        if request.system_info:
            payload["metrics"] = {
                "cpuPercent": 0,
                "memoryPercent": 0,
                "activeSteps": 0,
            }

        response = await self.client.post(
            "/runner-agent/heartbeat",
            json=payload,
        )
        response.raise_for_status()

        return HeartbeatResponse.from_api_payload(response.json())

    # ============================================
    # Job Polling
    # ============================================

    async def get_pending_jobs(self) -> list[Job]:
        """Get list of pending jobs for this runner."""
        response = await self.client.get("/runner-agent/jobs")
        response.raise_for_status()

        data = response.json()
        return [Job.from_api_payload(job) for job in data]

    async def claim_job(self, run_id: str) -> ClaimResponse:
        """Claim a job for execution."""
        logger.info("Claiming job", run_id=run_id)

        response = await self.client.post(
            "/runner-agent/jobs/claim",
            json={"runId": run_id},
        )
        response.raise_for_status()

        return ClaimResponse.from_api_payload(response.json())

    # ============================================
    # Progress Reporting
    # ============================================

    async def report_progress(self, progress: ProgressReport) -> None:
        """Report progress on current run."""
        # Current orchestrator contract expects step-level events.
        if progress.steps:
            for step in progress.steps:
                payload = self._build_step_payload(progress.run_id, step)
                response = await self.client.post("/runner-agent/progress", json=payload)
                response.raise_for_status()
            return

        # Fallback heartbeat progress entry.
        payload = {
            "runId": progress.run_id,
            "stepId": "step-0",
            "nodeId": "runner.lifecycle",
            "eventType": "step_start",
            "status": progress.status.value,
            "payload": {
                "currentStep": progress.current_step,
                "totalSteps": progress.total_steps,
                "logs": progress.logs,
            },
        }
        response = await self.client.post("/runner-agent/progress", json=payload)
        response.raise_for_status()

    async def start_run(self, run_id: str) -> None:
        """Emit an initial lifecycle event for a newly claimed run."""
        response = await self.client.post(
            "/runner-agent/progress",
            json={
                "runId": run_id,
                "stepId": "step-0",
                "nodeId": "runner.lifecycle",
                "eventType": "step_start",
                "status": "running",
                "payload": {"source": "runner-agent"},
            },
        )
        response.raise_for_status()

    async def send_log(self, log: LogEntry) -> None:
        """Send a single log entry for real-time streaming."""
        try:
            response = await self.client.post(
                "/runner-agent/log",
                json={
                    "runId": log.run_id,
                    "timestamp": log.timestamp.isoformat(),
                    "level": log.level.value,
                    "message": log.message,
                    "nodeId": log.node_id,
                    "stepIndex": log.step_index,
                },
            )
            response.raise_for_status()
        except Exception:
            # Don't fail execution if log streaming fails
            pass

    # ============================================
    # Completion
    # ============================================

    async def complete_run(self, result: RunResult) -> None:
        """Report run completion."""
        logger.info(
            "Reporting run completion",
            run_id=result.run_id,
            status=result.status,
            duration_ms=result.duration_ms,
        )

        response = await self.client.post(
            "/runner-agent/complete",
            json={
                "runId": result.run_id,
                "success": result.status.is_success,
                "durationMs": result.duration_ms,
                "stepsCompleted": result.steps_completed,
                "stepsFailed": result.steps_failed,
                "outputs": result.output,
                "errorMessage": result.error,
            },
        )
        response.raise_for_status()

    # ============================================
    # Bot Package Download
    # ============================================

    async def download_package(self, url: str, dest_path: str) -> None:
        """Download bot package to local path."""
        logger.info("Downloading bot package", url=url, dest=dest_path)

        async with self.client.stream("GET", url) as response:
            response.raise_for_status()
            with open(dest_path, "wb") as f:
                async for chunk in response.aiter_bytes(chunk_size=8192):
                    f.write(chunk)

        logger.info("Package downloaded", dest=dest_path)

    @staticmethod
    def _build_step_payload(run_id: str, step: StepProgress) -> dict[str, Any]:
        if step.status == StepStatus.RUNNING:
            event_type = "step_start"
            status = "running"
        elif step.status == StepStatus.SUCCESS:
            event_type = "step_end"
            status = "success"
        elif step.status == StepStatus.FAILED:
            event_type = "step_error"
            status = "failed"
        elif step.status == StepStatus.SKIPPED:
            event_type = "step_end"
            status = "skipped"
        else:
            event_type = "step_start"
            status = step.status.value

        return {
            "runId": run_id,
            "stepId": step.step_id,
            "nodeId": step.node_id,
            "eventType": event_type,
            "status": status,
            "durationMs": OrchestratorClient._duration_ms(
                step.started_at,
                step.completed_at,
            ),
            "payload": {
                "nodeType": step.node_type,
                "output": step.output,
                "error": step.error,
            },
        }

    @staticmethod
    def _duration_ms(started_at: Any, completed_at: Any) -> int | None:
        if not started_at or not completed_at:
            return None
        try:
            return int((completed_at - started_at).total_seconds() * 1000)
        except Exception:
            return None
