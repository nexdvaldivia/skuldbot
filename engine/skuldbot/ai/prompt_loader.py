"""
Prompt Loader - Versioned Prompt Management for Enterprise AI

This module provides a centralized, auditable system for loading and managing
AI prompts. Designed for regulated industries (Healthcare, Insurance, Finance)
where prompt governance and auditability are critical.

Key Features:
- Version Control: Prompts are versioned files (system_v1.md, system_v2.md)
- Audit Logging: Every prompt load is logged with metadata
- Context Injection: Industry-specific context (healthcare, insurance, finance)
- Rollback Support: Easy to revert to previous prompt versions
- Compliance Ready: Audit trail for HIPAA, SOC2, regulatory requirements

Architecture:
    ┌─────────────────────────────────────────────────────────────┐
    │  User Configuration (from UI)                               │
    │  - context: "healthcare"                                    │
    │  - min_confidence: 0.9                                      │
    │  - (NO prompt field - user cannot control prompt)           │
    └─────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
    ┌─────────────────────────────────────────────────────────────┐
    │  PromptLoader.build_full_prompt()                           │
    │  1. Load system prompt (system_v1.md)                       │
    │  2. Load context (context_healthcare.md)                    │
    │  3. Inject user config as payload                           │
    │  4. Log audit event                                         │
    └─────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
    ┌─────────────────────────────────────────────────────────────┐
    │  LLM Provider (Azure OpenAI / Ollama / OpenAI)              │
    │  - Receives assembled prompt                                │
    │  - Returns structured response                              │
    └─────────────────────────────────────────────────────────────┘

Usage:
    from skuldbot.ai import PromptLoader

    loader = PromptLoader()

    # Load a specific prompt version
    system_prompt = loader.load_prompt("repair", version="v1")

    # Load industry context
    context = loader.get_context_prompt("repair", "healthcare")

    # Build complete prompt for LLM
    full_prompt = loader.build_full_prompt(
        node_type="repair",
        version="v1",
        context="healthcare",
        user_config={"min_confidence": 0.9}
    )

Provider Recommendations for Regulated Industries:
    - Healthcare (HIPAA): Azure OpenAI or Ollama (on-premise)
    - Finance (SOX/PCI): Azure OpenAI or Ollama
    - Insurance: Azure OpenAI or Ollama
    - General: Any provider (OpenAI, Anthropic, Azure, Ollama)
"""

import os
import re
import json
import logging
import hashlib
from pathlib import Path
from datetime import datetime, timezone
from dataclasses import dataclass, field, asdict
from typing import Optional, Dict, Any, List
from functools import lru_cache

# Configure logging
logger = logging.getLogger("skuldbot.ai.prompts")


@dataclass
class PromptMetadata:
    """
    Metadata extracted from prompt file frontmatter.

    Each prompt file should have YAML frontmatter:
    ---
    version: "1.0"
    created: "2025-12-18"
    author: "Skuldbot Team"
    node: "ai.repair_data"
    description: "System prompt for AI data repair"
    audit_required: true
    ---
    """
    version: str = "1.0"
    created: str = ""
    author: str = "Skuldbot Team"
    node: str = ""
    description: str = ""
    audit_required: bool = True
    checksum: str = ""  # SHA256 of prompt content


