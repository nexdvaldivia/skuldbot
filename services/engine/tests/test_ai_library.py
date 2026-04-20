"""
Tests for SkuldAI library runtime behavior.
"""

import json
import pytest

from skuldbot.libs.ai import SkuldAI


def test_normalize_ollama_base_url_adds_v1_when_missing():
    assert SkuldAI._normalize_ollama_base_url("http://127.0.0.1:11434") == "http://127.0.0.1:11434/v1"


def test_normalize_ollama_base_url_keeps_v1():
    assert SkuldAI._normalize_ollama_base_url("http://127.0.0.1:11434/v1") == "http://127.0.0.1:11434/v1"


def test_normalize_ollama_base_url_converts_api_to_v1():
    assert SkuldAI._normalize_ollama_base_url("http://127.0.0.1:11434/api") == "http://127.0.0.1:11434/v1"


def test_parse_agent_response_raises_on_invalid_json():
    ai = SkuldAI()
    with pytest.raises(ValueError):
        ai._parse_agent_response("[Error: 404 page not found]")


def test_parse_agent_response_accepts_direct_business_json_as_final_answer():
    ai = SkuldAI()
    raw = '{"transactions":[{"fecha_transaccion":"02/01/2024","monto":420.87}]}'
    parsed = ai._parse_agent_response(raw)
    assert parsed["action"] == "final_answer"
    payload = json.loads(parsed["action_input"]["answer"])
    assert "transactions" in payload
    assert payload["transactions"][0]["monto"] == 420.87


def test_parse_agent_response_extracts_json_from_markdown_and_text():
    ai = SkuldAI()
    raw = (
        "Here is your result:\\n"
        "```json\\n"
        '{"action":"final_answer","action_input":{"answer":"ok"}}\\n'
        "```\\n"
        "done"
    )
    parsed = ai._parse_agent_response(raw)
    assert parsed["action"] == "final_answer"
    assert parsed["action_input"]["answer"] == "ok"


def test_parse_agent_response_recovers_trailing_commas():
    ai = SkuldAI()
    raw = '{"action":"final_answer","action_input":{"answer":"ok",},}'
    parsed = ai._parse_agent_response(raw)
    assert parsed["action"] == "final_answer"
    assert parsed["action_input"]["answer"] == "ok"


def test_parse_agent_response_rejects_truncated_json():
    ai = SkuldAI()
    raw = '{"transactions":[{"a":1},{"b":2}'
    with pytest.raises(ValueError, match="Likely truncated model output"):
        ai._parse_agent_response(raw)
