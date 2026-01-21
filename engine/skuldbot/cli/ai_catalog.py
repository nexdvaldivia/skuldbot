#!/usr/bin/env python3
"""
CLI para generar el catálogo de nodos para el AI Planner.

Este script es invocado por Tauri para obtener el catálogo dinámico
de todos los nodos disponibles en el NodeRegistry.

Usage:
    python -m skuldbot.cli.ai_catalog [--format text|json]
"""

import argparse
import json
import sys


def main():
    parser = argparse.ArgumentParser(
        description="Generate AI Planner node catalog from NodeRegistry"
    )
    parser.add_argument(
        "--format",
        choices=["text", "json"],
        default="text",
        help="Output format: 'text' for prompt, 'json' for structured data"
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
    else:
        # Text format for AI prompt
        print(generate_ai_planner_catalog())


if __name__ == "__main__":
    main()
