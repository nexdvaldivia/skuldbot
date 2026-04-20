"""
Executor: Motor de ejecución con hooks y callbacks

Incluye generación automática de Evidence Pack para compliance.
"""

from skuldbot.executor.executor import (
    Executor,
    ExecutionMode,
    ExecutionResult,
    ExecutionStatus,
    ExecutionCallbacks,
    EvidenceConfig,
    StepInfo,
    LogEntry,
)

__all__ = [
    "Executor",
    "ExecutionMode",
    "ExecutionResult",
    "ExecutionStatus",
    "ExecutionCallbacks",
    "EvidenceConfig",
    "StepInfo",
    "LogEntry",
]

