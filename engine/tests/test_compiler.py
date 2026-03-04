"""
Tests para el Compiler
"""

import pytest
import tempfile
from pathlib import Path
from skuldbot.compiler import Compiler
from skuldbot.compiler.compiler import transform_variable_syntax


def test_compile_simple_bot():
    """Test de compilación de bot simple"""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-001", "name": "Simple Bot", "description": "Test bot"},
        "nodes": [
            {
                "id": "node-1",
                "type": "control.log",
                "config": {"message": "Hello World"},
                "outputs": {"success": "node-1", "error": "node-1"},
            }
        ],
    }

    compiler = Compiler()
    package = compiler.compile(dsl)

    assert package.bot_id == "bot-001"
    assert package.bot_name == "Simple Bot"
    assert package.main_robot is not None
    assert "*** Settings ***" in package.main_robot
    assert "*** Tasks ***" in package.main_robot


def test_compile_to_disk():
    """Test de compilación a disco"""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-002", "name": "Disk Bot"},
        "nodes": [
            {
                "id": "node-1",
                "type": "control.log",
                "config": {},
                "outputs": {"success": "node-1", "error": "node-1"},
            }
        ],
    }

    with tempfile.TemporaryDirectory() as temp_dir:
        compiler = Compiler()
        bot_dir = compiler.compile_to_disk(dsl, temp_dir)

        assert bot_dir.exists()
        assert (bot_dir / "main.robot").exists()
        assert (bot_dir / "manifest.json").exists()
        assert (bot_dir / "resources").exists()
        assert (bot_dir / "resources" / "keywords.robot").exists()
        assert (bot_dir / "resources" / "error_handler.robot").exists()


def test_manifest_generation():
    """Test de generación de manifest"""
    dsl = {
        "version": "1.0",
        "bot": {
            "id": "bot-003",
            "name": "Manifest Bot",
            "description": "Test manifest",
            "version": "2.0.0",
            "author": "Test Author",
            "tags": ["test", "demo"],
        },
        "nodes": [
            {
                "id": "node-1",
                "type": "control.log",
                "config": {},
                "outputs": {"success": "node-1", "error": "node-1"},
            }
        ],
        "variables": {"api_key": {"type": "credential", "vault": "orchestrator"}},
    }

    compiler = Compiler()
    package = compiler.compile(dsl)

    assert package.manifest["bot_id"] == "bot-003"
    assert package.manifest["version"] == "2.0.0"
    assert package.manifest["author"] == "Test Author"
    assert "test" in package.manifest["tags"]
    assert package.manifest["requires_credentials"] is True


def test_browser_node_compilation():
    """Test de compilación de nodos browser"""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-004", "name": "Browser Bot"},
        "nodes": [
            {
                "id": "node-1",
                "type": "browser.open",
                "config": {"url": "https://example.com"},
                "outputs": {"success": "node-2", "error": "node-error"},
            },
            {
                "id": "node-2",
                "type": "browser.close",
                "config": {},
                "outputs": {"success": "node-2", "error": "node-error"},
            },
            {
                "id": "node-error",
                "type": "control.log",
                "config": {},
                "outputs": {"success": "node-error", "error": "node-error"},
            },
        ],
    }

    compiler = Compiler()
    package = compiler.compile(dsl)

    assert "browser" in package.main_robot.lower()
    assert "Execute Browser Action" in package.main_robot


def test_variables_compilation():
    """Test de compilación de variables"""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-005", "name": "Variables Bot"},
        "nodes": [
            {
                "id": "node-1",
                "type": "control.log",
                "config": {},
                "outputs": {"success": "node-1", "error": "node-1"},
            }
        ],
        "variables": {
            "max_retries": {"type": "number", "value": 5},
            "base_url": {"type": "string", "value": "https://api.example.com"},
        },
    }

    compiler = Compiler()
    package = compiler.compile(dsl)

    assert package.variables is not None
    assert "config.yaml" in package.variables


def test_transform_variable_syntax_accepts_canonical_node_reference():
    """Canonical Studio syntax resolves IDs with dots/hyphens safely."""
    transformed = transform_variable_syntax(
        "${node:web.open_browser-1700000000000|formData.customer.name}"
    )
    assert transformed == "${NODE_web_open_browser_1700000000000}[formData][customer][name]"


def test_transform_variable_syntax_accepts_canonical_array_path():
    """Canonical paths with bracket notation should become nested accessors."""
    transformed = transform_variable_syntax(
        "${node:excel.read_range-1|rows[i].amount}"
    )
    assert transformed == "${NODE_excel_read_range_1}[rows][i][amount]"


def test_transform_variable_syntax_does_not_convert_legacy_node_label_refs():
    """Legacy node label refs are no longer converted to NODE_<id> variables."""
    transformed = transform_variable_syntax("${ApiCall.output}")
    assert transformed == "${ApiCall}[output]"


def test_compile_handles_node_ids_with_dot_in_evaluate_blocks():
    """Evaluate blocks must not use $NODE_<id> directly when id contains dots."""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-dot-001", "name": "Dot Id Bot"},
        "nodes": [
            {
                "id": "trigger.manual_1",
                "type": "trigger.manual",
                "config": {},
                "outputs": {"success": "trigger.manual_1", "error": "trigger.manual_1"},
                "label": "Manual Trigger",
            }
        ],
        "start_node": "trigger.manual_1",
    }

    compiler = Compiler()
    package = compiler.compile(dsl)

    assert "__import__('json').dumps($NODE_trigger.manual_1" not in package.main_robot
    assert "${NODE_trigger_manual_1}" in package.main_robot
    assert "__import__('json').dumps($_node_envelope_state, default=str)" in package.main_robot


def test_web_open_browser_uses_enterprise_browser_policy():
    """web.open_browser must use enterprise keyword (strict/fallback policy)."""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-browser-001", "name": "Browser Policy Bot"},
        "nodes": [
            {
                "id": "node-1",
                "type": "web.open_browser",
                "config": {"url": "https://example.com", "browser": "edge", "allow_fallback": False},
                "outputs": {"success": "node-1", "error": "node-1"},
            }
        ],
    }

    compiler = Compiler()
    package = compiler.compile(dsl)

    assert "Open Browser Enterprise" in package.main_robot
    assert "allow_fallback" in package.main_robot
    assert "Open Available Browser" not in package.main_robot
