"""Main runner agent - the "dumb" worker that polls and executes."""

import asyncio
import signal
import tempfile
from datetime import datetime
from pathlib import Path

import structlog

from .api_client import OrchestratorClient
from .config import RunnerConfig
from .executor import BotExecutor
from .models import (
    HeartbeatRequest,
    Job,
    LogEntry,
    ProgressReport,
    RegisterRequest,
    RunResult,
    RunStatus,
    StepProgress,
)
from .system_info import get_system_info

logger = structlog.get_logger()


class RunnerAgent:
    """
    The "dumb" runner agent.

    It only does:
    1. Register with Orchestrator
    2. Send heartbeats
    3. Poll for jobs
    4. Download bot packages
    5. Execute with Robot Framework
    6. Report results

    All intelligence is in the Orchestrator.
    """

    def __init__(self, config: RunnerConfig):
        self.config = config
        self.client = OrchestratorClient(config)
        self.executor = BotExecutor(config)

        self.runner_id: str | None = None
        self.running = False
        self.current_job: Job | None = None

    async def start(self):
        """Start the runner agent."""
        logger.info("Starting runner agent", name=self.config.runner_name)

        # Setup signal handlers
        loop = asyncio.get_event_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, self._shutdown)

        self.running = True

        try:
            # Register if we don't have an API key
            if not self.config.api_key:
                await self._register()

            # Start background tasks
            heartbeat_task = asyncio.create_task(self._heartbeat_loop())
            poll_task = asyncio.create_task(self._poll_loop())

            # Wait for shutdown
            await asyncio.gather(heartbeat_task, poll_task)

        except asyncio.CancelledError:
            logger.info("Runner agent cancelled")
        except Exception as e:
            logger.exception("Runner agent error", error=str(e))
        finally:
            await self._cleanup()

    def _shutdown(self):
        """Handle shutdown signal."""
        logger.info("Shutdown signal received")
        self.running = False

    async def _cleanup(self):
        """Cleanup resources."""
        await self.client.close()
        logger.info("Runner agent stopped")

    async def _register(self):
        """Register this runner with the Orchestrator."""
        system_info = get_system_info()

        request = RegisterRequest(
            name=self.config.runner_name or f"runner-{system_info.hostname}",
            labels=self.config.labels,
            capabilities=self.config.capabilities,
            system_info=system_info,
        )

        response = await self.client.register(request)

        self.runner_id = response.id
        # Update config with received API key
        self.config.api_key = response.api_key

        # Recreate client with new API key
        await self.client.close()
        self.client = OrchestratorClient(self.config)

        logger.info(
            "Runner registered",
            runner_id=self.runner_id,
            tenant_id=response.tenant_id,
        )

    async def _heartbeat_loop(self):
        """Send periodic heartbeats to Orchestrator."""
        while self.running:
            try:
                system_info = get_system_info()

                request = HeartbeatRequest(
                    status="busy" if self.current_job else "online",
                    current_run_id=self.current_job.id if self.current_job else None,
                    system_info=system_info,
                )

                await self.client.heartbeat(request)
                logger.debug("Heartbeat sent")

            except Exception as e:
                logger.warning("Heartbeat failed", error=str(e))

            await asyncio.sleep(self.config.heartbeat_interval_seconds)

    async def _poll_loop(self):
        """Poll for jobs and execute them."""
        while self.running:
            try:
                # Don't poll if we're already running a job
                if self.current_job is None:
                    await self._check_for_jobs()

            except Exception as e:
                logger.warning("Poll loop error", error=str(e))

            await asyncio.sleep(self.config.poll_interval_seconds)

    async def _check_for_jobs(self):
        """Check for available jobs and execute one."""
        # Get pending jobs
        jobs = await self.client.get_pending_jobs()

        if not jobs:
            return

        logger.info("Found pending jobs", count=len(jobs))

        # Try to claim the first job
        for job in jobs:
            claim_response = await self.client.claim_job(job.id)

            if claim_response.success and claim_response.job:
                await self._execute_job(claim_response.job)
                break
            else:
                logger.debug(
                    "Failed to claim job",
                    job_id=job.id,
                    message=claim_response.message,
                )

    async def _execute_job(self, job: Job):
        """Execute a claimed job."""
        self.current_job = job
        logger.info("Executing job", run_id=job.id, bot_name=job.bot_name)

        try:
            # Report that we're starting
            await self.client.report_progress(
                ProgressReport(
                    run_id=job.id,
                    status=RunStatus.RUNNING,
                    current_step=0,
                    logs=["Job started"],
                )
            )

            # Download bot package
            package_path = await self._download_package(job)

            # Execute with real-time log streaming
            result = await self.executor.execute(
                job=job,
                package_path=package_path,
                on_progress=lambda entry: self._handle_progress(entry),
            )

            # Report completion
            await self.client.complete_run(result)

            logger.info(
                "Job completed",
                run_id=job.id,
                status=result.status,
                duration_ms=result.duration_ms,
            )

        except Exception as e:
            logger.exception("Job execution failed", run_id=job.id, error=str(e))

            # Report failure
            await self.client.complete_run(
                RunResult(
                    run_id=job.id,
                    status=RunStatus.FAILED,
                    started_at=datetime.utcnow(),
                    completed_at=datetime.utcnow(),
                    duration_ms=0,
                    steps_completed=0,
                    steps_failed=1,
                    error=str(e),
                    logs=[f"Execution error: {e}"],
                    artifacts=[],
                )
            )

        finally:
            self.current_job = None

    async def _download_package(self, job: Job) -> str:
        """Download bot package to temp file."""
        # Create temp file for package
        temp_dir = Path(tempfile.gettempdir()) / "skuldbot-packages"
        temp_dir.mkdir(exist_ok=True)

        package_path = temp_dir / f"{job.id}.zip"

        await self.client.download_package(job.package_url, str(package_path))

        return str(package_path)

    async def _handle_progress(self, entry: LogEntry | StepProgress):
        """Handle progress updates from executor - either logs or step progress."""
        try:
            if isinstance(entry, LogEntry):
                # Send log entry for real-time streaming
                await self.client.send_log(entry)
            elif isinstance(entry, StepProgress):
                # Send step progress
                await self.client.report_progress(
                    ProgressReport(
                        run_id=entry.run_id if hasattr(entry, 'run_id') else self.current_job.id,
                        status=RunStatus.RUNNING,
                        steps=[entry],
                    )
                )
        except Exception as e:
            # Don't fail execution if progress reporting fails
            logger.debug("Failed to send progress", error=str(e))
