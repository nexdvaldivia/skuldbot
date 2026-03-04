from skuldbot.libs.runtime_envelope import (
    build_node_input_envelope,
    normalize_node_envelope,
)


def test_normalize_envelope_from_dict_output() -> None:
    state = {"status": "success", "output": {"name": "Alice", "amount": 42}}
    normalized = normalize_node_envelope(state, "node-1", "excel.read_range")

    assert normalized["json"] == {"name": "Alice", "amount": 42}
    assert normalized["items"] == [{"json": {"name": "Alice", "amount": 42}, "binary": {}}]
    assert normalized["binary"] == {}
    assert normalized["errors"] == []
    assert normalized["meta"]["nodeId"] == "node-1"
    assert normalized["meta"]["nodeType"] == "excel.read_range"
    assert normalized["meta"]["itemCount"] == 1


def test_normalize_envelope_from_scalar_output() -> None:
    state = {"status": "success", "output": "ok"}
    normalized = normalize_node_envelope(state, "node-2", "logging.log")

    assert normalized["items"] == [{"json": {"value": "ok"}, "binary": {}}]
    assert normalized["json"] == {"value": "ok"}
    assert normalized["meta"]["itemCount"] == 1


def test_normalize_envelope_error_appends_structured_error() -> None:
    state = {"status": "error", "error": "boom", "output": None}
    normalized = normalize_node_envelope(state, "node-3", "api.http_request")

    assert normalized["items"] == []
    assert len(normalized["errors"]) == 1
    assert normalized["errors"][0]["message"] == "boom"
    assert normalized["errors"][0]["nodeId"] == "node-3"
    assert normalized["errors"][0]["nodeType"] == "api.http_request"
    assert normalized["meta"]["status"] == "error"


def test_build_node_input_envelope_from_previous_node_state() -> None:
    previous = normalize_node_envelope(
        {"status": "success", "output": {"invoiceId": "INV-1", "amount": 100}},
        "node-a",
        "excel.read_range",
    )
    input_envelope = build_node_input_envelope(
        current_node_id="node-b",
        current_node_type="data.map",
        previous_node_id="node-a",
        previous_branch="success",
        previous_node_state=previous,
    )

    assert input_envelope["json"] == {"invoiceId": "INV-1", "amount": 100}
    assert input_envelope["items"] == [
        {"json": {"invoiceId": "INV-1", "amount": 100}, "binary": {}}
    ]
    assert input_envelope["meta"]["nodeId"] == "node-b"
    assert input_envelope["meta"]["sourceNodeId"] == "node-a"
    assert input_envelope["meta"]["sourceBranch"] == "success"
    assert input_envelope["meta"]["itemCount"] == 1


def test_build_node_input_envelope_without_previous_state_is_empty() -> None:
    input_envelope = build_node_input_envelope(
        current_node_id="node-b",
        current_node_type="data.map",
        previous_node_id=None,
        previous_branch=None,
        previous_node_state=None,
    )

    assert input_envelope["items"] == []
    assert input_envelope["json"] == {}
    assert input_envelope["binary"] == {}
    assert input_envelope["errors"] == []
    assert input_envelope["meta"]["sourceNodeId"] is None
    assert input_envelope["meta"]["itemCount"] == 0
