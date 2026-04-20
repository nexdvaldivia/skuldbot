"""CLI entry point for the runner agent."""

import argparse
import asyncio
import sys
import webbrowser
from typing import Optional

import structlog

from .agent import RunnerAgent
from .config import load_config, RunnerConfig


def setup_logging(level: str = "INFO"):
    """Configure structured logging."""
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.dev.ConsoleRenderer() if sys.stderr.isatty() else structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    import logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stderr,
        level=getattr(logging, level.upper()),
    )


def cmd_run(args):
    """Run the agent (polling mode)."""
    config = load_config()
    setup_logging(config.log_level)

    logger = structlog.get_logger()
    logger.info(
        "SkuldBot Runner starting",
        orchestrator_url=config.orchestrator_url,
        runner_name=config.runner_name,
        labels=config.labels,
        capabilities=config.capabilities,
    )

    # Validate configuration
    if not config.orchestrator_url:
        logger.error("SKULDBOT_ORCHESTRATOR_URL is required")
        logger.info("Run 'skuldbot-runner ui' to configure via web interface")
        sys.exit(1)

    if not config.api_key:
        logger.error("SKULDBOT_API_KEY is required")
        logger.info("Run 'skuldbot-runner register' to get an API key")
        sys.exit(1)

    # Create and run agent
    agent = RunnerAgent(config)

    try:
        asyncio.run(agent.start())
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        sys.exit(0)


def cmd_ui(args):
    """Start the local web UI for configuration and monitoring."""
    config = load_config()
    setup_logging(config.log_level)

    logger = structlog.get_logger()

    # Import here to avoid slow startup when not using UI
    try:
        import uvicorn
        from .web.app import create_app, RunnerState
    except ImportError:
        logger.error("Web UI dependencies not installed. Run: pip install skuldbot-runner[web]")
        sys.exit(1)

    host = args.host or "127.0.0.1"
    port = args.port or 8585

    logger.info(f"Starting SkuldBot Runner UI at http://{host}:{port}")

    # Create app with shared state
    state = RunnerState(config=config)
    app = create_app(state)

    # Open browser if requested
    if args.open:
        webbrowser.open(f"http://{host}:{port}")

    # Run server
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="warning",  # Reduce uvicorn noise
    )


def cmd_ui_agent(args):
    """Start both the web UI and the agent together."""
    config = load_config()
    setup_logging(config.log_level)

    logger = structlog.get_logger()

    try:
        import uvicorn
        from .web.app import create_app, RunnerState
    except ImportError:
        logger.error("Web UI dependencies not installed. Run: pip install skuldbot-runner[web]")
        sys.exit(1)

    host = args.host or "127.0.0.1"
    port = args.port or 8585

    # Create shared state
    state = RunnerState(config=config)

    # Create agent if configured
    agent: Optional[RunnerAgent] = None
    if config.orchestrator_url and config.api_key:
        agent = RunnerAgent(config)
        state.agent = agent
        logger.info(
            "Agent configured",
            orchestrator_url=config.orchestrator_url,
            runner_name=config.runner_name,
        )
    else:
        logger.warning("Agent not started - missing configuration")
        logger.info(f"Configure via web UI at http://{host}:{port}/config")

    app = create_app(state)

    # Open browser if requested
    if args.open:
        webbrowser.open(f"http://{host}:{port}")

    async def run_all():
        """Run both UI server and agent."""
        # Configure uvicorn
        config_uvicorn = uvicorn.Config(
            app,
            host=host,
            port=port,
            log_level="warning",
        )
        server = uvicorn.Server(config_uvicorn)

        if agent:
            # Run both concurrently
            await asyncio.gather(
                server.serve(),
                agent.start(),
            )
        else:
            # Just run the server
            await server.serve()

    try:
        logger.info(f"Starting SkuldBot Runner at http://{host}:{port}")
        asyncio.run(run_all())
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        sys.exit(0)


