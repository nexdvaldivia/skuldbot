#!/usr/bin/env python3
"""Migrate legacy Studio expressions to canonical node-id syntax.

Legacy format:
  ${Node Label.output}
  ${Node Label[row].field}

Canonical format:
  ${node:<node_id>|output}
  ${node:<node_id>|row[field]}
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


MANIFEST_FILE = "proyecto.skuld"
BOT_FILE = "bot.json"
EXPR_PATTERN = re.compile(r"\$\{([^{}]+)\}")

GLOBAL_VARS = {
    "LAST_ERROR",
    "LAST_ERROR_NODE",
    "LAST_ERROR_TYPE",
    "BOT_ID",
    "BOT_NAME",
    "BOT_STATUS",
    "EXCEL_DATA",
    "EXCEL_ROW_COUNT",
    "FILE_CONTENT",
    "HTTP_RESPONSE",
    "HTTP_STATUS",
    "CELL_VALUE",
    "FILE_EXISTS",
    "LAST_TEXT",
    "LAST_ATTRIBUTE",
    "JS_RESULT",
}

RESERVED_ROOTS = {
    "env",
    "vault",
    "item",
    "acc",
    "index",
    "row",
    "formData",
}


@dataclass
class WarningItem:
    path: str
    expression: str
    message: str


@dataclass
class BotMigrationResult:
    bot_file: Path
    bot_name: Optional[str] = None
    nodes_total: int = 0
    strings_scanned: int = 0
    expressions_seen: int = 0
    expressions_migrated: int = 0
    strings_changed: int = 0
    warnings: List[WarningItem] = field(default_factory=list)
    changed: bool = False


class ExpressionMigrator:
    def __init__(self, label_to_ids: Dict[str, List[str]]) -> None:
        self.label_to_ids = label_to_ids
        self.labels_sorted = sorted(label_to_ids.keys(), key=len, reverse=True)

    def migrate_string(
        self, text: str, value_path: str
    ) -> Tuple[str, int, int, List[WarningItem]]:
        """Return (new_text, expressions_seen, migrated_count, warnings)."""
        seen = 0
        migrated = 0
        warnings: List[WarningItem] = []

        def replace(match: re.Match[str]) -> str:
            nonlocal seen, migrated
            seen += 1
            original = match.group(0)
            content = match.group(1).strip()

            migrated_content, warning = self._migrate_content(content)
            if warning is not None:
                warnings.append(
                    WarningItem(
                        path=value_path,
                        expression=original,
                        message=warning,
                    )
                )
            if migrated_content is None:
                return original

            migrated += 1
            return "${" + migrated_content + "}"

        new_text = EXPR_PATTERN.sub(replace, text)
        return new_text, seen, migrated, warnings

    def _migrate_content(self, content: str) -> Tuple[Optional[str], Optional[str]]:
        # Canonical expression already
        if content.startswith("node:") and "|" in content:
            return None, None

        # Global vars remain untouched
        if content in GLOBAL_VARS:
            return None, None

        root = self._extract_root(content)
        if root in RESERVED_ROOTS:
            return None, None

        matched_label, path = self._match_legacy_label(content)
        if matched_label is None:
            return None, None

        ids = self.label_to_ids.get(matched_label, [])
        if len(ids) > 1:
            return None, (
                f"label ambiguo '{matched_label}' mapea a multiples node ids: "
                + ", ".join(ids)
            )
        if len(ids) == 0:
            return None, f"label '{matched_label}' no encontrado en nodos"

        canonical_path = path[1:] if path.startswith(".") else path
        if not canonical_path:
            return None, f"expresion legacy sin path util: '{content}'"

        return f"node:{ids[0]}|{canonical_path}", None

    @staticmethod
    def _extract_root(content: str) -> str:
        match = re.match(r"^([^\.\[]+)", content)
        return match.group(1) if match else content

    def _match_legacy_label(self, content: str) -> Tuple[Optional[str], Optional[str]]:
        # Match longest label prefix where next char is '.' or '['.
        for label in self.labels_sorted:
            if not content.startswith(label):
                continue
            rest = content[len(label) :]
            if rest.startswith(".") or rest.startswith("["):
                return label, rest
        return None, None


def iter_nodes(nodes: Iterable[Dict[str, Any]]) -> Iterable[Dict[str, Any]]:
    for node in nodes:
        if not isinstance(node, dict):
            continue
        yield node
        children = node.get("children")
        if isinstance(children, list):
            yield from iter_nodes(children)


def map_labels(nodes: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    label_to_ids: Dict[str, List[str]] = {}
    for node in iter_nodes(nodes):
        node_id = node.get("id")
        label = node.get("label")
        if not isinstance(node_id, str) or not node_id:
            continue
        if not isinstance(label, str):
            continue
        clean = label.strip()
        if not clean:
            continue
        label_to_ids.setdefault(clean, []).append(node_id)
    return label_to_ids


def migrate_object_values(
    value: Any,
    value_path: str,
    migrator: ExpressionMigrator,
    result: BotMigrationResult,
) -> Any:
    if isinstance(value, str):
        new_value, seen, migrated, warnings = migrator.migrate_string(value, value_path)
        result.strings_scanned += 1
        result.expressions_seen += seen
        result.expressions_migrated += migrated
        if new_value != value:
            result.strings_changed += 1
            result.changed = True
        result.warnings.extend(warnings)
        return new_value

    if isinstance(value, list):
        return [
            migrate_object_values(item, f"{value_path}[{idx}]", migrator, result)
            for idx, item in enumerate(value)
        ]

    if isinstance(value, dict):
        updated: Dict[str, Any] = {}
        for key, item in value.items():
            child_path = f"{value_path}.{key}" if value_path else key
            updated[key] = migrate_object_values(item, child_path, migrator, result)
        return updated

    return value


def resolve_project_root(path_arg: str) -> Tuple[Path, Path]:
    candidate = Path(path_arg).expanduser().resolve()
    if candidate.is_file():
        if candidate.name != MANIFEST_FILE:
            raise FileNotFoundError(
                f"Archivo invalido: '{candidate}'. Se esperaba '{MANIFEST_FILE}'."
            )
        return candidate.parent, candidate

    manifest_path = candidate / MANIFEST_FILE
    if manifest_path.exists():
        return candidate, manifest_path

    raise FileNotFoundError(f"No se encontro '{MANIFEST_FILE}' en '{candidate}'.")


def discover_bot_files(project_root: Path, manifest_path: Path) -> List[Path]:
    bot_files: Dict[Path, None] = {}

    # Preferred source: manifest bots[].path
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Manifest invalido ({manifest_path}): {exc}") from exc

    bots = manifest.get("bots", [])
    if isinstance(bots, list):
        for bot in bots:
            if not isinstance(bot, dict):
                continue
            rel_path = bot.get("path")
            if not isinstance(rel_path, str) or not rel_path.strip():
                continue
            bot_file = (project_root / rel_path / BOT_FILE).resolve()
            bot_files[bot_file] = None

    # Fallback discovery to catch bots not listed yet in manifest.
    for bot_file in sorted((project_root / "bots").glob(f"*/{BOT_FILE}")):
        bot_files[bot_file.resolve()] = None

    return sorted(bot_files.keys())


def migrate_bot_file(bot_file: Path, write: bool) -> BotMigrationResult:
    content = bot_file.read_text(encoding="utf-8")
    data = json.loads(content)

    result = BotMigrationResult(bot_file=bot_file)
    bot_info = data.get("bot")
    if isinstance(bot_info, dict):
        name = bot_info.get("name")
        if isinstance(name, str):
            result.bot_name = name

    nodes = data.get("nodes", [])
    if not isinstance(nodes, list):
        nodes = []
    result.nodes_total = sum(1 for _ in iter_nodes(nodes))

    label_map = map_labels(nodes)
    migrator = ExpressionMigrator(label_map)

    # Migrate node configs only (including children configs via iter_nodes).
    for node in iter_nodes(nodes):
        node_id = node.get("id", "<sin-id>")
        if "config" in node:
            node["config"] = migrate_object_values(
                node["config"],
                f"nodes[{node_id}].config",
                migrator,
                result,
            )

    # Migrate optional top-level variables section.
    if "variables" in data:
        data["variables"] = migrate_object_values(
            data["variables"],
            "variables",
            migrator,
            result,
        )

    if write and result.changed:
        bot_file.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    return result


def print_report(results: List[BotMigrationResult], write: bool) -> None:
    mode = "WRITE" if write else "DRY-RUN"
    print(f"\n=== Migracion de expresiones ({mode}) ===")

    total_files = len(results)
    changed_files = sum(1 for r in results if r.changed)
    total_seen = sum(r.expressions_seen for r in results)
    total_migrated = sum(r.expressions_migrated for r in results)
    total_warnings = sum(len(r.warnings) for r in results)

    print(f"bots detectados: {total_files}")
    print(f"bots con cambios: {changed_files}")
    print(f"expresiones analizadas: {total_seen}")
    print(f"expresiones migradas: {total_migrated}")
    print(f"advertencias: {total_warnings}")

    for result in results:
        rel = result.bot_file
        bot_name = f" ({result.bot_name})" if result.bot_name else ""
        print(f"\n- {rel}{bot_name}")
        print(
            f"  nodos={result.nodes_total} strings={result.strings_scanned} "
            f"expr={result.expressions_seen} migradas={result.expressions_migrated} "
            f"cambio={'si' if result.changed else 'no'}"
        )
        if result.warnings:
            for warning in result.warnings[:20]:
                print(
                    "  ! "
                    + f"{warning.path}: {warning.expression} -> {warning.message}"
                )
            extra = len(result.warnings) - 20
            if extra > 0:
                print(f"  ! ... {extra} advertencias adicionales")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Migra expresiones legacy de Studio a formato canonico node:id."
    )
    parser.add_argument(
        "project",
        nargs="?",
        default=".",
        help=f"Ruta del proyecto (directorio con {MANIFEST_FILE} o archivo {MANIFEST_FILE}).",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Escribe cambios en disco. Sin esta bandera solo simula (dry-run).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        project_root, manifest_path = resolve_project_root(args.project)
        bot_files = discover_bot_files(project_root, manifest_path)
    except (FileNotFoundError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    if not bot_files:
        print("No se encontraron bots para migrar.")
        return 0

    results: List[BotMigrationResult] = []
    has_errors = False

    for bot_file in bot_files:
        if not bot_file.exists():
            print(f"ADVERTENCIA: bot.json no encontrado: {bot_file}")
            continue
        try:
            results.append(migrate_bot_file(bot_file, write=args.write))
        except json.JSONDecodeError as exc:
            has_errors = True
            print(f"ERROR: JSON invalido en {bot_file}: {exc}")
        except OSError as exc:
            has_errors = True
            print(f"ERROR: no se pudo procesar {bot_file}: {exc}")

    print_report(results, write=args.write)
    return 1 if has_errors else 0


if __name__ == "__main__":
    sys.exit(main())
