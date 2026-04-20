"""
DSL Validator
"""

import re
from typing import Any, Dict, List, Set, Optional
from skuldbot.dsl.models import BotDefinition, NodeDefinition


class ValidationError(Exception):
    """DSL validation error"""

    def __init__(self, message: str, errors: Optional[List[str]] = None):
        super().__init__(message)
        self.errors = errors or []


class DSLValidator:
    """Advanced DSL validator"""

    # Configuration node types (sub-nodes that provide config to other nodes)
    # These nodes don't participate in execution flow, they provide configuration
    # via visual connections (e.g., AI Model -> AI Agent, MS365 Connection -> Email Trigger)
    CONFIG_NODES = {
        # AI config nodes (provide model/embeddings to agents, not in execution flow)
        "ai.model", "ai.embeddings",
        # Service connection nodes (provide credentials via connection handle)
        "ms365.connection", "storage.provider",
        # Vector DB config nodes (provide memory/embeddings config)
        "vectordb.memory", "vectordb.configure_embeddings",
        # Vault provider nodes (provide secrets to TOTP/Get Secret via vault handle)
        "secrets.orchestrator_vault", "secrets.azure_keyvault", "secrets.aws_secrets",
        "secrets.gcp_secret_manager", "secrets.hashicorp_vault", "secrets.local_vault",
    }
    # Fields that normally carry credentials/secrets and must not be plaintext in DSL.
    SENSITIVE_EXACT_KEYS = {
        "password",
        "passphrase",
        "api_key",
        "apikey",
        "client_secret",
        "secret_key",
        "secret_access_key",
        "aws_secret_key",
        "aws_access_key",
        "access_key_id",
        "access_token",
        "refresh_token",
        "token",
        "auth_token",
        "private_key",
        "service_account_json",
        "credentials_json",
        "connection_string",
        "account_key",
        "sas_token",
        "security_token",
        "azure_speech_key",
        "auth_value",
    }
    # Keys that contain the word "secret" but are not secret values.
    NON_SECRET_KEYS = {
        "secrets",
        "secret_name",
        "secret_names",
        "secrets_path",
    }

    def __init__(self):
        self.errors: List[str] = []
        self.warnings: List[str] = []

    def validate(self, dsl_dict: Dict) -> BotDefinition:
        """
        Validates a DSL dictionary and returns a BotDefinition

        Args:
            dsl_dict: Dictionary with the bot definition

        Returns:
            Validated BotDefinition

        Raises:
            ValidationError: If there are validation errors
        """
        self.errors = []
        self.warnings = []

        try:
            # Pydantic validation
            bot = BotDefinition(**dsl_dict)
        except Exception as e:
            raise ValidationError(f"Schema error: {str(e)}")

        # Additional validations
        self._validate_unique_node_labels(bot)
        self._validate_node_references(bot)
        self._validate_no_cycles(bot)
        self._validate_reachability(bot)
        self._validate_ai_configurations(bot)
        self._validate_secret_references(bot)

        if self.errors:
            raise ValidationError("Validation errors found", self.errors)

        return bot

    def get_warnings(self) -> List[str]:
        """Returns warnings from the last validation"""
        return self.warnings

    def _validate_unique_node_labels(self, bot: BotDefinition) -> None:
        """Validates that node labels are unique (case-insensitive)."""
        labels: Dict[str, Dict[str, List[str] | str]] = {}

        for node in bot.nodes:
            if not node.label:
                continue
            normalized = node.label.strip().lower()
            if not normalized:
                continue
            if normalized not in labels:
                labels[normalized] = {"label": node.label.strip(), "node_ids": []}
            labels[normalized]["node_ids"].append(node.id)

        for entry in labels.values():
            display_label = entry["label"]
            node_ids = entry["node_ids"]
            if len(node_ids) <= 1:
                continue
            self.errors.append(
                "Duplicate node label "
                f"'{display_label}' in nodes {', '.join(node_ids)}. "
                "Node labels must be unique to avoid ambiguous variable references."
            )

    def _validate_node_references(self, bot: BotDefinition) -> None:
        """Validates that all node references exist"""
        node_ids = {node.id for node in bot.nodes}
        # "END" is a special value that terminates the flow (implicit termination)
        node_ids.add("END")

        for node in bot.nodes:
            # Skip validation for config nodes (they don't have outputs)
            if node.type in self.CONFIG_NODES:
                continue

            # Skip if node has no outputs (config nodes)
            if node.outputs is None:
                continue

            # Validate output success
            if node.outputs.success not in node_ids:
                self.errors.append(
                    f"Node '{node.id}': output.success '{node.outputs.success}' does not exist"
                )

            # Validate output error
            if node.outputs.error not in node_ids:
                self.errors.append(
                    f"Node '{node.id}': output.error '{node.outputs.error}' does not exist"
                )

    def _validate_no_cycles(self, bot: BotDefinition) -> None:
        """Detects infinite cycles in the flow"""
        start_node = bot.get_start_node()
        if not start_node:
            return

        visited: Set[str] = set()
        path: List[str] = []

        def dfs(node_id: str) -> bool:
            # "END" is a terminal node, no need to explore further
            if node_id == "END":
                return False

            if node_id in path:
                cycle = " -> ".join(path[path.index(node_id) :] + [node_id])
                self.errors.append(f"Cycle detected: {cycle}")
                return True

            if node_id in visited:
                return False

            visited.add(node_id)
            path.append(node_id)

            node = bot.get_node(node_id)
            if node and node.outputs:
                # Explorar ambas salidas (skip config nodes that have no outputs)
                if node.outputs.success != node_id:  # Evitar self-loop inmediato
                    dfs(node.outputs.success)

                if node.outputs.error != node_id:
                    dfs(node.outputs.error)

            path.pop()
            return False

        dfs(start_node.id)

    def _validate_reachability(self, bot: BotDefinition) -> None:
        """Validates that all nodes are reachable from start or triggers"""
        # Get all entry points: start_node and triggers
        entry_points: Set[str] = set()

        # Add start_node if exists
        start_node = bot.get_start_node()
        if start_node:
            entry_points.add(start_node.id)

        # Add triggers as entry points
        if bot.triggers:
            for trigger_id in bot.triggers:
                if bot.get_node(trigger_id):
                    entry_points.add(trigger_id)

        if not entry_points:
            self.errors.append("No start node or triggers defined")
            return

        reachable: Set[str] = set()

        def visit(node_id: str) -> None:
            # "END" is a terminal node, not a real node
            if node_id == "END":
                return

            if node_id in reachable:
                return

            reachable.add(node_id)
            node = bot.get_node(node_id)
            if node and node.outputs:
                visit(node.outputs.success)
                visit(node.outputs.error)

        # Visitar desde todos los puntos de entrada
        for entry_id in entry_points:
            visit(entry_id)

        # Report unreachable nodes (excluding config nodes like ai.model, ai.embeddings)
        all_nodes = {node.id for node in bot.nodes}
        unreachable = all_nodes - reachable

        if unreachable:
            for node_id in unreachable:
                # Get node type to check if it's a config node
                node = bot.get_node(node_id)
                if node and node.type in self.CONFIG_NODES:
                    # Config nodes don't participate in execution flow,
                    # they provide configuration via visual connections
                    continue
                self.errors.append(f"Node '{node_id}' is not reachable from the start")

    def _validate_ai_configurations(self, bot: BotDefinition) -> None:
        """
        Validates AI-related node configurations:
        - AI Agent must have a model_config (Chat Model connected)
        - Model configurations should have required fields
        - Embeddings configurations should be valid
        """
        for node in bot.nodes:
            # Skip non-AI nodes
            if not node.type.startswith("ai."):
                continue

            # Validate AI Agent nodes
            if node.type == "ai.agent":
                node_label = node.label or node.id

                # Check if model_config is connected
                if not node.model_config_:
                    self.errors.append(
                        f"AI Agent '{node_label}' does not have an AI Model connected. "
                        "Connect an 'AI Model' node to the 'model' port of the AI Agent."
                    )
                else:
                    # Validate model configuration
                    model_config = node.model_config_
                    provider = model_config.provider

                    # Check for API key based on provider
                    providers_requiring_api_key = ["openai", "anthropic", "groq", "mistral", "cohere"]
                    if provider in providers_requiring_api_key:
                        if not model_config.api_key:
                            self.warnings.append(
                                f"AI Agent '{node_label}': AI Model ({provider}) does not have API key configured. "
                                "Make sure to configure the API key before running."
                            )

                    # Azure-specific validation
                    if provider == "azure":
                        if not model_config.base_url:
                            self.warnings.append(
                                f"AI Agent '{node_label}': Azure AI Foundry requires endpoint (base_url)."
                            )
                        if not model_config.api_version:
                            self.warnings.append(
                                f"AI Agent '{node_label}': Azure AI Foundry requires api_version."
                            )

                    # AWS Bedrock validation
                    if provider == "aws":
                        if not model_config.region:
                            self.warnings.append(
                                f"AI Agent '{node_label}': AWS Bedrock requires region configured."
                            )

                # Check embeddings config if memory is connected
                if node.memory and node.memory.memory_type in ["retrieve", "both"]:
                    if not node.embeddings:
                        self.warnings.append(
                            f"AI Agent '{node_label}' has memory connected but no "
                            "Embeddings configured. Connect an 'Embeddings' node to enable "
                            "semantic search in memory."
                        )

            # Validate Chat Model nodes (ai.model)
            elif node.type == "ai.model":
                node_label = node.label or node.id
                config = node.config

                provider = config.get("provider", "openai")

                # Validate model is specified
                if not config.get("model"):
                    self.warnings.append(
                        f"Chat Model '{node_label}': No model specified, "
                        "the provider's default model will be used."
                    )

                # Validate provider-specific requirements
                if provider == "ollama" and not config.get("base_url"):
                    self.warnings.append(
                        f"Chat Model '{node_label}': Ollama requires base_url (e.g., http://localhost:11434)."
                    )

            # Validate Embeddings nodes (ai.embeddings)
            elif node.type == "ai.embeddings":
                node_label = node.label or node.id
                config = node.config

                provider = config.get("provider", "openai")

                if provider == "ollama" and not config.get("base_url"):
                    self.warnings.append(
                        f"Embeddings '{node_label}': Ollama requires base_url."
                    )

    def _is_sensitive_key(self, key: str) -> bool:
        """Returns True if a config key is likely to contain credentials/secrets."""
        # Normalize camelCase/PascalCase to snake_case first (apiKey -> api_key).
        normalized = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", key).strip().lower()
        if not normalized or normalized in self.NON_SECRET_KEYS:
            return False
        if normalized in self.SENSITIVE_EXACT_KEYS:
            return True

        # Common suffixes for secret values.
        return normalized.endswith((
            "_password",
            "_passphrase",
            "_api_key",
            "_client_secret",
            "_secret_key",
            "_secret",
            "_token",
            "_private_key",
        ))

    @staticmethod
    def _is_secure_secret_reference(value: str) -> bool:
        """
        Returns True when the value appears to be a runtime reference
        (vault/env/variable expression) instead of plaintext.
        """
        if not isinstance(value, str):
            return False

        candidate = value.strip()
        if not candidate:
            return False

        # Canonical references.
        if "${vault." in candidate or "${env." in candidate:
            return True
        # n8n-style authoring references may still exist in some payloads.
        if "{{$vault." in candidate or "{{$env." in candidate:
            return True
        # Legacy variable expressions (e.g. ${OPENAI_API_KEY}) are runtime-bound.
        if re.fullmatch(r"\$\{[^}]+\}", candidate):
            return True
        if re.fullmatch(r"\{\{[^}]+\}\}", candidate):
            return True

        return False

    def _scan_plaintext_secrets(
        self,
        payload: Any,
        context_label: str,
        path_prefix: str = "",
    ) -> None:
        """
        Recursively scans dictionaries/lists and emits validation errors
        when sensitive fields contain plaintext values.
        """
        if isinstance(payload, dict):
            for key, value in payload.items():
                if not isinstance(key, str):
                    continue

                current_path = f"{path_prefix}.{key}" if path_prefix else key

                # Recurse first so nested issues are reported with full path.
                if isinstance(value, (dict, list)):
                    self._scan_plaintext_secrets(value, context_label, current_path)

                if not self._is_sensitive_key(key):
                    continue

                # Empty values are handled by required-field validation.
                if value is None:
                    continue
                if isinstance(value, str) and not value.strip():
                    continue

                if isinstance(value, str) and self._is_secure_secret_reference(value):
                    continue

                self.errors.append(
                    f"{context_label}: sensitive field '{current_path}' contains plaintext data. "
                    "Use a secure runtime reference like ${vault.secret_name} or ${env.SECRET_NAME}."
                )

        elif isinstance(payload, list):
            for idx, item in enumerate(payload):
                current_path = f"{path_prefix}[{idx}]"
                if isinstance(item, (dict, list)):
                    self._scan_plaintext_secrets(item, context_label, current_path)

    def _validate_secret_references(self, bot: BotDefinition) -> None:
        """
        Enforces that sensitive fields in node configs are passed by secure
        references (vault/env/variables), not plaintext.
        """
        for node in bot.nodes:
            node_label = node.label or node.id

            if node.config:
                self._scan_plaintext_secrets(
                    node.config,
                    context_label=f"Node '{node_label}'",
                )

            if node.model_config_:
                self._scan_plaintext_secrets(
                    node.model_config_.model_dump(exclude_none=True),
                    context_label=f"AI model config for node '{node_label}'",
                    path_prefix="model_config_",
                )

            if node.embeddings:
                self._scan_plaintext_secrets(
                    node.embeddings.model_dump(exclude_none=True),
                    context_label=f"Embeddings config for node '{node_label}'",
                    path_prefix="embeddings",
                )

            if node.memory:
                self._scan_plaintext_secrets(
                    node.memory.model_dump(exclude_none=True),
                    context_label=f"Memory config for node '{node_label}'",
                    path_prefix="memory",
                )

            if node.connection_config:
                self._scan_plaintext_secrets(
                    node.connection_config,
                    context_label=f"Connection config for node '{node_label}'",
                    path_prefix="connection_config",
                )
