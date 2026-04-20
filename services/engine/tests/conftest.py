"""
Configuración de pytest
"""

import pytest


@pytest.fixture
def sample_dsl():
    """DSL de ejemplo para tests"""
    return {
        "version": "1.0",
        "bot": {"id": "test-bot", "name": "Test Bot", "description": "Bot de prueba"},
        "nodes": [
            {
                "id": "start",
                "type": "control.log",
                "config": {"message": "Starting"},
                "outputs": {"success": "process", "error": "error-handler"},
            },
            {
                "id": "process",
                "type": "control.log",
                "config": {"message": "Processing"},
                "outputs": {"success": "end", "error": "error-handler"},
            },
            {
                "id": "end",
                "type": "control.log",
                "config": {"message": "Done"},
                "outputs": {"success": "end", "error": "error-handler"},
            },
            {
                "id": "error-handler",
                "type": "control.log",
                "config": {"message": "Error occurred"},
                "outputs": {"success": "error-handler", "error": "error-handler"},
            },
        ],
        "variables": {"test_var": {"type": "string", "value": "test"}},
    }


@pytest.fixture
def browser_dsl():
    """DSL con nodos browser"""
    return {
        "version": "1.0",
        "bot": {"id": "browser-bot", "name": "Browser Test"},
        "nodes": [
            {
                "id": "open",
                "type": "browser.open",
                "config": {"url": "https://example.com", "browser": "chromium"},
                "outputs": {"success": "click", "error": "error"},
            },
            {
                "id": "click",
                "type": "browser.click",
                "config": {"selector": "#button"},
                "outputs": {"success": "close", "error": "error"},
            },
            {
                "id": "close",
                "type": "browser.close",
                "config": {},
                "outputs": {"success": "close", "error": "error"},
            },
            {
                "id": "error",
                "type": "control.log",
                "config": {"message": "Error"},
                "outputs": {"success": "error", "error": "error"},
            },
        ],
    }

