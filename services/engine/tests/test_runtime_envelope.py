from skuldbot.libs.runtime_envelope import (
    build_node_input_envelope,
    coerce_collection_input,
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


def test_normalize_envelope_rebuilds_stale_pending_payload_from_output() -> None:
    state = {
        "status": "success",
        "output": {"records": [{"id": 1}], "recordCount": 1},
        "items": [{"json": {"value": ""}, "binary": {}}],
        "json": {"value": ""},
        "meta": {"status": "pending", "itemCount": 1},
    }
    normalized = normalize_node_envelope(state, "node-4", "data.tap.csv")

    assert normalized["json"] == {"records": [{"id": 1}], "recordCount": 1}
    assert normalized["items"] == [
        {"json": {"records": [{"id": 1}], "recordCount": 1}, "binary": {}}
    ]
    assert normalized["meta"]["status"] == "success"
    assert normalized["meta"]["nodeId"] == "node-4"
    assert normalized["meta"]["nodeType"] == "data.tap.csv"
    assert normalized["meta"]["itemCount"] == 1


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


def test_coerce_collection_input_accepts_python_literal_list_string() -> None:
    parsed = coerce_collection_input("['a', 'b', 'c']")
    assert parsed == ["a", "b", "c"]


def test_coerce_collection_input_extracts_paths_from_file_repr_string() -> None:
    value = (
        "[File(path='/tmp/a.pdf', name='a.pdf', size=1), "
        "File(path='/tmp/b.pdf', name='b.pdf', size=2)]"
    )
    parsed = coerce_collection_input(value)
    assert parsed == ["/tmp/a.pdf", "/tmp/b.pdf"]


def test_coerce_collection_input_normalizes_objects_with_path_attr() -> None:
    class _FileLike:
        def __init__(self, path: str) -> None:
            self.path = path

    parsed = coerce_collection_input([_FileLike("/tmp/one.pdf"), _FileLike("/tmp/two.pdf")])
    assert parsed == ["/tmp/one.pdf", "/tmp/two.pdf"]
