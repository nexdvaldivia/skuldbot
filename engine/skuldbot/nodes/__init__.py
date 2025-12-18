"""
Registry de mapeo DSL → Robot Framework

Este módulo contiene el registry de nodos que mapea tipos de nodos DSL
a sus correspondientes keywords de Robot Framework.

Las librerías de Robot Framework están en skuldbot.libs
"""

from skuldbot.nodes.registry import (
    NODE_REGISTRY,
    NodeMapping,
    NodeCategory,
    LibraryImport,
    register_node,
    get_node_mapping,
    get_required_libraries,
    get_all_nodes,
    get_nodes_by_category,
    get_node_count,
    get_category_summary,
)

__all__ = [
    "NODE_REGISTRY",
    "NodeMapping",
    "NodeCategory",
    "LibraryImport",
    "register_node",
    "get_node_mapping",
    "get_required_libraries",
    "get_all_nodes",
    "get_nodes_by_category",
    "get_node_count",
    "get_category_summary",
]

