from __future__ import annotations

import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
STUDIO_TEMPLATES_PATH = REPO_ROOT / "apps" / "studio" / "src" / "data" / "nodeTemplates.ts"
REGISTRY_PATH = REPO_ROOT / "services" / "engine" / "skuldbot" / "nodes" / "registry.py"
COMPILER_TEMPLATE_PATH = (
    REPO_ROOT / "services" / "engine" / "skuldbot" / "compiler" / "templates" / "main_v2.robot.j2"
)


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _quoted_items(blob: str) -> set[str]:
    return set(re.findall(r"'([a-z0-9_]+)'", blob))


def _extract_studio_node_types(prefix: str) -> set[str]:
    text = _read(STUDIO_TEMPLATES_PATH)
    return set(re.findall(rf'type:\s*"({re.escape(prefix)}[a-z0-9_]+)"', text))


def _extract_registry_node_types(prefix: str) -> set[str]:
    text = _read(REGISTRY_PATH)
    return set(re.findall(rf'node_type="({re.escape(prefix)}[a-z0-9_]+)"', text))


def _extract_compiler_variants(kind: str) -> set[str]:
    text = _read(COMPILER_TEMPLATE_PATH)
    eq_matches = set(re.findall(rf"{kind}_type\s*==\s*'([a-z0-9_]+)'", text))
    in_matches: set[str] = set()
    for match in re.finditer(rf"{kind}_type\s+in\s+\[([^\]]+)\]", text):
        in_matches.update(_quoted_items(match.group(1)))
    return eq_matches | in_matches


def _full_names(prefix: str, variants: set[str]) -> set[str]:
    return {f"{prefix}{variant}" for variant in variants}


def _diff_message(label: str, expected: set[str], actual: set[str]) -> str:
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    return (
        f"{label} mismatch\n"
        f"missing: {missing}\n"
        f"extra: {extra}"
    )


def test_data_taps_studio_compiler_registry_are_in_sync() -> None:
    studio_taps = _extract_studio_node_types("data.tap.")
    compiler_taps = _full_names("data.tap.", _extract_compiler_variants("tap"))
    registry_taps = _extract_registry_node_types("data.tap.")

    assert studio_taps == compiler_taps, _diff_message("studio vs compiler taps", studio_taps, compiler_taps)
    assert studio_taps == registry_taps, _diff_message("studio vs registry taps", studio_taps, registry_taps)


def test_data_targets_studio_compiler_registry_are_in_sync() -> None:
    studio_targets = _extract_studio_node_types("data.target.")
    compiler_targets = _full_names("data.target.", _extract_compiler_variants("target"))
    registry_targets = _extract_registry_node_types("data.target.")

    assert studio_targets == compiler_targets, _diff_message(
        "studio vs compiler targets", studio_targets, compiler_targets
    )
    assert studio_targets == registry_targets, _diff_message(
        "studio vs registry targets", studio_targets, registry_targets
    )
