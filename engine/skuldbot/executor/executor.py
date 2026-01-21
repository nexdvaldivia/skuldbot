"""
Executor principal con soporte para debug y producción

Incluye generación automática de Evidence Pack para compliance.
"""

import subprocess
import sys
import time
import uuid
from enum import Enum
from pathlib import Path
from typing import Optional, Callable, Dict, Any, List
from dataclasses import dataclass, field
from datetime import datetime


def get_robot_executable() -> str:
    """Get the robot executable from the same environment as the current Python"""
    # Get the directory where the current Python executable lives
    python_dir = Path(sys.executable).parent

    # Look for robot in the same directory (works for venv)
    robot_path = python_dir / "robot"
    if robot_path.exists():
        return str(robot_path)

    # Fall back to just "robot" and hope it's in PATH
    return "robot"


class ExecutionMode(Enum):
    """Modo de ejecución"""

    DEBUG = "debug"
    PRODUCTION = "production"


class ExecutionStatus(Enum):
    """Estado de ejecución"""

    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class StepInfo:
    """Información de un step de ejecución"""

    node_id: str
    node_type: str
    timestamp: float
    status: ExecutionStatus
    message: Optional[str] = None
    data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class LogEntry:
    """Entrada de log"""

    level: str  # INFO, WARN, ERROR, DEBUG
    message: str
    timestamp: float
    node_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


@dataclass
class ExecutionResult:
    """Resultado de una ejecución"""

    status: ExecutionStatus
    start_time: float
    end_time: float
    duration: float
    output: Dict[str, Any]
    errors: List[Dict[str, Any]] = field(default_factory=list)
    logs: List[LogEntry] = field(default_factory=list)
    evidence_pack_path: Optional[str] = None  # Path to generated evidence pack

    @property
    def success(self) -> bool:
        return self.status == ExecutionStatus.SUCCESS


@dataclass
class ExecutionCallbacks:
    """Callbacks para eventos de ejecución"""

    on_start: Optional[Callable[[], None]] = None
    on_step: Optional[Callable[[StepInfo], None]] = None
    on_log: Optional[Callable[[LogEntry], None]] = None
    on_complete: Optional[Callable[[ExecutionResult], None]] = None
    on_error: Optional[Callable[[Exception], None]] = None


@dataclass
class EvidenceConfig:
    """Configuración para generación de Evidence Pack"""

    enabled: bool = True                    # Enable evidence pack generation
    output_dir: Optional[str] = None        # Directory for evidence packs
    tenant_id: str = "default"              # Tenant identifier
    policy_pack_id: str = ""                # Policy pack to apply
    policy_pack_version: str = ""           # Policy pack version
    signing_key: Optional[str] = None       # Key for cryptographic signing
    capture_screenshots: bool = True        # Capture screenshots during execution


