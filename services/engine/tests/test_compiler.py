"""
Tests para el Compiler
"""

import pytest
import tempfile
from pathlib import Path
from skuldbot.compiler import Compiler
from skuldbot.compiler.compiler import transform_variable_syntax, escape_for_robot


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


def test_escape_for_robot_protects_consecutive_spaces():
    """Consecutive spaces must be preserved without creating extra Robot args."""
    escaped = escape_for_robot("hello  world   !")
    assert escaped == "hello${SPACE}${SPACE}world${SPACE}${SPACE}${SPACE}!"


def test_escape_for_robot_preserves_newlines_and_space_runs():
    """Newlines become literal \\n and internal double spaces are protected."""
    escaped = escape_for_robot("line1\n  line2")
    assert escaped == "line1\\n${SPACE}${SPACE}line2"


def test_compiler_protects_double_spaces_in_inline_log_messages():
    """Any inline text argument should be protected against Robot 2+ space tokenization."""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-log-space-safe", "name": "Log Space Safe"},
        "nodes": [
            {
                "id": "log-1",
                "type": "control.log",
                "config": {"message": "A  B   C", "level": "INFO"},
                "outputs": {"success": "END", "error": "END"},
            }
        ],
        "start_node": "log-1",
    }

    compiler = Compiler()
    package = compiler.compile(dsl)

    assert "A${SPACE}${SPACE}B${SPACE}${SPACE}${SPACE}C" in package.main_robot


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


def test_control_map_uses_escaped_dynamic_item_variable_assignment():
    """control.map must assign item_var dynamically without requiring pre-existing variable."""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-map-001", "name": "Map Item Var Bot"},
        "nodes": [
            {
                "id": "node-map-1",
                "type": "control.map",
                "config": {
                    "items": "[1,2,3]",
                    "item_var": "pdf_path",
                    "expression": "${pdf_path}",
                },
                "outputs": {"success": "END", "error": "END"},
            }
        ],
        "start_node": "node-map-1",
    }

    compiler = Compiler()
    package = compiler.compile(dsl)

    assert "Set Global Variable    \\${${item_var}}    ${item}" in package.main_robot
    assert "FOR    ${item}    IN    @{items}\n                Set Global Variable    \\${${item_var}}    ${item}\n                ${expression}=    Set Variable" in package.main_robot


def test_control_map_expression_preserves_backslash_sequences():
    """control.map expression should keep literal backslashes (e.g. '\\n') for Python eval."""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-map-escapes", "name": "Map Escapes Bot"},
        "nodes": [
            {
                "id": "node-map-escape",
                "type": "control.map",
                "config": {
                    "items": "['a']",
                    "item_var": "pdf_path",
                    "expression": "{'text': '\\n'.join(['x','y']), 'path': ${pdf_path}}",
                },
                "outputs": {"success": "END", "error": "END"},
            }
        ],
        "start_node": "node-map-escape",
    }

    compiler = Compiler()
    package = compiler.compile(dsl)

    assert "\\\\n'.join" in package.main_robot


def test_ai_agent_goal_is_passed_via_safe_variable_not_inline_literal():
    """ai.agent goal/system prompt should not be inlined to avoid Robot arg split on double spaces."""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-ai-goal-safe", "name": "AI Goal Safe"},
        "nodes": [
            {
                "id": "agent-1",
                "type": "ai.agent",
                "config": {
                    "name": "Agent",
                    "goal": "Line1\\n  indented line with two spaces",
                    "system_prompt": "System\\n  prompt",
                    "max_iterations": 3,
                },
                "model_config": {
                    "provider": "ollama",
                    "model": "llama3.2",
                    "temperature": 0,
                    "base_url": "http://127.0.0.1:11434",
                },
                "tools": [],
                "outputs": {"success": "END", "error": "END"},
            }
        ],
        "start_node": "agent-1",
    }

    compiler = Compiler()
    package = compiler.compile(dsl)

    assert "...    goal=${agent_goal}" in package.main_robot
    assert "...    system_prompt=${agent_system_prompt}" in package.main_robot
    assert "Run Agent With Tools\n            ...    goal=Line1" not in package.main_robot
    assert "IF    '${agent_status}' != 'completed'" in package.main_robot


