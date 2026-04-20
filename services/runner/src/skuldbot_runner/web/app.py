"""FastAPI application for Runner local UI."""

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator

import structlog
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

logger = structlog.get_logger()

# Get template directory
TEMPLATES_DIR = Path(__file__).parent / "templates"
STATIC_DIR = Path(__file__).parent / "static"


class RunnerState:
    """Shared state for the runner web UI."""

    def __init__(self, config=None):
        self.agent = None
        self.config = config
        self.secrets_manager = None
        self.start_time = datetime.utcnow()
        self.jobs_completed = 0
        self.jobs_failed = 0
        self.current_job = None
        self.recent_logs: list[dict] = []
        self.max_logs = 1000
        self._log_subscribers: list[asyncio.Queue] = []

        # Initialize secrets manager if config provided
        if config:
            self._init_secrets_manager()

    def _init_secrets_manager(self):
        """Initialize the secrets manager."""
        try:
            from ..secrets import SecretsManager, EnvSecretsProvider, FileSecretsProvider

            self.secrets_manager = SecretsManager()

            # Add environment provider
            self.secrets_manager.add_provider("env", EnvSecretsProvider())

            # Add file provider if configured
            secrets_file = Path(self.config.work_dir) / "secrets.json"
            self.secrets_manager.add_provider(
                "file",
                FileSecretsProvider(str(secrets_file)),
                primary=True,
            )

            logger.info("Secrets manager initialized")
        except Exception as e:
            logger.warning("Failed to initialize secrets manager", error=str(e))

    def add_log(self, level: str, message: str, **extra):
        """Add a log entry and notify subscribers."""
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": level,
            "message": message,
            **extra,
        }
        self.recent_logs.append(log_entry)
        if len(self.recent_logs) > self.max_logs:
            self.recent_logs = self.recent_logs[-self.max_logs:]

        # Notify all subscribers
        for queue in self._log_subscribers:
            try:
                queue.put_nowait(log_entry)
            except asyncio.QueueFull:
                pass  # Drop if queue is full

    def subscribe_logs(self) -> asyncio.Queue:
        """Subscribe to log updates."""
        queue = asyncio.Queue(maxsize=100)
        self._log_subscribers.append(queue)
        return queue

    def unsubscribe_logs(self, queue: asyncio.Queue):
        """Unsubscribe from log updates."""
        if queue in self._log_subscribers:
            self._log_subscribers.remove(queue)


# Global state
state = RunnerState()