@dataclass
class PromptAuditLog:
    """
    Audit log entry for prompt usage.

    This is logged every time a prompt is loaded, providing
    a complete audit trail for compliance requirements.
    """
    timestamp: str = ""
    node_type: str = ""
    prompt_name: str = ""
    prompt_version: str = ""
    context: Optional[str] = None
    provider: Optional[str] = None
    execution_id: Optional[str] = None
    user_config_hash: str = ""  # Hash of user config (not the config itself for privacy)
    prompt_checksum: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for logging/storage."""
        return asdict(self)

    def to_json(self) -> str:
        """Convert to JSON string for structured logging."""
        return json.dumps(self.to_dict(), indent=2)


class PromptLoader:
    """
    Central prompt management system for Skuldbot AI nodes.

    This class handles:
    - Loading prompts from versioned files
    - Parsing frontmatter metadata
    - Loading context-specific prompts
    - Building complete prompts for LLM calls
    - Audit logging for compliance

    Directory Structure:
        engine/skuldbot/ai/prompts/
        ├── extract/
        │   └── system_v1.md
        ├── repair/
        │   ├── system_v1.md
        │   ├── context_healthcare.md
        │   ├── context_insurance.md
        │   └── context_finance.md
        └── ...
    """

    # Base path for prompts (relative to this file)
    PROMPTS_DIR = Path(__file__).parent / "prompts"

    # Default version to use
    DEFAULT_VERSION = "v1"

    # Supported node types and their prompt directories
    SUPPORTED_NODES = {
        "extract": "extract",
        "extract_data": "extract",
        "extract_table": "extract_table",
        "summarize": "summarize",
        "classify": "classify",
        "translate": "translate",
        "sentiment": "sentiment",
        "analyze_image": "analyze_image",
        "compare_images": "compare_images",
        "repair": "repair",
        "repair_data": "repair",
        "suggest_repairs": "repair",
    }

    # Supported contexts per node
    SUPPORTED_CONTEXTS = {
        "repair": ["healthcare", "insurance", "finance", "general"],
        # Other nodes can have contexts added as needed
    }

    def __init__(self, prompts_dir: Optional[Path] = None):
        """
        Initialize the PromptLoader.

        Args:
            prompts_dir: Optional custom directory for prompts.
                         Defaults to ./prompts relative to this file.
        """
        self.prompts_dir = Path(prompts_dir) if prompts_dir else self.PROMPTS_DIR
        self._audit_logs: List[PromptAuditLog] = []
        self._cache: Dict[str, str] = {}

        logger.debug(f"PromptLoader initialized with prompts_dir: {self.prompts_dir}")

    def _get_prompt_path(
        self,
        node_type: str,
        filename: str
    ) -> Path:
        """
        Get the full path to a prompt file.

        Args:
            node_type: The type of node (e.g., "repair", "extract")
            filename: The filename (e.g., "system_v1.md")

        Returns:
            Full path to the prompt file
        """
        # Normalize node type
        node_dir = self.SUPPORTED_NODES.get(node_type, node_type)
        return self.prompts_dir / node_dir / filename

    def _parse_frontmatter(self, content: str) -> tuple[PromptMetadata, str]:
        """
        Parse YAML frontmatter from prompt content.

        Args:
            content: Raw prompt file content

        Returns:
            Tuple of (metadata, prompt_body)
        """
        metadata = PromptMetadata()
        prompt_body = content

        # Check for frontmatter
        frontmatter_pattern = r'^---\s*\n(.*?)\n---\s*\n(.*)$'
        match = re.match(frontmatter_pattern, content, re.DOTALL)

        if match:
            frontmatter_text = match.group(1)
            prompt_body = match.group(2).strip()

            # Parse simple YAML (key: value pairs)
            for line in frontmatter_text.split('\n'):
                line = line.strip()
                if ':' in line:
                    key, value = line.split(':', 1)
                    key = key.strip()
                    value = value.strip().strip('"\'')

                    if key == 'version':
                        metadata.version = value
                    elif key == 'created':
                        metadata.created = value
                    elif key == 'author':
                        metadata.author = value
                    elif key == 'node':
                        metadata.node = value
                    elif key == 'description':
                        metadata.description = value
                    elif key == 'audit_required':
                        metadata.audit_required = value.lower() == 'true'

        # Calculate checksum of prompt body
        metadata.checksum = hashlib.sha256(prompt_body.encode()).hexdigest()[:16]

        return metadata, prompt_body

    def _calculate_config_hash(self, config: Dict[str, Any]) -> str:
        """
        Calculate a hash of user configuration for audit logging.

        We hash the config rather than storing it directly to:
        1. Protect sensitive data
        2. Allow verification without exposing config
        3. Keep audit logs small

        Args:
            config: User configuration dictionary

        Returns:
            SHA256 hash (first 16 chars)
        """
        config_str = json.dumps(config, sort_keys=True)
        return hashlib.sha256(config_str.encode()).hexdigest()[:16]

    def load_prompt(
        self,
        node_type: str,
        version: str = "v1",
        use_cache: bool = True
    ) -> tuple[str, PromptMetadata]:
        """
        Load a system prompt for a specific node type.

        Args:
            node_type: The type of node (e.g., "repair", "extract")
            version: Version string (e.g., "v1", "v2")
            use_cache: Whether to use cached prompts

        Returns:
            Tuple of (prompt_content, metadata)

        Raises:
            FileNotFoundError: If prompt file doesn't exist
            ValueError: If node_type is not supported

        Example:
            >>> loader = PromptLoader()
            >>> prompt, meta = loader.load_prompt("repair", version="v1")
            >>> print(meta.version)
            "1.0"
        """
        # Validate node type
        if node_type not in self.SUPPORTED_NODES:
            raise ValueError(
                f"Unsupported node type: {node_type}. "
                f"Supported: {list(self.SUPPORTED_NODES.keys())}"
            )

        # Build filename
        filename = f"system_{version}.md"
        cache_key = f"{node_type}:{filename}"

        # Check cache
        if use_cache and cache_key in self._cache:
            content = self._cache[cache_key]
            metadata, prompt = self._parse_frontmatter(content)
            return prompt, metadata

        # Load from file
        prompt_path = self._get_prompt_path(node_type, filename)

        if not prompt_path.exists():
            raise FileNotFoundError(
                f"Prompt file not found: {prompt_path}\n"
                f"Expected location: {self.prompts_dir / self.SUPPORTED_NODES[node_type]}"
            )

        content = prompt_path.read_text(encoding='utf-8')

        # Cache raw content
        if use_cache:
            self._cache[cache_key] = content

        # Parse and return
        metadata, prompt = self._parse_frontmatter(content)

        logger.debug(
            f"Loaded prompt: {node_type}/{filename} "
            f"(version={metadata.version}, checksum={metadata.checksum})"
        )

        return prompt, metadata

    def get_context_prompt(
        self,
        node_type: str,
        context: str,
        use_cache: bool = True
    ) -> Optional[str]:
        """
        Load a context-specific prompt (e.g., healthcare, insurance).

        Context prompts provide industry-specific rules and guidelines
        that are appended to the system prompt.

        Args:
            node_type: The type of node (e.g., "repair")
            context: The industry context (e.g., "healthcare", "insurance")
            use_cache: Whether to use cached prompts

        Returns:
            Context prompt content, or None if not found

        Example:
            >>> loader = PromptLoader()
            >>> context = loader.get_context_prompt("repair", "healthcare")
            >>> print(context[:50])
            "For healthcare data (HIPAA-regulated)..."
        """
        # Check if this node supports contexts
        supported = self.SUPPORTED_CONTEXTS.get(node_type, [])
        if context not in supported and context != "general":
            logger.warning(
                f"Context '{context}' not officially supported for {node_type}. "
                f"Supported: {supported}"
            )

        # Build filename
        filename = f"context_{context}.md"
        cache_key = f"{node_type}:context:{context}"

        # Check cache
        if use_cache and cache_key in self._cache:
            return self._cache[cache_key]

        # Load from file
        prompt_path = self._get_prompt_path(node_type, filename)

        if not prompt_path.exists():
            logger.debug(f"No context file found: {prompt_path}")
            return None

        content = prompt_path.read_text(encoding='utf-8')

        # Parse frontmatter (discard metadata for context files)
        _, context_prompt = self._parse_frontmatter(content)

        # Cache
        if use_cache:
            self._cache[cache_key] = context_prompt

        logger.debug(f"Loaded context: {node_type}/context_{context}.md")

        return context_prompt

    def build_full_prompt(
        self,
        node_type: str,
        version: str = "v1",
        context: Optional[str] = None,
        user_config: Optional[Dict[str, Any]] = None,
        execution_id: Optional[str] = None,
        provider: Optional[str] = None,
        log_audit: bool = True
    ) -> Dict[str, Any]:
        """
        Build a complete prompt ready for LLM consumption.

        This is the main entry point for getting prompts. It:
        1. Loads the system prompt
        2. Loads context if specified
        3. Creates the payload structure
        4. Logs audit event

        Args:
            node_type: The type of node (e.g., "repair", "extract")
            version: Prompt version (e.g., "v1")
            context: Optional industry context (e.g., "healthcare")
            user_config: User configuration to include in payload
            execution_id: Optional execution ID for tracing
            provider: LLM provider being used (for audit)
            log_audit: Whether to log this prompt load

        Returns:
            Dictionary with:
            - system_prompt: The system prompt text
            - context_prompt: Optional context prompt
            - full_prompt: Combined prompt
            - metadata: Prompt metadata
            - audit_id: Audit log ID

        Example:
            >>> loader = PromptLoader()
            >>> result = loader.build_full_prompt(
            ...     node_type="repair",
            ...     version="v1",
            ...     context="healthcare",
            ...     user_config={"min_confidence": 0.9},
            ...     provider="azure_openai"
            ... )
            >>> print(result["metadata"]["version"])
            "1.0"
        """
        # Load system prompt
        system_prompt, metadata = self.load_prompt(node_type, version)

        # Load context if specified
        context_prompt = None
        if context:
            context_prompt = self.get_context_prompt(node_type, context)

        # Build full prompt
        full_prompt = system_prompt
        if context_prompt:
            full_prompt = f"{system_prompt}\n\n{context_prompt}"

        # Create audit log
        audit_log = None
        if log_audit:
            audit_log = PromptAuditLog(
                timestamp=datetime.now(timezone.utc).isoformat(),
                node_type=node_type,
                prompt_name=f"system_{version}",
                prompt_version=metadata.version,
                context=context,
                provider=provider,
                execution_id=execution_id,
                user_config_hash=self._calculate_config_hash(user_config or {}),
                prompt_checksum=metadata.checksum,
                metadata={
                    "author": metadata.author,
                    "created": metadata.created,
                    "description": metadata.description,
                }
            )
            self._audit_logs.append(audit_log)

            # Log to structured logger
            logger.info(
                f"Prompt loaded: node={node_type}, version={metadata.version}, "
                f"context={context}, provider={provider}, "
                f"checksum={metadata.checksum}"
            )

        return {
            "system_prompt": system_prompt,
            "context_prompt": context_prompt,
            "full_prompt": full_prompt,
            "metadata": asdict(metadata),
            "audit_log": audit_log.to_dict() if audit_log else None,
        }

    def get_audit_logs(self) -> List[Dict[str, Any]]:
        """
        Get all audit logs from this session.

        Returns:
            List of audit log dictionaries
        """
        return [log.to_dict() for log in self._audit_logs]

    def clear_cache(self):
        """Clear the prompt cache."""
        self._cache.clear()
        logger.debug("Prompt cache cleared")

    def list_available_prompts(self, node_type: Optional[str] = None) -> Dict[str, List[str]]:
        """
        List all available prompts.

        Args:
            node_type: Optional filter by node type

        Returns:
            Dictionary mapping node types to list of available files
        """
        result = {}

        nodes_to_check = (
            [node_type] if node_type
            else list(set(self.SUPPORTED_NODES.values()))
        )

        for node in nodes_to_check:
            node_dir = self.prompts_dir / node
            if node_dir.exists():
                files = [f.name for f in node_dir.glob("*.md")]
                if files:
                    result[node] = sorted(files)

        return result

    def validate_prompt_integrity(
        self,
        node_type: str,
        version: str = "v1"
    ) -> Dict[str, Any]:
        """
        Validate prompt file integrity.

        Useful for compliance checks to ensure prompts haven't been
        modified unexpectedly.

        Args:
            node_type: The type of node
            version: Prompt version

        Returns:
            Dictionary with validation results
        """
        try:
            prompt, metadata = self.load_prompt(node_type, version, use_cache=False)

            # Recalculate checksum
            calculated_checksum = hashlib.sha256(prompt.encode()).hexdigest()[:16]

            return {
                "valid": True,
                "node_type": node_type,
                "version": version,
                "metadata_version": metadata.version,
                "checksum": calculated_checksum,
                "checksum_match": calculated_checksum == metadata.checksum,
                "file_exists": True,
            }
        except FileNotFoundError:
            return {
                "valid": False,
                "node_type": node_type,
                "version": version,
                "error": "File not found",
                "file_exists": False,
            }
        except Exception as e:
            return {
                "valid": False,
                "node_type": node_type,
                "version": version,
                "error": str(e),
            }


# Module-level singleton instance
_prompt_loader: Optional[PromptLoader] = None


def get_prompt_loader() -> PromptLoader:
    """
    Get the global PromptLoader instance.

    Returns:
        The singleton PromptLoader instance
    """
    global _prompt_loader
    if _prompt_loader is None:
        _prompt_loader = PromptLoader()
    return _prompt_loader


def load_prompt(
    node_type: str,
    version: str = "v1"
) -> tuple[str, PromptMetadata]:
    """
    Convenience function to load a prompt.

    Args:
        node_type: The type of node
        version: Prompt version

    Returns:
        Tuple of (prompt_content, metadata)
    """
    return get_prompt_loader().load_prompt(node_type, version)


def get_context_prompt(
    node_type: str,
    context: str
) -> Optional[str]:
    """
    Convenience function to get a context prompt.

    Args:
        node_type: The type of node
        context: The industry context

    Returns:
        Context prompt content or None
    """
    return get_prompt_loader().get_context_prompt(node_type, context)


def build_full_prompt(
    node_type: str,
    version: str = "v1",
    context: Optional[str] = None,
    user_config: Optional[Dict[str, Any]] = None,
    execution_id: Optional[str] = None,
    provider: Optional[str] = None
) -> Dict[str, Any]:
    """
    Convenience function to build a complete prompt.

    Args:
        node_type: The type of node
        version: Prompt version
        context: Optional industry context
        user_config: User configuration
        execution_id: Optional execution ID
        provider: LLM provider

    Returns:
        Dictionary with prompt data and metadata
    """
    return get_prompt_loader().build_full_prompt(
        node_type=node_type,
        version=version,
        context=context,
        user_config=user_config,
        execution_id=execution_id,
        provider=provider
    )