def test_data_target_csv_supports_columns_constructor_argument():
    """data.target.csv should forward optional CSV constructor config to Load To CSV."""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-csv-columns", "name": "CSV Columns Bot"},
        "nodes": [
            {
                "id": "csv-1",
                "type": "data.target.csv",
                "config": {
                    "path": "/tmp/output.csv",
                    "records": "[{'fecha':'01/01/2026','monto':10}]",
                    "columns": '[{"header":"Date","field":"fecha"},{"header":"Amount","field":"monto"}]',
                    "delimiter": ",",
                    "encoding": "utf-8",
                    "append": False,
                },
                "outputs": {"success": "END", "error": "END"},
            }
        ],
        "start_node": "csv-1",
    }

    compiler = Compiler()
    package = compiler.compile(dsl)

    assert "Load To CSV" in package.main_robot
    assert "...    columns=" in package.main_robot


def test_data_target_qbo_forwards_qbo_arguments():
    """data.target.qbo should render Load To QBO with configurable fields."""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-qbo-target", "name": "QBO Target Bot"},
        "nodes": [
            {
                "id": "qbo-1",
                "type": "data.target.qbo",
                "config": {
                    "path": "/tmp/output.qbo",
                    "storage_mode": "absolute_path_only",
                    "records": "[{'txn_date':'2026-04-10','txn_amount':-10.12}]",
                    "account_type": "CHECKING",
                    "account_id": "123456789",
                    "bank_id": "987654321",
                    "currency": "USD",
                    "date_field": "txn_date",
                    "amount_field": "txn_amount",
                    "payee_field": "payee",
                    "memo_field": "memo",
                    "fitid_field": "id",
                    "type_field": "kind",
                    "date_format": "%Y-%m-%d",
                    "intu_bid": "3000",
                    "encoding": "cp1252",
                },
                "outputs": {"success": "END", "error": "END"},
            }
        ],
        "start_node": "qbo-1",
    }

    compiler = Compiler()
    package = compiler.compile(dsl)

    assert "Load To QBO" in package.main_robot
    assert "...    account_type=" in package.main_robot
    assert "...    amount_field=" in package.main_robot
    assert "...    date_format=" in package.main_robot


def test_data_tap_csv_imports_storage_library_for_provider_mode():
    """data.tap.csv with storage provider wiring must import SkuldStorage library."""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-tap-storage-import", "name": "Tap Storage Import"},
        "nodes": [
            {
                "id": "tap-1",
                "type": "data.tap.csv",
                "config": {
                    "source": "in.csv",
                    "storage_mode": "provider_relative_path",
                },
                "connection_config": {
                    "provider": "local",
                    "provider_id": "storage.provider-1",
                    "name": "storage.provider-1",
                    "local_path": "/tmp",
                },
                "outputs": {"success": "END", "error": "END"},
            }
        ],
        "start_node": "tap-1",
    }

    compiler = Compiler()
    package = compiler.compile(dsl)

    assert "Library           skuldbot.libs.storage    WITH NAME    SkuldStorage" in package.main_robot
    assert "SkuldStorage.Configure Storage Provider" in package.main_robot


def test_local_storage_provider_uses_local_path_as_storage_prefix():
    """When local provider has no path_prefix, compiler should use local_path as storage prefix."""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-local-prefix", "name": "Local Prefix"},
        "nodes": [
            {
                "id": "tap-1",
                "type": "data.tap.csv",
                "config": {
                    "source": "Transactions_QB.csv",
                    "storage_mode": "provider_relative_path",
                },
                "connection_config": {
                    "provider": "local",
                    "provider_id": "storage.provider-1",
                    "name": "storage.provider-1",
                    "local_path": "/Users/test/data",
                },
                "outputs": {"success": "END", "error": "END"},
            }
        ],
        "start_node": "tap-1",
    }

    compiler = Compiler()
    package = compiler.compile(dsl)

    assert "${storage_prefix}=    Set Variable    /Users/test/data" in package.main_robot
