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

import ast
import json
import os
import re
from collections.abc import Iterable
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, List


_DICT_LIST_KEYS = ("items", "results", "files", "records", "data")
_FILE_REPR_PATH_PATTERN = re.compile(
    r"""File\(\s*path\s*=\s*(["'])(.*?)(?<!\\)\1""",
    flags=re.DOTALL,
)


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


def _extract_paths_from_file_repr(value: str) -> List[str]:
    paths: List[str] = []
    for match in _FILE_REPR_PATH_PATTERN.finditer(value):
        quote = match.group(1)
        raw = match.group(2)
        try:
            decoded = ast.literal_eval(f"{quote}{raw}{quote}")
            if isinstance(decoded, str) and decoded:
                paths.append(decoded)
                continue
        except (SyntaxError, ValueError):
            pass

        fallback = raw.replace(f"\\{quote}", quote)
        if fallback:
            paths.append(fallback)

    return paths


def _normalize_collection_item(item: Any) -> Any:
    if isinstance(item, dict):
        return item

    if hasattr(item, "__fspath__"):
        try:
            return os.fspath(item)
        except TypeError:
            pass

    path_value = getattr(item, "path", None)
    if isinstance(path_value, str) and path_value:
        return path_value

    return item


def coerce_collection_input(value: Any) -> List[Any]:
    """
    Normalize control node collection inputs into a concrete Python list.

    Handles:
    - native list/tuple/set/iterables
    - JSON strings
    - Python literal strings (e.g. "['a', 'b']")
    - RPA FileSystem repr strings (e.g. "[File(path='...'), ...]")
    """
    if value is None:
        return []

    if isinstance(value, list):
        return [_normalize_collection_item(item) for item in value]

    if isinstance(value, (tuple, set)):
        return [_normalize_collection_item(item) for item in list(value)]

    if isinstance(value, dict):
        for key in _DICT_LIST_KEYS:
            candidate = value.get(key)
            if isinstance(candidate, list):
                return [_normalize_collection_item(item) for item in candidate]
        return [value]

    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")

    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return []

        try:
            parsed_json = json.loads(raw)
            if isinstance(parsed_json, list):
                return [_normalize_collection_item(item) for item in parsed_json]
            if isinstance(parsed_json, dict):
                for key in _DICT_LIST_KEYS:
                    candidate = parsed_json.get(key)
                    if isinstance(candidate, list):
                        return [_normalize_collection_item(item) for item in candidate]
                return [parsed_json]
            return [parsed_json]
        except (json.JSONDecodeError, TypeError):
            pass

        try:
            parsed_literal = ast.literal_eval(raw)
            if isinstance(parsed_literal, list):
                return [_normalize_collection_item(item) for item in parsed_literal]
            if isinstance(parsed_literal, (tuple, set)):
                return [_normalize_collection_item(item) for item in list(parsed_literal)]
            if isinstance(parsed_literal, dict):
                for key in _DICT_LIST_KEYS:
                    candidate = parsed_literal.get(key)
                    if isinstance(candidate, list):
                        return [_normalize_collection_item(item) for item in candidate]
                return [parsed_literal]
            return [_normalize_collection_item(parsed_literal)]
        except (SyntaxError, ValueError):
            pass

        file_paths = _extract_paths_from_file_repr(raw)
        if file_paths:
            return file_paths

        return [raw]

    if isinstance(value, Iterable):
        return [_normalize_collection_item(item) for item in list(value)]

    return [_normalize_collection_item(value)]


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

    has_explicit_output = "output" in state
    output = state.get("output")
    existing_items = state.get("items")
    if has_explicit_output:
        # Always rebuild canonical payload views from explicit output to avoid
        # stale pending-envelope data leaking into subsequent successful runs.
        items = _coerce_items(output)
    elif isinstance(existing_items, list):
        items = [_to_item(v) for v in existing_items]
    else:
        items = _coerce_items(output)

    existing_json_payload = state.get("json")
    if isinstance(existing_json_payload, dict) and not has_explicit_output:
        json_payload = existing_json_payload
    elif items:
        json_payload = items[0].get("json", {})
    elif isinstance(output, dict):
        json_payload = output
    else:
        json_payload = {}

    existing_binary_payload = state.get("binary")
    if isinstance(existing_binary_payload, dict) and not has_explicit_output:
        binary_payload = existing_binary_payload
    else:
        binary_payload = items[0].get("binary", {}) if items else {}
        if not isinstance(binary_payload, dict):
            binary_payload = {}

    meta = state.get("meta")
    if not isinstance(meta, dict):
        meta = {}
    meta["nodeId"] = node_id
    meta["nodeType"] = node_type
    meta["status"] = state.get("status", meta.get("status", "success"))
    meta["itemCount"] = len(items)
    if not meta.get("timestamp"):
        meta["timestamp"] = _utc_now_iso()

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
