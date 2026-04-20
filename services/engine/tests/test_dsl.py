"""
Tests para DSL schemas y validación
"""

import pytest
from skuldbot.dsl import DSLValidator, BotDefinition
from skuldbot.dsl.validator import ValidationError


def test_valid_dsl():
    """Test de DSL válido"""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-001", "name": "Test Bot"},
        "nodes": [
            {
                "id": "node-1",
                "type": "control.log",
                "config": {"message": "Hello"},
                "outputs": {"success": "node-2", "error": "node-error"},
            },
            {
                "id": "node-2",
                "type": "control.log",
                "config": {"message": "World"},
                "outputs": {"success": "node-2", "error": "node-error"},
            },
            {
                "id": "node-error",
                "type": "control.log",
                "config": {"message": "Error"},
                "outputs": {"success": "node-error", "error": "node-error"},
            },
        ],
    }

    validator = DSLValidator()
    bot = validator.validate(dsl)

    assert bot.bot.id == "bot-001"
    assert bot.bot.name == "Test Bot"
    assert len(bot.nodes) == 3


def test_invalid_node_reference():
    """Test de referencia a nodo inexistente"""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-001", "name": "Test Bot"},
        "nodes": [
            {
                "id": "node-1",
                "type": "control.log",
                "config": {},
                "outputs": {"success": "node-999", "error": "node-error"},
            },
            {
                "id": "node-error",
                "type": "control.log",
                "config": {},
                "outputs": {"success": "node-error", "error": "node-error"},
            },
        ],
    }

    validator = DSLValidator()
    with pytest.raises(ValidationError) as exc_info:
        validator.validate(dsl)

    assert "node-999" in str(exc_info.value)


def test_duplicate_node_ids():
    """Test de IDs duplicados"""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-001", "name": "Test Bot"},
        "nodes": [
            {
                "id": "node-1",
                "type": "control.log",
                "config": {},
                "outputs": {"success": "node-1", "error": "node-1"},
            },
            {
                "id": "node-1",  # Duplicado
                "type": "control.log",
                "config": {},
                "outputs": {"success": "node-1", "error": "node-1"},
            },
        ],
    }

    validator = DSLValidator()
    with pytest.raises(ValidationError):
        validator.validate(dsl)


def test_empty_nodes():
    """Test de bot sin nodos"""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-001", "name": "Test Bot"},
        "nodes": [],
    }

    validator = DSLValidator()
    with pytest.raises(ValidationError):
        validator.validate(dsl)


def test_node_type_validation():
    """Test de validación de tipo de nodo"""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-001", "name": "Test Bot"},
        "nodes": [
            {
                "id": "node-1",
                "type": "invalid_type",  # Sin punto
                "config": {},
                "outputs": {"success": "node-1", "error": "node-1"},
            }
        ],
    }

    validator = DSLValidator()
    with pytest.raises(ValidationError):
        validator.validate(dsl)


def test_variables():
    """Test de variables en DSL"""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-001", "name": "Test Bot"},
        "nodes": [
            {
                "id": "node-1",
                "type": "control.log",
                "config": {},
                "outputs": {"success": "node-1", "error": "node-1"},
            }
        ],
        "variables": {
            "api_key": {"type": "credential", "vault": "orchestrator"},
            "max_retries": {"type": "number", "value": 3},
        },
    }

    validator = DSLValidator()
    bot = validator.validate(dsl)

    assert "api_key" in bot.variables
    assert bot.variables["api_key"].type == "credential"
    assert bot.variables["max_retries"].value == 3


def test_duplicate_node_labels_are_invalid():
    """Duplicate labels should fail validation to avoid ambiguous expressions."""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-dup-label", "name": "Duplicate Labels"},
        "nodes": [
            {
                "id": "node-1",
                "type": "control.log",
                "label": "Process Data",
                "config": {},
                "outputs": {"success": "node-2", "error": "node-2"},
            },
            {
                "id": "node-2",
                "type": "control.log",
                "label": "Process Data",
                "config": {},
                "outputs": {"success": "node-2", "error": "node-2"},
            },
        ],
    }

    validator = DSLValidator()
    with pytest.raises(ValidationError) as exc_info:
        validator.validate(dsl)

    assert "Duplicate node label" in str(exc_info.value) or any(
        "Duplicate node label" in err for err in getattr(exc_info.value, "errors", [])
    )


def test_invalid_node_reference_inside_expression_fails_validation():
    """`${node:<id>|...}` references must point to existing node IDs."""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-node-ref", "name": "Node Ref Validation"},
        "nodes": [
            {
                "id": "node-1",
                "type": "control.set_variable",
                "config": {"name": "value", "value": "${node:missing-node|output}"},
                "outputs": {"success": "node-2", "error": "node-2"},
            },
            {
                "id": "node-2",
                "type": "control.log",
                "config": {"message": "done"},
                "outputs": {"success": "END", "error": "END"},
            },
        ],
        "start_node": "node-1",
    }

    validator = DSLValidator()
    with pytest.raises(ValidationError) as exc_info:
        validator.validate(dsl)

    details = "\n".join(getattr(exc_info.value, "errors", []))
    assert "missing-node" in str(exc_info.value) or "missing-node" in details


def test_ai_agent_hydrates_model_config_from_visual_connection():
    """AI agent should validate when model is connected via `connections.model`."""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-ai-visual-conn", "name": "AI Visual Conn"},
        "nodes": [
            {
                "id": "trigger-1",
                "type": "trigger.manual",
                "config": {},
                "outputs": {"success": "agent-1", "error": "END"},
            },
            {
                "id": "agent-1",
                "type": "ai.agent",
                "config": {
                    "name": "Agent",
                    "goal": "Return JSON",
                    "system_prompt": "System",
                    "max_iterations": 1,
                },
                "connections": {"model": "model-1"},
                "outputs": {"success": "END", "error": "END"},
            },
            {
                "id": "model-1",
                "type": "ai.model",
                "config": {
                    "provider": "ollama",
                    "model": "llama3.2",
                    "base_url": "http://127.0.0.1:11434",
                    "temperature": 0,
                },
                "outputs": {"success": "END", "error": "END"},
            },
        ],
        "start_node": "trigger-1",
    }

    validator = DSLValidator()
    bot = validator.validate(dsl)
    agent = bot.get_node("agent-1")
    assert agent is not None
    assert agent.model_config_ is not None
    assert agent.model_config_.provider == "ollama"


def test_files_list_hydrates_storage_connection_config():
    """files.list should receive `connection_config` from connected storage.provider."""
    dsl = {
        "version": "1.0",
        "bot": {"id": "bot-storage-visual-conn", "name": "Storage Visual Conn"},
        "nodes": [
            {
                "id": "trigger-1",
                "type": "trigger.manual",
                "config": {},
                "outputs": {"success": "list-1", "error": "END"},
            },
            {
                "id": "list-1",
                "type": "files.list",
                "config": {"pattern": "*.pdf", "max_items": 10, "recursive": False},
                "connections": {"connection": "storage-1"},
                "outputs": {"success": "END", "error": "END"},
            },
            {
                "id": "storage-1",
                "type": "storage.provider",
                "config": {"provider": "local", "local_path": "/tmp"},
                "outputs": {"success": "END", "error": "END"},
            },
        ],
        "start_node": "trigger-1",
    }

    validator = DSLValidator()
    bot = validator.validate(dsl)
    list_node = bot.get_node("list-1")
    assert list_node is not None
    assert list_node.connection_config is not None
    assert list_node.connection_config.get("provider") == "local"
