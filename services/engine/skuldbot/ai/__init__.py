"""
Skuldbot AI Module - Versioned Prompt System

This module provides a versioned, auditable prompt management system
for all AI-powered nodes in Skuldbot.

Key Features:
- Prompts stored as versioned artifacts (.md files)
- Audit logging for compliance (HIPAA, SOC2, etc.)
- Context-aware prompts per industry vertical
- Compatible with private LLM deployments (Azure OpenAI, Ollama)

Architecture:
    UI (Node Config) → Prompt Loader → LLM Provider

The user configures WHAT (objectives, constraints),
the system controls HOW (prompt, reasoning).

Usage:
    from skuldbot.ai import PromptLoader

    loader = PromptLoader()
    prompt = loader.load_prompt("repair", version="v1")
    context = loader.get_context_prompt("repair", "healthcare")
"""

from skuldbot.ai.prompt_loader import (
    PromptLoader,
    PromptMetadata,
    PromptAuditLog,
    get_prompt_loader,
    load_prompt,
    get_context_prompt,
    build_full_prompt,
)

__all__ = [
    "PromptLoader",
    "PromptMetadata",
    "PromptAuditLog",
    "get_prompt_loader",
    "load_prompt",
    "get_context_prompt",
    "build_full_prompt",
]
