"""
Skuldbot Engine - Motor de ejecución RPA compartido
"""

from skuldbot.compiler import Compiler
from skuldbot.executor import Executor, ExecutionMode, ExecutionResult
from skuldbot.dsl import DSLValidator, BotDefinition

__version__ = "0.1.0"

__all__ = [
    "Compiler",
    "Executor",
    "ExecutionMode",
    "ExecutionResult",
    "DSLValidator",
    "BotDefinition",
]

