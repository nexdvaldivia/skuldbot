"""
Runtime node output envelope utilities.

Normalizes per-node execution state into a canonical envelope inspired by n8n:
- items: [{json: {...}, binary: {...}}]
- json: first item json payload
- binary: first item binary payload
- meta: execution metadata
- errors: structured error list
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, List


def _utc_now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def _to_item(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        if "json" in value or "binary" in value:
            json_payload = value.get("json", {})
            if not isinstance(json_payload, dict):
                json_payload = {"value": json_payload}
            binary_payload = value.get("binary", {})
            if not isinstance(binary_payload, dict):
                binary_payload = {}
            return {"json": json_payload, "binary": binary_payload}
        return {"json": value, "binary": {}}
    return {"json": {"value": value}, "binary": {}}


def _coerce_items(output: Any) -> List[Dict[str, Any]]:
    if output is None:
        return []

    if isinstance(output, list):
        return [_to_item(v) for v in output]

    if isinstance(output, dict) and isinstance(output.get("items"), list):
        return [_to_item(v) for v in output["items"]]

    return [_to_item(output)]


def normalize_node_envelope(
    node_state: Dict[str, Any] | Any, node_id: str, node_type: str
) -> Dict[str, Any]:
    """
    Normalize node state into canonical envelope fields.

    The original `output` field is preserved for backward compatibility.
    """
    state: Dict[str, Any]
    if isinstance(node_state, dict):
        state = deepcopy(node_state)
    else:
        state = {"output": node_state}

    output = state.get("output")
    existing_items = state.get("items")
    items = (
        [_to_item(v) for v in existing_items]
        if isinstance(existing_items, list)
        else _coerce_items(output)
    )

    json_payload = state.get("json")
    if not isinstance(json_payload, dict):
        if items:
            json_payload = items[0].get("json", {})
        elif isinstance(output, dict):
            json_payload = output
        else:
            json_payload = {}

    binary_payload = state.get("binary")
    if not isinstance(binary_payload, dict):
        binary_payload = items[0].get("binary", {}) if items else {}
        if not isinstance(binary_payload, dict):
            binary_payload = {}

    meta = state.get("meta")
    if not isinstance(meta, dict):
        meta = {}
    meta.setdefault("nodeId", node_id)
    meta.setdefault("nodeType", node_type)
    meta.setdefault("status", state.get("status", "success"))
    meta["itemCount"] = len(items)
    meta.setdefault("timestamp", _utc_now_iso())

    errors = state.get("errors")
    if not isinstance(errors, list):
        errors = []

    status_value = str(state.get("status", "success"))
    error_message = state.get("error")
    if status_value == "error" and error_message:
        error_text = str(error_message)
        already_present = any(
            isinstance(err, dict)
            and str(err.get("message", "")) == error_text
            and str(err.get("nodeId", "")) == node_id
            for err in errors
        )
        if not already_present:
            errors.append(
                {
                    "message": error_text,
                    "nodeId": node_id,
                    "nodeType": node_type,
                    "retryable": False,
                }
            )

    state["items"] = items
    state["json"] = json_payload
    state["binary"] = binary_payload
    state["meta"] = meta
    state["errors"] = errors

    return state


def build_node_input_envelope(
    current_node_id: str,
    current_node_type: str,
    previous_node_id: str | None = None,
    previous_branch: str | None = None,
    previous_node_state: Dict[str, Any] | Any = None,
) -> Dict[str, Any]:
    """
    Build a canonical input envelope for the current node from the previously
    executed node state.
    """
    has_previous = previous_node_state not in (None, "", {})
    source_node_id = (previous_node_id or "").strip() if previous_node_id else ""
    source_node_type = ""

    source_envelope: Dict[str, Any]
    if has_previous:
        if isinstance(previous_node_state, dict):
            source_meta = previous_node_state.get("meta", {})
            if isinstance(source_meta, dict):
                source_node_type = str(source_meta.get("nodeType", "") or "").strip()
        if not source_node_id:
            source_node_id = "unknown"
        if not source_node_type:
            source_node_type = "unknown"
        source_envelope = normalize_node_envelope(
            previous_node_state, source_node_id, source_node_type
        )
    else:
        source_envelope = {
            "items": [],
            "json": {},
            "binary": {},
            "errors": [],
            "meta": {},
        }

    items = deepcopy(source_envelope.get("items", []))
    json_payload = deepcopy(source_envelope.get("json", {}))
    if not isinstance(json_payload, dict):
        json_payload = {}

    binary_payload = deepcopy(source_envelope.get("binary", {}))
    if not isinstance(binary_payload, dict):
        binary_payload = {}

    errors = deepcopy(source_envelope.get("errors", []))
    if not isinstance(errors, list):
        errors = []

    return {
        "items": items,
        "json": json_payload,
        "binary": binary_payload,
        "errors": errors,
        "meta": {
            "nodeId": current_node_id,
            "nodeType": current_node_type,
            "sourceNodeId": source_node_id or None,
            "sourceNodeType": source_node_type or None,
            "sourceBranch": previous_branch or None,
            "itemCount": len(items),
            "timestamp": _utc_now_iso(),
        },
    }