def create_app(runner_state: RunnerState | None = None) -> FastAPI:
    """Create the FastAPI application."""
    global state
    if runner_state:
        state = runner_state

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info("Runner Web UI starting")
        state.add_log("info", "Runner Web UI started")
        yield
        logger.info("Runner Web UI stopping")

    app = FastAPI(
        title="SkuldBot Runner",
        description="Local management UI for SkuldBot Runner Agent",
        version="0.1.0",
        lifespan=lifespan,
    )

    # Create directories if needed
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

    # Mount static files
    if STATIC_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    # Templates
    templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

    # ============================================
    # HTML Routes
    # ============================================

    @app.get("/", response_class=HTMLResponse)
    async def index(request: Request):
        """Dashboard page."""
        return templates.TemplateResponse("index.html", {
            "request": request,
            "state": state,
        })

    @app.get("/config", response_class=HTMLResponse)
    async def config_page(request: Request):
        """Configuration page."""
        return templates.TemplateResponse("config.html", {
            "request": request,
            "config": state.config,
        })

    @app.get("/secrets", response_class=HTMLResponse)
    async def secrets_page(request: Request):
        """Secrets management page."""
        return templates.TemplateResponse("secrets.html", {
            "request": request,
        })

    @app.get("/logs", response_class=HTMLResponse)
    async def logs_page(request: Request):
        """Logs viewer page."""
        return templates.TemplateResponse("logs.html", {
            "request": request,
        })

    # ============================================
    # API Routes
    # ============================================

    @app.get("/api/status")
    async def get_status():
        """Get runner status."""
        uptime = (datetime.utcnow() - state.start_time).total_seconds()

        agent_running = False
        runner_id = None
        if state.agent:
            agent_running = getattr(state.agent, 'running', False)
            runner_id = getattr(state.agent, 'runner_id', None)

        return {
            "status": "running" if agent_running else "stopped",
            "uptime_seconds": uptime,
            "runner_id": runner_id,
            "runner_name": state.config.runner_name if state.config else None,
            "orchestrator_url": state.config.orchestrator_url if state.config else None,
            "api_key_configured": bool(state.config and state.config.api_key),
            "current_job": state.current_job,
            "jobs_completed": state.jobs_completed,
            "jobs_failed": state.jobs_failed,
            "connected": state.agent is not None and agent_running,
        }

    @app.get("/api/system")
    async def get_system_info():
        """Get system information."""
        from ..system_info import get_system_info
        return get_system_info()

    @app.get("/api/logs")
    async def get_logs(limit: int = 100, level: str | None = None, range: str = "live"):
        """Get recent logs."""
        logs = state.recent_logs.copy()
        if level:
            logs = [l for l in logs if l["level"] == level]
        return {"logs": logs[-limit:]}

    @app.get("/api/logs/stream")
    async def stream_logs(request: Request):
        """Stream logs via Server-Sent Events."""
        from sse_starlette.sse import EventSourceResponse

        async def event_generator() -> AsyncGenerator[dict, None]:
            queue = state.subscribe_logs()
            try:
                while True:
                    # Check if client disconnected
                    if await request.is_disconnected():
                        break

                    try:
                        log_entry = await asyncio.wait_for(queue.get(), timeout=30.0)
                        yield {"data": json.dumps(log_entry)}
                    except asyncio.TimeoutError:
                        # Send keepalive
                        yield {"comment": "keepalive"}
            finally:
                state.unsubscribe_logs(queue)

        return EventSourceResponse(event_generator())

    @app.get("/api/config")
    async def get_config():
        """Get current configuration."""
        if not state.config:
            return {"configured": False}

        return {
            "configured": True,
            "orchestrator_url": state.config.orchestrator_url or "",
            "api_key": "***" + state.config.api_key[-8:] if state.config.api_key else "",
            "api_key_set": bool(state.config.api_key),
            "runner_name": state.config.runner_name,
            "labels": state.config.labels or {},
            "capabilities": state.config.capabilities or [],
            "poll_interval": state.config.poll_interval,
            "heartbeat_interval": state.config.heartbeat_interval,
            "job_timeout": state.config.job_timeout,
            "work_dir": state.config.work_dir,
        }

    class ConfigUpdate(BaseModel):
        orchestrator_url: str | None = None
        api_key: str | None = None
        runner_name: str | None = None
        labels: dict[str, str] | None = None
        capabilities: list[str] | None = None
        poll_interval: int | None = None
        heartbeat_interval: int | None = None
        job_timeout: int | None = None

    @app.put("/api/config")
    async def update_config(update: ConfigUpdate):
        """Update configuration."""
        if not state.config:
            raise HTTPException(status_code=400, detail="Runner not initialized")

        updated = []

        if update.orchestrator_url is not None:
            state.config.orchestrator_url = update.orchestrator_url
            updated.append("orchestrator_url")
        if update.api_key is not None:
            state.config.api_key = update.api_key
            updated.append("api_key")
        if update.runner_name is not None:
            state.config.runner_name = update.runner_name
            updated.append("runner_name")
        if update.labels is not None:
            state.config.labels = update.labels
            updated.append("labels")
        if update.capabilities is not None:
            state.config.capabilities = update.capabilities
            updated.append("capabilities")
        if update.poll_interval is not None:
            state.config.poll_interval = update.poll_interval
            updated.append("poll_interval")
        if update.heartbeat_interval is not None:
            state.config.heartbeat_interval = update.heartbeat_interval
            updated.append("heartbeat_interval")
        if update.job_timeout is not None:
            state.config.job_timeout = update.job_timeout
            updated.append("job_timeout")

        state.add_log("info", f"Configuration updated: {', '.join(updated)}")

        return {"success": True, "message": "Configuration updated", "updated": updated}

    @app.post("/api/config/test")
    async def test_connection():
        """Test connection to orchestrator."""
        if not state.config or not state.config.orchestrator_url:
            return {"success": False, "message": "Orchestrator URL not configured"}

        import httpx

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{state.config.orchestrator_url}/health",
                    timeout=10.0,
                )
                if response.status_code == 200:
                    return {"success": True, "message": "Connection successful"}
                else:
                    return {"success": False, "message": f"Server returned {response.status_code}"}
        except httpx.RequestError as e:
            return {"success": False, "message": f"Connection failed: {str(e)}"}

    # ============================================
    # Registration API
    # ============================================

    class RegisterRequest(BaseModel):
        orchestrator_url: str
        name: str
        labels: dict[str, str] | None = None
        capabilities: list[str] | None = None

    @app.post("/api/register")
    async def register_runner(req: RegisterRequest):
        """Register this runner with the orchestrator."""
        import httpx
        from ..system_info import get_system_info

        system_info = get_system_info()

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{req.orchestrator_url}/runners/register",
                    json={
                        "name": req.name,
                        "labels": req.labels or {},
                        "capabilities": req.capabilities or ["web", "desktop", "office"],
                        "agentVersion": "0.1.0",
                        "systemInfo": system_info,
                    },
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()

                api_key = data.get("apiKey")
                runner_info = data.get("runner", {})

                # Update config
                if state.config:
                    state.config.orchestrator_url = req.orchestrator_url
                    state.config.api_key = api_key
                    state.config.runner_name = req.name
                    if req.labels:
                        state.config.labels = req.labels
                    if req.capabilities:
                        state.config.capabilities = req.capabilities

                state.add_log("info", f"Runner registered: {runner_info.get('id')}")

                return {
                    "success": True,
                    "runner_id": runner_info.get("id"),
                    "api_key": api_key,
                    "message": "Registration successful",
                }

        except httpx.HTTPStatusError as e:
            error_detail = e.response.text
            return {
                "success": False,
                "message": f"Registration failed: {e.response.status_code}",
                "detail": error_detail,
            }
        except httpx.RequestError as e:
            return {
                "success": False,
                "message": f"Connection failed: {str(e)}",
            }

    # ============================================
    # Secrets API
    # ============================================

    @app.get("/api/secrets")
    async def list_secrets():
        """List all secrets (keys only, not values)."""
        if not state.secrets_manager:
            return {"providers": {}}

        try:
            secrets = await state.secrets_manager.list_secrets()
            return {"providers": secrets}
        except Exception as e:
            logger.error("Failed to list secrets", error=str(e))
            return {"providers": {}, "error": str(e)}

    class SecretCreate(BaseModel):
        key: str
        value: str

    @app.post("/api/secrets")
    async def create_secret(secret: SecretCreate):
        """Create or update a secret."""
        if not state.secrets_manager:
            raise HTTPException(status_code=400, detail="Secrets manager not configured")

        try:
            await state.secrets_manager.set_secret(secret.key, secret.value)
            state.add_log("info", f"Secret saved: {secret.key}")
            return {"success": True, "key": secret.key, "message": "Secret saved"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    @app.delete("/api/secrets/{key}")
    async def delete_secret(key: str):
        """Delete a secret."""
        if not state.secrets_manager:
            raise HTTPException(status_code=400, detail="Secrets manager not configured")

        try:
            await state.secrets_manager.delete_secret(key)
            state.add_log("info", f"Secret deleted: {key}")
            return {"success": True, "key": key, "message": "Secret deleted"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    @app.get("/api/secrets/health")
    async def secrets_health():
        """Check secrets providers health."""
        if not state.secrets_manager:
            return {"healthy": False, "providers": {}}

        try:
            providers_health = await state.secrets_manager.health_check()
            return {
                "healthy": all(providers_health.values()) if providers_health else False,
                "providers": providers_health,
            }
        except Exception as e:
            return {"healthy": False, "providers": {}, "error": str(e)}

    # ============================================
    # Agent Control
    # ============================================

    @app.post("/api/agent/start")
    async def start_agent():
        """Start the runner agent."""
        if state.agent:
            if getattr(state.agent, 'running', False):
                return {"success": False, "message": "Agent already running"}

            # Try to start the agent
            try:
                asyncio.create_task(state.agent.start())
                state.add_log("info", "Agent started")
                return {"success": True, "message": "Agent started"}
            except Exception as e:
                return {"success": False, "message": str(e)}

        return {"success": False, "message": "Agent not configured. Check orchestrator URL and API key."}

    @app.post("/api/agent/stop")
    async def stop_agent():
        """Stop the runner agent."""
        if state.agent:
            state.agent.running = False
            state.add_log("info", "Agent stop requested")
            return {"success": True, "message": "Stop signal sent"}
        return {"success": False, "message": "Agent not running"}

    @app.post("/api/agent/restart")
    async def restart_agent():
        """Restart the runner agent."""
        if state.agent:
            state.agent.running = False
            await asyncio.sleep(1)
            try:
                asyncio.create_task(state.agent.start())
                state.add_log("info", "Agent restarted")
                return {"success": True, "message": "Agent restarting"}
            except Exception as e:
                return {"success": False, "message": str(e)}
        return {"success": False, "message": "Agent not configured"}

    return app


async def start_web_server(
    host: str = "127.0.0.1",
    port: int = 8585,
    runner_state: RunnerState | None = None,
):
    """Start the web server."""
    app = create_app(runner_state)

    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        log_level="info",
    )
    server = uvicorn.Server(config)

    logger.info(f"Starting Runner Web UI at http://{host}:{port}")
    await server.serve()
