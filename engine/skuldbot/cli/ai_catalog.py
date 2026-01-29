#!/usr/bin/env python3
"""
CLI para generar el catálogo de nodos para el AI Planner.

Este script es invocado por Tauri para obtener el catálogo dinámico
de todos los nodos disponibles en el NodeRegistry.

Usage:
    python -m skuldbot.cli.ai_catalog [--format text|json|compact]
"""

import argparse
import json
import sys


def generate_compact_catalog(nodes: list) -> str:
    """
    Generate a compact catalog format that's 75% smaller than text format.
    Groups nodes by category: category: action1, action2, action3
    """
    # Group by category
    categories = {}
    for node in nodes:
        node_type = node.get("node_type", "")
        if "." not in node_type:
            continue
        parts = node_type.split(".", 1)
        cat = parts[0]
        action = parts[1] if len(parts) > 1 else node_type
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(action)
    
    # Build compact output
    lines = ["VALID NODE TYPES (format: category.action):"]
    for cat in sorted(categories.keys()):
        actions = sorted(set(categories[cat]))
        lines.append(f"{cat}: {', '.join(actions)}")
    
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Generate AI Planner node catalog from NodeRegistry"
    )
    parser.add_argument(
        "--format",
        choices=["text", "json", "compact"],
        default="text",
        help="Output format: 'text' for full prompt, 'json' for structured data, 'compact' for optimized LLM prompt"
    )
    args = parser.parse_args()

    # Import here to avoid circular imports
    from skuldbot.nodes.registry import (
        generate_ai_planner_catalog,
        get_ai_planner_catalog_json,
        get_node_count,
        get_category_summary,
    )

    if args.format == "json":
        output = {
            "total_nodes": get_node_count(),
            "categories": get_category_summary(),
            "nodes": get_ai_planner_catalog_json(),
        }
        print(json.dumps(output, indent=2))
    elif args.format == "compact":
        # Compact format: 75% smaller, optimized for LLM prompts
        nodes = get_ai_planner_catalog_json()
        print(generate_compact_catalog(nodes))
    else:
        # Text format for AI prompt (verbose)
        print(generate_ai_planner_catalog())


if __name__ == "__main__":
    main()
