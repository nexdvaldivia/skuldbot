"""
Skuldbot Custom Libraries para Robot Framework

Estas librerías proveen funcionalidades que no existen en rpaframework
o que requieren integración específica con el ecosistema Skuldbot.

Librerías disponibles:
- SkuldVault: Gestión segura de secrets y credenciales
- SkuldAI: Integración con LLMs (OpenAI, Anthropic, Azure, Ollama)
- SkuldHuman: Human-in-the-loop (aprobaciones, inputs, revisiones)
- SkuldForms: Form Trigger (formularios web que inician workflows)
- SkuldCompliance: HIPAA Safe Harbor, PII/PHI detection & de-identification
- SkuldDataQuality: Data Quality validation powered by Great Expectations
- ExcelLibrary: Operaciones Excel con funcionalidades extendidas
- BrowserLibrary: Automatización web
- ControlLibrary: Control de flujo y utilidades
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

# SkuldCompliance - HIPAA Safe Harbor, PII/PHI (solo usa stdlib)
from skuldbot.libs.compliance import SkuldCompliance

# SkuldDataQuality - Data Quality (usa Great Expectations opcionalmente)
from skuldbot.libs.data_quality import SkuldDataQuality

# RPA Libraries - requieren rpaframework instalado
try:
    from skuldbot.libs.excel import ExcelLibrary
    from skuldbot.libs.browser import BrowserLibrary
    from skuldbot.libs.control import ControlLibrary
    _RPA_AVAILABLE = True
except ImportError:
    ExcelLibrary = None  # type: ignore
    BrowserLibrary = None  # type: ignore
    ControlLibrary = None  # type: ignore
    _RPA_AVAILABLE = False

__all__ = [
    # Skuld-specific
    "SkuldVault",
    "SkuldForms",
    "SkuldAI",
    "SkuldHuman",
    "SkuldCompliance",
    "SkuldDataQuality",
    # RPA Libraries
    "ExcelLibrary",
    "BrowserLibrary",
    "ControlLibrary",
    # Availability flags
    "_AI_AVAILABLE",
    "_HUMAN_AVAILABLE",
    "_RPA_AVAILABLE",
]
