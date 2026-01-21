"""
DSL Validator
"""

from typing import Dict, List, Set, Optional
from skuldbot.dsl.models import BotDefinition, NodeDefinition


class ValidationError(Exception):
    """DSL validation error"""

    def __init__(self, message: str, errors: Optional[List[str]] = None):
        super().__init__(message)
        self.errors = errors or []


class DSLValidator:
    """Advanced DSL validator"""

    # AI configuration node types (sub-nodes that provide config to other nodes)
    AI_CONFIG_NODES = {"ai.model", "ai.embeddings"}

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
        self._validate_node_references(bot)
        self._validate_no_cycles(bot)
        self._validate_reachability(bot)
        self._validate_ai_configurations(bot)

        if self.errors:
            raise ValidationError("Validation errors found", self.errors)

        return bot

    def get_warnings(self) -> List[str]:
        """Returns warnings from the last validation"""
        return self.warnings

    def _validate_node_references(self, bot: BotDefinition) -> None:
        """Validates that all node references exist"""
        node_ids = {node.id for node in bot.nodes}
        # "END" is a special value that terminates the flow (implicit termination)
        node_ids.add("END")

        for node in bot.nodes:
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
            if node:
                # Explorar ambas salidas
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
            if node:
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
                if node and node.type in self.AI_CONFIG_NODES:
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