async def cmd_register_async(args):
    """Register this runner with the orchestrator."""
    import httpx
    from .system_info import get_system_info

    config = load_config()
    setup_logging(config.log_level)

    logger = structlog.get_logger()

    orchestrator_url = args.url or config.orchestrator_url
    if not orchestrator_url:
        logger.error("Orchestrator URL required. Use --url or set SKULDBOT_ORCHESTRATOR_URL")
        sys.exit(1)

    name = args.name or config.runner_name
    labels = {}
    if args.labels:
        for item in args.labels.split(","):
            if "=" in item:
                k, v = item.split("=", 1)
                labels[k.strip()] = v.strip()

    capabilities = args.capabilities.split(",") if args.capabilities else config.capabilities

    logger.info(
        "Registering runner",
        url=orchestrator_url,
        name=name,
        labels=labels,
        capabilities=capabilities,
    )

    system_info = get_system_info()

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{orchestrator_url}/runners/register",
                json={
                    "name": name,
                    "labels": labels,
                    "capabilities": capabilities,
                    "agentVersion": "0.1.0",
                    "systemInfo": system_info,
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            api_key = data.get("apiKey")
            runner_id = data.get("runner", {}).get("id")

            logger.info("Registration successful", runner_id=runner_id)
            print("\n" + "=" * 60)
            print("RUNNER REGISTERED SUCCESSFULLY")
            print("=" * 60)
            print(f"\nRunner ID: {runner_id}")
            print(f"Runner Name: {name}")
            print(f"\nAPI Key (save this - it won't be shown again):")
            print(f"\n  {api_key}\n")
            print("Add to your environment:")
            print(f"  export SKULDBOT_API_KEY={api_key}")
            print(f"  export SKULDBOT_ORCHESTRATOR_URL={orchestrator_url}")
            print("\nOr add to .env file:")
            print(f"  SKULDBOT_API_KEY={api_key}")
            print(f"  SKULDBOT_ORCHESTRATOR_URL={orchestrator_url}")
            print("=" * 60 + "\n")

        except httpx.HTTPStatusError as e:
            logger.error("Registration failed", status=e.response.status_code, detail=e.response.text)
            sys.exit(1)
        except httpx.RequestError as e:
            logger.error("Connection failed", error=str(e))
            sys.exit(1)


def cmd_register(args):
    """Register wrapper."""
    asyncio.run(cmd_register_async(args))


def cmd_status(args):
    """Show current runner status."""
    config = load_config()
    setup_logging("WARNING")  # Quiet logging

    from .system_info import get_system_info

    print("\n" + "=" * 50)
    print("SKULDBOT RUNNER STATUS")
    print("=" * 50)

    print(f"\nConfiguration:")
    print(f"  Orchestrator URL: {config.orchestrator_url or '(not set)'}")
    print(f"  API Key: {'***' + config.api_key[-8:] if config.api_key else '(not set)'}")
    print(f"  Runner Name: {config.runner_name}")
    print(f"  Labels: {config.labels or {}}")
    print(f"  Capabilities: {config.capabilities}")

    print(f"\nSettings:")
    print(f"  Poll Interval: {config.poll_interval}s")
    print(f"  Heartbeat Interval: {config.heartbeat_interval}s")
    print(f"  Job Timeout: {config.job_timeout}s")
    print(f"  Work Directory: {config.work_dir}")

    system_info = get_system_info()
    print(f"\nSystem:")
    print(f"  OS: {system_info.get('os', 'unknown')}")
    print(f"  Platform: {system_info.get('platform', 'unknown')}")
    print(f"  Python: {system_info.get('python_version', 'unknown')}")
    print(f"  CPUs: {system_info.get('cpu_count', 'unknown')}")
    print(f"  Memory: {system_info.get('memory_total_gb', 0):.1f} GB")

    if config.orchestrator_url and config.api_key:
        print(f"\nStatus: READY")
        print("  Run 'skuldbot-runner run' to start polling for jobs")
    else:
        print(f"\nStatus: NOT CONFIGURED")
        print("  Run 'skuldbot-runner register' or 'skuldbot-runner ui' to configure")

    print("=" * 50 + "\n")


def main():
    """Main entry point with subcommands."""
    parser = argparse.ArgumentParser(
        prog="skuldbot-runner",
        description="SkuldBot Runner Agent - Executes RPA bots from Orchestrator",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # run command
    run_parser = subparsers.add_parser("run", help="Start the agent in polling mode")
    run_parser.set_defaults(func=cmd_run)

    # ui command
    ui_parser = subparsers.add_parser("ui", help="Start the local web UI only")
    ui_parser.add_argument("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    ui_parser.add_argument("--port", type=int, default=8585, help="Port to bind (default: 8585)")
    ui_parser.add_argument("--open", action="store_true", help="Open browser automatically")
    ui_parser.set_defaults(func=cmd_ui)

    # start command (ui + agent)
    start_parser = subparsers.add_parser("start", help="Start both web UI and agent")
    start_parser.add_argument("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    start_parser.add_argument("--port", type=int, default=8585, help="Port to bind (default: 8585)")
    start_parser.add_argument("--open", action="store_true", help="Open browser automatically")
    start_parser.set_defaults(func=cmd_ui_agent)

    # register command
    reg_parser = subparsers.add_parser("register", help="Register this runner with orchestrator")
    reg_parser.add_argument("--url", help="Orchestrator URL")
    reg_parser.add_argument("--name", help="Runner name")
    reg_parser.add_argument("--labels", help="Labels as key=value,key2=value2")
    reg_parser.add_argument("--capabilities", help="Capabilities as comma-separated list")
    reg_parser.set_defaults(func=cmd_register)

    # status command
    status_parser = subparsers.add_parser("status", help="Show runner status and configuration")
    status_parser.set_defaults(func=cmd_status)

    # Parse arguments
    args = parser.parse_args()

    if args.command is None:
        # Default to 'start' command with UI + agent
        parser.print_help()
        print("\nQuick start:")
        print("  skuldbot-runner start --open   # Start with web UI")
        print("  skuldbot-runner run            # Run agent only (headless)")
        print("  skuldbot-runner ui --open      # Web UI only (for config)")
        print("  skuldbot-runner register       # Register with orchestrator")
        print("  skuldbot-runner status         # Show current status")
        sys.exit(0)

    # Execute command
    args.func(args)


if __name__ == "__main__":
    main()