class Executor:
    """
    Motor de ejecución de bots con soporte para debug y producción.

    Genera automáticamente Evidence Packs para compliance (HIPAA, SOC2, etc.)
    cuando se ejecuta en modo producción.
    """

    def __init__(
        self,
        mode: ExecutionMode = ExecutionMode.PRODUCTION,
        robot_options: Optional[Dict[str, Any]] = None,
        evidence_config: Optional[EvidenceConfig] = None,
    ):
        self.mode = mode
        self.robot_options = robot_options or {}
        self._current_execution: Optional[ExecutionResult] = None

        # Evidence Pack configuration
        self.evidence_config = evidence_config or EvidenceConfig(
            enabled=(mode == ExecutionMode.PRODUCTION)
        )
        self._evidence_writer = None

    def run_from_package(
        self,
        package_path: str,
        callbacks: Optional[Dict[str, Callable]] = None,
        variables: Optional[Dict[str, Any]] = None,
        bot_id: Optional[str] = None,
        bot_name: Optional[str] = None,
        execution_id: Optional[str] = None,
    ) -> ExecutionResult:
        """
        Ejecuta un bot desde un package en disco

        Args:
            package_path: Path al directorio del bot package
            callbacks: Diccionario con callbacks (on_start, on_step, on_log, etc)
            variables: Variables a pasar al bot
            bot_id: Bot identifier (for evidence pack)
            bot_name: Bot name (for evidence pack)
            execution_id: Execution identifier (auto-generated if not provided)

        Returns:
            ExecutionResult con el resultado de la ejecución
        """
        package_path = Path(package_path)

        if not package_path.exists():
            raise FileNotFoundError(f"Package path does not exist: {package_path}")

        main_skb = package_path / "main.skb"
        if not main_skb.exists():
            raise FileNotFoundError(f"main.skb not found in {package_path}")

        # Read manifest if available
        manifest_path = package_path / "manifest.json"
        manifest = {}
        if manifest_path.exists():
            import json
            with open(manifest_path) as f:
                manifest = json.load(f)

        # Use manifest values or provided values
        bot_id = bot_id or manifest.get("bot_id", package_path.name)
        bot_name = bot_name or manifest.get("bot_name", package_path.name)
        execution_id = execution_id or str(uuid.uuid4())

        return self._execute_robot(
            main_skb,
            callbacks,
            variables,
            bot_id=bot_id,
            bot_name=bot_name,
            execution_id=execution_id,
        )

    def run_from_dsl(
        self,
        dsl: Dict[str, Any],
        callbacks: Optional[Dict[str, Callable]] = None,
        variables: Optional[Dict[str, Any]] = None,
        execution_id: Optional[str] = None,
    ) -> ExecutionResult:
        """
        Compila y ejecuta un DSL directamente (útil para Studio)

        Args:
            dsl: Diccionario DSL
            callbacks: Callbacks de ejecución
            variables: Variables a pasar al bot
            execution_id: Execution identifier (auto-generated if not provided)

        Returns:
            ExecutionResult
        """
        from skuldbot.compiler import Compiler
        import tempfile

        # Extract bot info from DSL
        bot_info = dsl.get("bot", {})
        bot_id = bot_info.get("id", "unknown")
        bot_name = bot_info.get("name", "Unknown Bot")
        execution_id = execution_id or str(uuid.uuid4())

        # Compilar a directorio temporal
        compiler = Compiler()
        with tempfile.TemporaryDirectory() as temp_dir:
            bot_dir = compiler.compile_to_disk(dsl, temp_dir)
            return self.run_from_package(
                str(bot_dir),
                callbacks,
                variables,
                bot_id=bot_id,
                bot_name=bot_name,
                execution_id=execution_id,
            )

    def _execute_robot(
        self,
        robot_file: Path,
        callbacks: Optional[Dict[str, Callable]] = None,
        variables: Optional[Dict[str, Any]] = None,
        bot_id: str = "unknown",
        bot_name: str = "Unknown Bot",
        execution_id: str = "",
    ) -> ExecutionResult:
        """Ejecuta Robot Framework"""
        callbacks = callbacks or {}
        start_time = time.time()
        execution_id = execution_id or str(uuid.uuid4())
        evidence_pack_path = None

        # Initialize Evidence Pack writer if enabled
        if self.evidence_config.enabled:
            try:
                from skuldbot.evidence import EvidencePackWriter
                self._evidence_writer = EvidencePackWriter(
                    execution_id=execution_id,
                    bot_id=bot_id,
                    bot_name=bot_name,
                    tenant_id=self.evidence_config.tenant_id,
                    policy_pack_id=self.evidence_config.policy_pack_id,
                    policy_pack_version=self.evidence_config.policy_pack_version,
                    signing_key=self.evidence_config.signing_key,
                    environment="debug" if self.mode == ExecutionMode.DEBUG else "production",
                )
            except ImportError:
                self._evidence_writer = None

        # Callback on_start
        if "on_start" in callbacks:
            callbacks["on_start"]()

        # Construir comando robot (usa el ejecutable del mismo entorno que Python)
        robot_exe = get_robot_executable()
        cmd = [robot_exe]

        # Use .skb extension for SkuldBot files
        cmd.extend(["--extension", "skb"])

        # Opciones según modo
        if self.mode == ExecutionMode.DEBUG:
            cmd.extend(["--loglevel", "DEBUG"])
        else:
            cmd.extend(["--loglevel", "INFO"])

        # Variables
        if variables:
            for key, value in variables.items():
                cmd.extend(["--variable", f"{key}:{value}"])

        # Output directory
        output_dir = robot_file.parent / "output"
        output_dir.mkdir(exist_ok=True)
        cmd.extend(["--outputdir", str(output_dir)])

        # Archivo robot
        cmd.append(str(robot_file))

        # Ejecutar
        logs: List[LogEntry] = []
        errors: List[Dict[str, Any]] = []

        try:
            # Log inicio
            log_entry = LogEntry(
                level="INFO",
                message=f"Starting bot execution: {robot_file.name}",
                timestamp=time.time(),
            )
            logs.append(log_entry)
            if "on_log" in callbacks:
                callbacks["on_log"](log_entry)

            # Record in evidence pack
            if self._evidence_writer:
                self._evidence_writer.add_log("INFO", f"Starting bot execution: {robot_file.name}")

            # Ejecutar proceso
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd=robot_file.parent,
            )

            # Parsear output
            if "on_log" in callbacks:
                for line in result.stdout.split("\n"):
                    if line.strip():
                        log_entry = LogEntry(
                            level="INFO", message=line, timestamp=time.time()
                        )
                        logs.append(log_entry)
                        callbacks["on_log"](log_entry)

                        # Record in evidence pack (auto-redacted)
                        if self._evidence_writer:
                            self._evidence_writer.add_log("INFO", line)

            # Determinar status
            if result.returncode == 0:
                status = ExecutionStatus.SUCCESS
                if self._evidence_writer:
                    self._evidence_writer.add_log("INFO", "Bot execution completed successfully")
            else:
                status = ExecutionStatus.FAILED
                error = {
                    "code": "EXECUTION_FAILED",
                    "message": result.stderr or "Unknown error",
                    "return_code": result.returncode,
                }
                errors.append(error)

                if self._evidence_writer:
                    self._evidence_writer.add_log(
                        "ERROR",
                        f"Bot execution failed: {result.stderr or 'Unknown error'}",
                    )

        except Exception as e:
            status = ExecutionStatus.FAILED
            error = {
                "code": "EXCEPTION",
                "message": str(e),
            }
            errors.append(error)

            if self._evidence_writer:
                self._evidence_writer.add_log("ERROR", f"Exception during execution: {str(e)}")

            if "on_error" in callbacks:
                callbacks["on_error"](e)

        end_time = time.time()
        duration = end_time - start_time

        # Finalize and save evidence pack
        if self._evidence_writer:
            try:
                # Determine output directory
                evidence_output_dir = self.evidence_config.output_dir
                if not evidence_output_dir:
                    evidence_output_dir = str(output_dir / "evidence")

                evidence_pack_path = self._evidence_writer.save(evidence_output_dir)
            except Exception as e:
                # Log but don't fail execution due to evidence pack error
                log_entry = LogEntry(
                    level="WARN",
                    message=f"Failed to save evidence pack: {str(e)}",
                    timestamp=time.time(),
                )
                logs.append(log_entry)

        # Crear resultado
        execution_result = ExecutionResult(
            status=status,
            start_time=start_time,
            end_time=end_time,
            duration=duration,
            output=self._parse_robot_output(output_dir),
            errors=errors,
            logs=logs,
            evidence_pack_path=evidence_pack_path,
        )

        # Callback on_complete
        if "on_complete" in callbacks:
            callbacks["on_complete"](execution_result)

        return execution_result

    def _parse_robot_output(self, output_dir: Path) -> Dict[str, Any]:
        """Parsea el output de Robot Framework"""
        output_xml = output_dir / "output.xml"

        if not output_xml.exists():
            return {}

        # TODO: Parsear output.xml con robot.api
        # Por ahora retornamos info básica
        return {
            "output_xml": str(output_xml),
            "log_html": str(output_dir / "log.html"),
            "report_html": str(output_dir / "report.html"),
        }

    def stop(self) -> None:
        """Detiene la ejecución actual"""
        # TODO: Implementar cancelación de proceso
        if self._current_execution:
            self._current_execution.status = ExecutionStatus.CANCELLED

