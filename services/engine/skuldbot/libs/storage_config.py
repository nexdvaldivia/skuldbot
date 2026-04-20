"""
Storage runtime helpers for compiler templates.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def resolve_storage_path(
    path: Any,
    path_prefix: Any,
    provider: Any = "local",
) -> str:
    """
    Resolve a storage path using provider-specific prefix semantics.

    Rules:
    - If provider is local:
      - absolute paths are kept as-is
      - relative path is joined with path_prefix when available
      - empty path falls back to path_prefix
    - For cloud providers:
      - leading slash is removed
      - path_prefix behaves as logical root/prefix
      - empty path falls back to path_prefix
    """
    selected = _as_text(path)
    prefix = _as_text(path_prefix)
    provider_name = _as_text(provider).lower() or "local"

    if provider_name == "local":
        if not selected:
            return prefix
        if os.path.isabs(selected):
            return selected
        if prefix:
            prefix_path = Path(prefix)
            selected_path = Path(selected)
            if selected_path == prefix_path or str(selected_path).startswith(f"{prefix}{os.sep}"):
                return str(selected_path)
            return str(prefix_path / selected_path)
        return selected

    selected_norm = selected.lstrip("/") if selected else ""
    prefix_norm = prefix.strip("/")

    if selected_norm:
        if prefix_norm and not (
            selected_norm == prefix_norm or selected_norm.startswith(f"{prefix_norm}/")
        ):
            return f"{prefix_norm}/{selected_norm}"
        return selected_norm

    return prefix_norm


def resolve_storage_list_path(
    source: Any,
    legacy_path: Any,
    path_prefix: Any,
    provider: Any = "local",
) -> str:
    """
    Resolve files.list source path/prefix.

    Rules:
    - Prefer `source`; fallback to legacy `path`.
    - If provider is local:
      - absolute paths are kept as-is
      - relative source is joined with path_prefix when available
    - For cloud providers:
      - path_prefix works as logical root/prefix
      - leading slash is removed
    """
    selected = _as_text(source) or _as_text(legacy_path)
    return resolve_storage_path(selected, path_prefix, provider)
