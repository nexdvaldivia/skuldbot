"""
Tests para el Executor
"""

import pytest
import tempfile
from pathlib import Path
from skuldbot.executor import Executor, ExecutionMode, ExecutionStatus


def test_executor_initialization():
    """Test de inicialización del Executor"""
    executor = Executor(mode=ExecutionMode.DEBUG)
    assert executor.mode == ExecutionMode.DEBUG

    executor = Executor(mode=ExecutionMode.PRODUCTION)
    assert executor.mode == ExecutionMode.PRODUCTION


def test_run_from_dsl():
    """Test de ejecución desde DSL"""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-001", "name": "Test Bot"},
        "nodes": [
            {
                "id": "node-1",
                "type": "control.log",
                "config": {"message": "Test"},
                "outputs": {"success": "node-1", "error": "node-1"},
            }
        ],
    }

    executor = Executor(mode=ExecutionMode.PRODUCTION)

    # Callbacks de prueba
    callbacks = {
        "on_start": lambda: None,
        "on_log": lambda log: None,
        "on_complete": lambda result: None,
    }

    result = executor.run_from_dsl(dsl, callbacks=callbacks)

    assert result is not None
    assert isinstance(result.duration, float)
    assert result.status in [ExecutionStatus.SUCCESS, ExecutionStatus.FAILED]


def test_executor_callbacks():
    """Test de callbacks del Executor"""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-002", "name": "Callback Bot"},
        "nodes": [
            {
                "id": "node-1",
                "type": "control.log",
                "config": {},
                "outputs": {"success": "node-1", "error": "node-1"},
            }
        ],
    }

    start_called = False
    logs = []

    def on_start():
        nonlocal start_called
        start_called = True

    def on_log(log):
        logs.append(log)

    callbacks = {"on_start": on_start, "on_log": on_log}

    executor = Executor(mode=ExecutionMode.DEBUG)
    result = executor.run_from_dsl(dsl, callbacks=callbacks)

    assert start_called is True
    assert len(logs) > 0


def test_executor_with_variables():
    """Test de ejecución con variables"""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-003", "name": "Variables Bot"},
        "nodes": [
            {
                "id": "node-1",
                "type": "control.log",
                "config": {},
                "outputs": {"success": "node-1", "error": "node-1"},
            }
        ],
        "variables": {"max_count": {"type": "number", "value": 10}},
    }

    executor = Executor()
    variables = {"custom_var": "test_value"}

    result = executor.run_from_dsl(dsl, variables=variables)
    assert result is not None


def test_execution_result_structure():
    """Test de estructura del ExecutionResult"""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-004", "name": "Result Bot"},
        "nodes": [
            {
                "id": "node-1",
                "type": "control.log",
                "config": {},
                "outputs": {"success": "node-1", "error": "node-1"},
            }
        ],
    }

    executor = Executor()
    result = executor.run_from_dsl(dsl)

    assert hasattr(result, "status")
    assert hasattr(result, "start_time")
    assert hasattr(result, "end_time")
    assert hasattr(result, "duration")
    assert hasattr(result, "output")
    assert hasattr(result, "errors")
    assert hasattr(result, "logs")
    assert hasattr(result, "success")

