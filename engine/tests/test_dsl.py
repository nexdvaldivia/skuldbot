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

