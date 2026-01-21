"""HTTP client for communicating with the Orchestrator API."""

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
        result = RegisterResponse(**data)

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
        response = await self.client.post(
            "/runner-agent/heartbeat",
            json=request.model_dump(),
        )
        response.raise_for_status()

        return HeartbeatResponse(**response.json())

    # ============================================
    # Job Polling
    # ============================================

    async def get_pending_jobs(self) -> list[Job]:
        """Get list of pending jobs for this runner."""
        response = await self.client.get("/runner-agent/jobs")
        response.raise_for_status()

        data = response.json()
        return [Job(**job) for job in data]

    async def claim_job(self, run_id: str) -> ClaimResponse:
        """Claim a job for execution."""
        logger.info("Claiming job", run_id=run_id)

        response = await self.client.post(
            "/runner-agent/jobs/claim",
            json={"runId": run_id},
        )
        response.raise_for_status()

        return ClaimResponse(**response.json())

    # ============================================
    # Progress Reporting
    # ============================================

    async def report_progress(self, progress: ProgressReport) -> None:
        """Report progress on current run."""
        response = await self.client.post(
            "/runner-agent/progress",
            json=progress.model_dump(),
        )
        response.raise_for_status()

    async def send_log(self, log: LogEntry) -> None:
        """Send a single log entry for real-time streaming."""
        try:
            response = await self.client.post(
                "/runner-agent/log",
                json=log.model_dump(mode="json"),
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
            json=result.model_dump(),
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
