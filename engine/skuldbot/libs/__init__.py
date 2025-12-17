"""
Skuldbot Custom Libraries para Robot Framework

Estas librerías proveen funcionalidades que no existen en rpaframework
o que requieren integración específica con el ecosistema Skuldbot.

Librerías disponibles:
- SkuldVault: Gestión segura de secrets y credenciales
- SkuldAI: Integración con LLMs (OpenAI, Anthropic, Azure, Ollama)
- SkuldHuman: Human-in-the-loop (aprobaciones, inputs, revisiones)
- SkuldForms: Form Trigger (formularios web que inician workflows)
"""

from typing import TYPE_CHECKING

# SkuldVault - siempre disponible (solo usa stdlib + opcionales)
from skuldbot.libs.vault import SkuldVault

# SkuldForms - siempre disponible (solo usa stdlib)
from skuldbot.libs.forms import SkuldForms

# SkuldAI - requiere openai/anthropic para funcionar completamente
try:
    from skuldbot.libs.ai import SkuldAI
    _AI_AVAILABLE = True
except ImportError:
    SkuldAI = None  # type: ignore
    _AI_AVAILABLE = False

# SkuldHuman - requiere RPA.Dialogs para modo local
try:
    from skuldbot.libs.human import SkuldHuman
    _HUMAN_AVAILABLE = True
except ImportError:
    SkuldHuman = None  # type: ignore
    _HUMAN_AVAILABLE = False

__all__ = [
    "SkuldVault",
    "SkuldForms",
    "SkuldAI",
    "SkuldHuman",
    "_AI_AVAILABLE",
    "_HUMAN_AVAILABLE",
]
