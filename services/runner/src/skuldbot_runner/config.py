"""Runner configuration from environment variables."""

from pydantic import Field
from pydantic_settings import BaseSettings


class RunnerConfig(BaseSettings):
    """Configuration for the runner agent."""

    # Orchestrator connection
    orchestrator_url: str = Field(
        default="http://localhost:3000",
        description="URL of the Orchestrator API",
    )
    api_key: str = Field(
        default="",
        description="Runner API key (skr_xxx format)",
    )

    # Runner identity
    runner_name: str = Field(
        default="",
        description="Human-readable name for this runner",
    )
    labels: dict[str, str] = Field(
        default_factory=dict,
        description="Labels for runner selection (e.g., os=windows, env=prod)",
    )
    capabilities: list[str] = Field(
        default_factory=list,
        description="Capabilities this runner supports (e.g., browser, excel, sap)",
    )

    # Polling configuration
    poll_interval_seconds: int = Field(
        default=5,
        description="How often to poll for new jobs (seconds)",
    )
    heartbeat_interval_seconds: int = Field(
        default=30,
        description="How often to send heartbeat (seconds)",
    )

    # Execution configuration
    work_dir: str = Field(
        default="/tmp/skuldbot-runner",
        description="Working directory for bot execution",
    )
    max_concurrent_jobs: int = Field(
        default=1,
        description="Maximum concurrent bot executions",
    )
    job_timeout_seconds: int = Field(
        default=3600,
        description="Maximum time for a single job (seconds)",
    )

    # Logging
    log_level: str = Field(
        default="INFO",
        description="Log level (DEBUG, INFO, WARNING, ERROR)",
    )

    model_config = {
        "env_prefix": "SKULDBOT_",
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


def load_config() -> RunnerConfig:
    """Load configuration from environment."""
    return RunnerConfig()
