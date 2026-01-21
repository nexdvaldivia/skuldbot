"""Bot package executor using Robot Framework."""

import asyncio
import os
import shutil
import subprocess
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Awaitable

import structlog

from .config import RunnerConfig
from .models import Job, RunResult, RunStatus, StepProgress, StepStatus, LogEntry, LogLevel

logger = structlog.get_logger()

# Type for progress callback
ProgressCallback = Callable[[StepProgress | LogEntry], Awaitable[None]]


class BotExecutor:
    """Executes bot packages using Robot Framework."""

    def __init__(self, config: RunnerConfig):
        self.config = config
        self.work_dir = Path(config.work_dir)
        self.work_dir.mkdir(parents=True, exist_ok=True)

    async def execute(
        self,
        job: Job,
        package_path: str,
        on_progress: ProgressCallback | None = None,
    ) -> RunResult:
        """Execute a bot package and return the result."""
        started_at = datetime.utcnow()
        run_dir = self.work_dir / job.id
        logs: list[str] = []
        artifacts: list[str] = []

        async def emit_log(message: str, level: LogLevel = LogLevel.INFO, node_id: str | None = None):
            """Emit a log entry to the progress callback."""
            log_entry = LogEntry(
                run_id=job.id,
                timestamp=datetime.utcnow(),
                level=level,
                message=message,
                node_id=node_id,
            )
            logs.append(message)
            if on_progress:
                await on_progress(log_entry)

        try:
            # 1. Extract package
            logger.info("Extracting bot package", run_id=job.id)
            await emit_log("Extracting bot package...")
            extract_dir = self._extract_package(package_path, run_dir)
            await emit_log(f"Package extracted to {extract_dir.name}")

            # 2. Install dependencies if requirements.txt exists
            requirements_file = extract_dir / "requirements.txt"
            if requirements_file.exists():
                logger.info("Installing dependencies", run_id=job.id)
                await emit_log("Installing dependencies from requirements.txt...")
                await self._install_dependencies(requirements_file)
                await emit_log("Dependencies installed successfully")

            # 3. Find main.robot
            robot_file = extract_dir / "main.robot"
            if not robot_file.exists():
                await emit_log("main.robot not found in package", LogLevel.ERROR)
                raise FileNotFoundError("main.robot not found in package")

            await emit_log("Found main.robot, starting execution...")

            # 4. Prepare variables from inputs
            variables = self._prepare_variables(job.inputs)
            if variables:
                await emit_log(f"Prepared {len(variables) // 2} input variables")

            # 5. Execute Robot Framework
            logger.info("Executing Robot Framework", run_id=job.id)
            output_dir = run_dir / "output"
            output_dir.mkdir(exist_ok=True)

            await emit_log("Starting Robot Framework execution...")

            result = await self._run_robot(
                job_id=job.id,
                robot_file=robot_file,
                output_dir=output_dir,
                variables=variables,
                cwd=extract_dir,
                on_progress=on_progress,
            )

            # 6. Parse results
            completed_at = datetime.utcnow()
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)

            # Collect artifacts
            for artifact_file in output_dir.glob("*"):
                artifacts.append(str(artifact_file))

            # Emit completion log
            if result["success"]:
                await emit_log(
                    f"Execution completed successfully. Passed: {result.get('passed', 0)}, Failed: {result.get('failed', 0)}"
                )
            else:
                await emit_log(
                    f"Execution failed. Error: {result.get('error', 'Unknown error')}",
                    LogLevel.ERROR
                )

            return RunResult(
                run_id=job.id,
                status=RunStatus.SUCCESS if result["success"] else RunStatus.FAILED,
                started_at=started_at,
                completed_at=completed_at,
                duration_ms=duration_ms,
                steps_completed=result.get("passed", 0),
                steps_failed=result.get("failed", 0),
                output=result.get("output", {}),
                error=result.get("error"),
                logs=logs,
                artifacts=artifacts,
            )

        except Exception as e:
            logger.exception("Bot execution failed", run_id=job.id, error=str(e))
            completed_at = datetime.utcnow()
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)

            await emit_log(f"Fatal error: {str(e)}", LogLevel.ERROR)

            return RunResult(
                run_id=job.id,
                status=RunStatus.FAILED,
                started_at=started_at,
                completed_at=completed_at,
                duration_ms=duration_ms,
                steps_completed=0,
                steps_failed=1,
                output={},
                error=str(e),
                logs=logs,
                artifacts=artifacts,
            )

        finally:
            # Cleanup (optional - keep for debugging)
            if os.environ.get("SKULDBOT_CLEANUP_RUNS", "true").lower() == "true":
                self._cleanup(run_dir)

    def _extract_package(self, package_path: str, run_dir: Path) -> Path:
        """Extract bot package zip to run directory."""
        run_dir.mkdir(parents=True, exist_ok=True)
        extract_dir = run_dir / "bot"

        with zipfile.ZipFile(package_path, "r") as zf:
            zf.extractall(extract_dir)

        return extract_dir

    async def _install_dependencies(self, requirements_file: Path) -> None:
        """Install Python dependencies from requirements.txt."""
        process = subprocess.run(
            ["pip", "install", "-r", str(requirements_file), "--quiet"],
            capture_output=True,
            text=True,
        )
        if process.returncode != 0:
            logger.warning(
                "Failed to install some dependencies",
                stderr=process.stderr,
            )

    def _prepare_variables(self, inputs: dict[str, Any]) -> list[str]:
        """Convert inputs to Robot Framework variable arguments."""
        variables = []
        for key, value in inputs.items():
            # Robot Framework uses -v NAME:value format
            if isinstance(value, (dict, list)):
                import json
                value = json.dumps(value)
            variables.extend(["-v", f"{key}:{value}"])
        return variables

    async def _run_robot(
        self,
        job_id: str,
        robot_file: Path,
        output_dir: Path,
        variables: list[str],
        cwd: Path,
        on_progress: ProgressCallback | None = None,
    ) -> dict[str, Any]:
        """Execute Robot Framework and return results with real-time log streaming."""
        cmd = [
            "robot",
            "--outputdir", str(output_dir),
            "--output", "output.xml",
            "--log", "log.html",
            "--report", "report.html",
            "--console", "verbose",  # More detailed console output
            *variables,
            str(robot_file),
        ]

        logger.debug("Running robot command", cmd=" ".join(cmd))

        # Use asyncio subprocess for real-time streaming
        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        collected_logs: list[str] = []

        async def stream_output(stream: asyncio.StreamReader, is_stderr: bool = False):
            """Stream output line by line and emit to callback."""
            while True:
                line = await stream.readline()
                if not line:
                    break

                text = line.decode("utf-8", errors="replace").rstrip()
                if not text:
                    continue

                collected_logs.append(text)

                # Emit to progress callback
                if on_progress:
                    # Determine log level from content
                    level = LogLevel.INFO
                    if is_stderr or "FAIL" in text or "ERROR" in text:
                        level = LogLevel.ERROR
                    elif "WARN" in text:
                        level = LogLevel.WARN
                    elif "DEBUG" in text:
                        level = LogLevel.DEBUG

                    log_entry = LogEntry(
                        run_id=job_id,
                        timestamp=datetime.utcnow(),
                        level=level,
                        message=text,
                    )
                    await on_progress(log_entry)

        # Stream stdout and stderr concurrently
        await asyncio.gather(
            stream_output(process.stdout, is_stderr=False),
            stream_output(process.stderr, is_stderr=True),
        )

        # Wait for process to complete
        try:
            await asyncio.wait_for(
                process.wait(),
                timeout=self.config.job_timeout_seconds
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            raise TimeoutError(f"Robot execution timed out after {self.config.job_timeout_seconds}s")

        # Parse output.xml for detailed results
        output_xml = output_dir / "output.xml"
        result = self._parse_robot_output(output_xml)
        result["logs"] = collected_logs

        return result

    def _parse_robot_output(self, output_xml: Path) -> dict[str, Any]:
        """Parse Robot Framework output.xml for results."""
        if not output_xml.exists():
            return {
                "success": False,
                "error": "No output.xml generated",
                "passed": 0,
                "failed": 1,
            }

        try:
            # Simple XML parsing - in production use robot.api.ExecutionResult
            import xml.etree.ElementTree as ET

            tree = ET.parse(output_xml)
            root = tree.getroot()

            # Find statistics
            stats = root.find(".//statistics/total/stat")
            if stats is not None:
                passed = int(stats.get("pass", 0))
                failed = int(stats.get("fail", 0))
            else:
                passed = 0
                failed = 0

            # Check for errors
            errors = root.findall(".//msg[@level='FAIL']")
            error_msgs = [e.text for e in errors if e.text]

            return {
                "success": failed == 0,
                "passed": passed,
                "failed": failed,
                "error": "; ".join(error_msgs[:5]) if error_msgs else None,
                "output": {},
            }

        except Exception as e:
            logger.warning("Failed to parse output.xml", error=str(e))
            return {
                "success": False,
                "error": f"Failed to parse results: {e}",
                "passed": 0,
                "failed": 1,
            }

    def _cleanup(self, run_dir: Path) -> None:
        """Clean up run directory."""
        try:
            if run_dir.exists():
                shutil.rmtree(run_dir)
        except Exception as e:
            logger.warning("Failed to cleanup run directory", error=str(e))
