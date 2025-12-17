"""
Executor principal con soporte para debug y producción
"""

import subprocess
import sys
import time
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


class Executor:
    """
    Motor de ejecución de bots con soporte para debug y producción
    """

    def __init__(
        self,
        mode: ExecutionMode = ExecutionMode.PRODUCTION,
        robot_options: Optional[Dict[str, Any]] = None,
    ):
        self.mode = mode
        self.robot_options = robot_options or {}
        self._current_execution: Optional[ExecutionResult] = None

    def run_from_package(
        self,
        package_path: str,
        callbacks: Optional[Dict[str, Callable]] = None,
        variables: Optional[Dict[str, Any]] = None,
    ) -> ExecutionResult:
        """
        Ejecuta un bot desde un package en disco

        Args:
            package_path: Path al directorio del bot package
            callbacks: Diccionario con callbacks (on_start, on_step, on_log, etc)
            variables: Variables a pasar al bot

        Returns:
            ExecutionResult con el resultado de la ejecución
        """
        package_path = Path(package_path)

        if not package_path.exists():
            raise FileNotFoundError(f"Package path no existe: {package_path}")

        main_robot = package_path / "main.robot"
        if not main_robot.exists():
            raise FileNotFoundError(f"main.robot no encontrado en {package_path}")

        return self._execute_robot(main_robot, callbacks, variables)

    def run_from_dsl(
        self,
        dsl: Dict[str, Any],
        callbacks: Optional[Dict[str, Callable]] = None,
        variables: Optional[Dict[str, Any]] = None,
    ) -> ExecutionResult:
        """
        Compila y ejecuta un DSL directamente (útil para Studio)

        Args:
            dsl: Diccionario DSL
            callbacks: Callbacks de ejecución
            variables: Variables a pasar al bot

        Returns:
            ExecutionResult
        """
        from skuldbot.compiler import Compiler
        import tempfile

        # Compilar a directorio temporal
        compiler = Compiler()
        with tempfile.TemporaryDirectory() as temp_dir:
            bot_dir = compiler.compile_to_disk(dsl, temp_dir)
            return self.run_from_package(str(bot_dir), callbacks, variables)

    def _execute_robot(
        self,
        robot_file: Path,
        callbacks: Optional[Dict[str, Callable]] = None,
        variables: Optional[Dict[str, Any]] = None,
    ) -> ExecutionResult:
        """Ejecuta Robot Framework"""
        callbacks = callbacks or {}
        start_time = time.time()

        # Callback on_start
        if "on_start" in callbacks:
            callbacks["on_start"]()

        # Construir comando robot (usa el ejecutable del mismo entorno que Python)
        robot_exe = get_robot_executable()
        cmd = [robot_exe]

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

            # Determinar status
            if result.returncode == 0:
                status = ExecutionStatus.SUCCESS
            else:
                status = ExecutionStatus.FAILED
                error = {
                    "code": "EXECUTION_FAILED",
                    "message": result.stderr or "Unknown error",
                    "return_code": result.returncode,
                }
                errors.append(error)

        except Exception as e:
            status = ExecutionStatus.FAILED
            error = {
                "code": "EXCEPTION",
                "message": str(e),
            }
            errors.append(error)

            if "on_error" in callbacks:
                callbacks["on_error"](e)

        end_time = time.time()
        duration = end_time - start_time

        # Crear resultado
        execution_result = ExecutionResult(
            status=status,
            start_time=start_time,
            end_time=end_time,
            duration=duration,
            output=self._parse_robot_output(output_dir),
            errors=errors,
            logs=logs,
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

