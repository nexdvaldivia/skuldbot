"""Adapters for executing orchestrator ExecutionPlan payloads with the runner."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping
from zipfile import ZIP_DEFLATED, ZipFile


def execution_plan_to_dsl(
    plan: Mapping[str, Any],
    run_id: str,
    bot_name: str,
) -> dict[str, Any]:
    """
    Convert an ExecutionPlan to a basic DSL shape that the engine compiler accepts.

    The compiler's DSL supports success/error outputs, so we map execution-plan jumps
    onto that pair as best effort. This keeps runner compatibility with the current
    orchestrator contract while preserving deterministic execution.
    """
    steps = plan.get("steps")
    if not isinstance(steps, list) or not steps:
        raise ValueError("Execution plan has no steps")

    step_by_id: dict[str, Mapping[str, Any]] = {}
    for raw_step in steps:
        if not isinstance(raw_step, Mapping):
            continue
        step_id = raw_step.get("stepId")
        if not isinstance(step_id, str) or not step_id:
            continue
        step_by_id[step_id] = raw_step

    if not step_by_id:
        raise ValueError("Execution plan does not contain valid step entries")

    used_ids: set[str] = set()
    step_to_node_id: dict[str, str] = {}
    for step_id, step in step_by_id.items():
        base_node_id = str(step.get("nodeId") or step_id)
        node_id = base_node_id
        idx = 2
        while node_id in used_ids:
            node_id = f"{base_node_id}_{idx}"
            idx += 1
        used_ids.add(node_id)
        step_to_node_id[step_id] = node_id

    def resolve_target(step: Mapping[str, Any], event_names: list[str]) -> str:
        jumps = step.get("jumps")
        if not isinstance(jumps, list):
            return "END"
        for event_name in event_names:
            for jump in jumps:
                if not isinstance(jump, Mapping):
                    continue
                if jump.get("on") != event_name:
                    continue
                target_step = jump.get("toStepId")
                if target_step == "END":
                    return "END"
                if isinstance(target_step, str) and target_step in step_to_node_id:
                    return step_to_node_id[target_step]
        return "END"

    nodes: list[dict[str, Any]] = []
    for step_id, step in step_by_id.items():
        node_id = step_to_node_id[step_id]
        node_type = str(step.get("type") or "control.log")
        config = step.get("resolvedConfig")
        if not isinstance(config, Mapping):
            config = {}

        success_target = resolve_target(step, ["success", "done", "then", "default"])
        error_target = resolve_target(step, ["error", "else", "failure"])

        node = {
            "id": node_id,
            "type": node_type,
            "config": dict(config),
            "outputs": {
                "success": success_target,
                "error": error_target,
            },
            "label": str(step.get("nodeId") or node_id),
        }
        nodes.append(node)

    entry_step_id = plan.get("entryStepId")
    if not isinstance(entry_step_id, str) or entry_step_id not in step_to_node_id:
        entry_step_id = next(iter(step_to_node_id.keys()))

    return {
        "version": "1.0",
        "bot": {
            "id": run_id,
            "name": bot_name or run_id,
            "version": "1.0.0",
        },
        "nodes": nodes,
        "triggers": [],
        "start_node": step_to_node_id[entry_step_id],
    }


def build_zip_package_from_plan(
    plan: Mapping[str, Any],
    run_id: str,
    bot_name: str,
    output_dir: Path,
) -> Path:
    """
    Convert an ExecutionPlan into a temporary zip package expected by BotExecutor.
    """
    try:
        from skuldbot import Compiler
    except ImportError as exc:  # pragma: no cover - environment-dependent
        raise RuntimeError(
            "Runner received an execution plan but `skuldbot` engine is not installed."
        ) from exc

    dsl = execution_plan_to_dsl(plan=plan, run_id=run_id, bot_name=bot_name)

    compiler = Compiler()
    bot_dir = compiler.compile_to_disk(dsl, str(output_dir))

    zip_path = output_dir / f"{run_id}.zip"
    with ZipFile(zip_path, "w", compression=ZIP_DEFLATED) as zip_file:
        for file_path in bot_dir.rglob("*"):
            if file_path.is_file():
                arcname = file_path.relative_to(bot_dir)
                zip_file.write(file_path, arcname=str(arcname))

    return zip_path
