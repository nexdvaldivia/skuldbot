"""
Librerías de nodos RPA y Registry de mapeo DSL → Robot Framework
"""

# Registry (siempre disponible - no tiene dependencias externas)
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

# Custom Libraries (requieren rpaframework instalado)
# Import condicional para evitar errores si rpaframework no está
try:
    from skuldbot.nodes.browser import BrowserLibrary
    from skuldbot.nodes.excel import ExcelLibrary
    from skuldbot.nodes.control import ControlLibrary
    _RPA_AVAILABLE = True
except ImportError:
    BrowserLibrary = None  # type: ignore
    ExcelLibrary = None  # type: ignore
    ControlLibrary = None  # type: ignore
    _RPA_AVAILABLE = False

__all__ = [
    # Registry (siempre disponible)
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
    # Custom Libraries (pueden ser None si rpaframework no está instalado)
    "BrowserLibrary",
    "ExcelLibrary",
    "ControlLibrary",
    "_RPA_AVAILABLE",
]

