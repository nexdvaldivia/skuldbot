"""
Librería SkuldAI para nodos de Inteligencia Artificial (Robot Framework)

Proporciona keywords para integración con LLMs y servicios de IA.
Soporta múltiples proveedores: OpenAI, Anthropic, Azure OpenAI, local (Ollama).

Prompt Management:
    This library uses versioned prompts from skuldbot.ai.prompt_loader.
    Prompts are stored as .md files in engine/skuldbot/ai/prompts/
    and loaded at runtime for auditability and compliance.

Provider Recommendations:
    - Healthcare (HIPAA): Azure OpenAI or Ollama (on-premise)
    - Finance (SOX/PCI): Azure OpenAI or Ollama
    - Insurance: Azure OpenAI or Ollama
    - General: Any provider
"""

import json
import base64
import uuid
from typing import Any, Dict, List, Optional, Union
from dataclasses import dataclass, field
from enum import Enum
from robot.api.deco import keyword, library
from robot.api import logger

# Import versioned prompt loader
try:
    from skuldbot.ai import PromptLoader, build_full_prompt, get_prompt_loader
    PROMPT_LOADER_AVAILABLE = True
except ImportError:
    PROMPT_LOADER_AVAILABLE = False
    PromptLoader = None


class AIProvider(Enum):
    """Proveedores de IA soportados"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    AZURE_OPENAI = "azure_openai"
    AZURE = "azure"  # Alias for Azure AI Foundry
    OLLAMA = "ollama"
    GOOGLE = "google"  # Google Gemini
    AWS = "aws"  # AWS Bedrock
    GROQ = "groq"  # Groq (fast inference)
    MISTRAL = "mistral"  # Mistral AI
    CUSTOM = "custom"


@dataclass
class AIConfig:
    """Configuración del proveedor de IA"""
    provider: AIProvider
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: str = "gpt-4"
    temperature: float = 0.7
    max_tokens: int = 2000
    timeout: int = 60
    extra_params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AIResponse:
    """Respuesta estructurada de IA"""
    content: str
    model: str
    provider: str
    tokens_used: int = 0
    finish_reason: str = "complete"
    metadata: Dict[str, Any] = field(default_factory=dict)


@library(scope="GLOBAL", auto_keywords=True)
class SkuldAI:
    """
    Librería de Inteligencia Artificial para Skuldbot.

    Proporciona keywords para:
    - Prompts a LLMs
    - Agentes conversacionales
    - Extracción de datos
    - Resumen de texto
    - Clasificación
    - Traducción
    - Análisis de sentimiento
    - Visión (análisis de imágenes)
    - Embeddings

    Soporta múltiples proveedores: OpenAI, Anthropic, Azure, Ollama.
    """

    ROBOT_LIBRARY_SCOPE = "GLOBAL"
    ROBOT_LIBRARY_DOC_FORMAT = "ROBOT"

    def __init__(self):
        self._config: Optional[AIConfig] = None
        self._client: Any = None
        self._conversation_history: List[Dict[str, str]] = []
        self._embeddings_cache: Dict[str, List[float]] = {}

    # =========================================================================
    # CONFIGURACIÓN
    # =========================================================================

    @keyword("Configure AI Provider")
    def configure_ai_provider(
        self,
        provider: str = "openai",
        api_key: Optional[str] = None,
        model: str = "gpt-4",
        base_url: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000,
        **kwargs
    ):
        """
        Configura el proveedor de IA a usar.

        Args:
            provider: Proveedor (openai, anthropic, azure_openai, ollama)
            api_key: API key (puede venir de vault)
            model: Modelo a usar
            base_url: URL base (para Azure u Ollama)
            temperature: Temperatura de generación (0-1)
            max_tokens: Máximo de tokens en respuesta
            **kwargs: Parámetros adicionales del proveedor

        Example:
            | Configure AI Provider | openai | ${api_key} | gpt-4 |
            | Configure AI Provider | anthropic | ${api_key} | claude-3-opus-20240229 |
            | Configure AI Provider | ollama | | llama2 | base_url=http://localhost:11434 |
        """
        try:
            provider_enum = AIProvider(provider.lower())
        except ValueError:
            provider_enum = AIProvider.CUSTOM

        self._config = AIConfig(
            provider=provider_enum,
            api_key=api_key,
            base_url=base_url,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            extra_params=kwargs
        )

        # Inicializar cliente según proveedor
        self._init_client()

        logger.info(f"AI Provider configured: {provider} with model {model}")

    def _init_client(self):
        """Inicializa el cliente del proveedor de IA"""
        if not self._config:
            raise ValueError("AI provider not configured")

        provider = self._config.provider

        if provider == AIProvider.OPENAI:
            try:
                from openai import OpenAI
                self._client = OpenAI(
                    api_key=self._config.api_key,
                    base_url=self._config.base_url
                )
            except ImportError:
                logger.warn("openai package not installed. Install with: pip install openai")
                self._client = None

        elif provider == AIProvider.ANTHROPIC:
            try:
                import anthropic
                self._client = anthropic.Anthropic(api_key=self._config.api_key)
            except ImportError:
                logger.warn("anthropic package not installed. Install with: pip install anthropic")
                self._client = None

        elif provider in (AIProvider.AZURE_OPENAI, AIProvider.AZURE):
            try:
                from openai import AzureOpenAI
                self._client = AzureOpenAI(
                    api_key=self._config.api_key,
                    azure_endpoint=self._config.base_url,
                    api_version=self._config.extra_params.get("api_version", "2024-10-01-preview")
                )
            except ImportError:
                logger.warn("openai package not installed. Install with: pip install openai")
                self._client = None

        elif provider == AIProvider.OLLAMA:
            # Ollama usa la API de OpenAI compatible
            try:
                from openai import OpenAI
                self._client = OpenAI(
                    api_key="ollama",  # Ollama no requiere API key
                    base_url=self._config.base_url or "http://localhost:11434/v1"
                )
            except ImportError:
                logger.warn("openai package not installed for Ollama. Install with: pip install openai")
                self._client = None

        elif provider == AIProvider.GOOGLE:
            # Google Gemini via google-generativeai
            try:
                import google.generativeai as genai
                genai.configure(api_key=self._config.api_key)
                self._client = genai.GenerativeModel(self._config.model)
            except ImportError:
                logger.warn("google-generativeai package not installed. Install with: pip install google-generativeai")
                self._client = None

        elif provider == AIProvider.AWS:
            # AWS Bedrock via boto3
            try:
                import boto3
                self._client = boto3.client(
                    "bedrock-runtime",
                    aws_access_key_id=self._config.extra_params.get("aws_access_key"),
                    aws_secret_access_key=self._config.extra_params.get("aws_secret_key"),
                    region_name=self._config.extra_params.get("region", "us-east-1"),
                )
            except ImportError:
                logger.warn("boto3 package not installed. Install with: pip install boto3")
                self._client = None

        elif provider == AIProvider.GROQ:
            # Groq via OpenAI-compatible API
            try:
                from openai import OpenAI
                self._client = OpenAI(
                    api_key=self._config.api_key,
                    base_url="https://api.groq.com/openai/v1"
                )
            except ImportError:
                logger.warn("openai package not installed for Groq. Install with: pip install openai")
                self._client = None

        elif provider == AIProvider.MISTRAL:
            # Mistral via OpenAI-compatible API
            try:
                from openai import OpenAI
                self._client = OpenAI(
                    api_key=self._config.api_key,
                    base_url="https://api.mistral.ai/v1"
                )
            except ImportError:
                logger.warn("openai package not installed for Mistral. Install with: pip install openai")
                self._client = None

    # =========================================================================
    # LLM PROMPT
    # =========================================================================

    @keyword("Send LLM Prompt")
    def send_llm_prompt(
        self,
        prompt: str,
        system_message: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        json_mode: bool = False
    ) -> str:
        """
        Envía un prompt al LLM y obtiene respuesta.

        Args:
            prompt: El prompt a enviar
            system_message: Mensaje de sistema opcional
            temperature: Override de temperatura
            max_tokens: Override de max tokens
            json_mode: Si True, fuerza respuesta en JSON

        Returns:
            Respuesta del modelo como string

        Example:
            | ${response}= | Send LLM Prompt | Explain RPA in one sentence |
            | ${json}= | Send LLM Prompt | List 3 colors as JSON array | json_mode=True |
        """
        self._ensure_configured()

        messages = []
        if system_message:
            messages.append({"role": "system", "content": system_message})
        messages.append({"role": "user", "content": prompt})

        response = self._call_llm(
            messages,
            temperature=temperature,
            max_tokens=max_tokens,
            json_mode=json_mode
        )

        logger.info(f"LLM response received ({len(response)} chars)")
        return response

    @keyword("Send LLM Prompt With Context")
    def send_llm_prompt_with_context(
        self,
        prompt: str,
        context: str,
        system_message: Optional[str] = None
    ) -> str:
        """
        Envía un prompt con contexto adicional.

        Args:
            prompt: El prompt principal
            context: Contexto adicional (documento, datos, etc.)
            system_message: Mensaje de sistema opcional

        Returns:
            Respuesta del modelo

        Example:
            | ${summary}= | Send LLM Prompt With Context | Summarize this | ${document_text} |
        """
        full_prompt = f"Context:\n{context}\n\n---\n\nTask: {prompt}"
        return self.send_llm_prompt(full_prompt, system_message)

    # =========================================================================
    # AI AGENT (Conversacional)
    # =========================================================================

    @keyword("Start AI Agent Session")
    def start_ai_agent_session(
        self,
        system_prompt: str,
        agent_name: str = "Assistant"
    ):
        """
        Inicia una sesión de agente conversacional.

        Args:
            system_prompt: Prompt de sistema que define el comportamiento
            agent_name: Nombre del agente

        Example:
            | Start AI Agent Session | You are a helpful customer service agent | ServiceBot |
        """
        self._ensure_configured()
        self._conversation_history = [
            {"role": "system", "content": system_prompt}
        ]
        logger.info(f"AI Agent session started: {agent_name}")

    @keyword("Send Agent Message")
    def send_agent_message(self, message: str) -> str:
        """
        Envía un mensaje al agente y obtiene respuesta.

        Args:
            message: Mensaje del usuario

        Returns:
            Respuesta del agente

        Example:
            | ${response}= | Send Agent Message | I need help with my order |
        """
        self._ensure_configured()

        if not self._conversation_history:
            self.start_ai_agent_session("You are a helpful assistant.")

        self._conversation_history.append({"role": "user", "content": message})

        response = self._call_llm(self._conversation_history)

        self._conversation_history.append({"role": "assistant", "content": response})

        return response

    @keyword("Get Agent Conversation History")
    def get_agent_conversation_history(self) -> List[Dict[str, str]]:
        """
        Obtiene el historial de conversación del agente.

        Returns:
            Lista de mensajes {role, content}

        Example:
            | ${history}= | Get Agent Conversation History |
        """
        return self._conversation_history.copy()

    @keyword("Clear Agent Session")
    def clear_agent_session(self):
        """
        Limpia la sesión del agente.

        Example:
            | Clear Agent Session |
        """
        self._conversation_history = []
        logger.info("AI Agent session cleared")

    # =========================================================================
    # AI AGENT WITH TOOLS (ReAct Pattern)
    # =========================================================================

    @keyword("Run Agent With Tools")
    def run_agent_with_tools(
        self,
        goal: str,
        tools: List[Dict[str, Any]],
        system_prompt: Optional[str] = None,
        max_iterations: int = 10,
        agent_name: str = "Agent",
        memory_config: Optional[Dict[str, Any]] = None,
        embeddings_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Ejecuta un agente ReAct (Reason + Act) que puede usar herramientas y memoria vectorial.

        El agente sigue un loop iterativo:
        1. Observar el estado actual
        2. Razonar sobre qué hacer
        3. Decidir si usar una herramienta o dar respuesta final
        4. Si usa herramienta: ejecutar y observar resultado
        5. Repetir hasta completar o alcanzar max_iterations

        Cuando memory_config está presente, el agente automáticamente:
        - Recupera contexto relevante (RAG) antes de cada respuesta
        - Almacena interacciones importantes en la memoria

        Args:
            goal: El objetivo/tarea que el agente debe cumplir
            tools: Lista de herramientas disponibles, cada una con:
                   - name: Nombre de la herramienta
                   - description: Descripción para el LLM
                   - node_id: ID del nodo a ejecutar
                   - input_mapping: Mapeo de parámetros
            system_prompt: Prompt de sistema personalizado
            max_iterations: Máximo de iteraciones del loop
            agent_name: Nombre del agente
            memory_config: Configuración de memoria vectorial (opcional):
                   - provider: Proveedor (chroma, pgvector, pinecone, qdrant, supabase)
                   - collection: Nombre de la colección
                   - memory_type: Tipo (retrieve, store, both)
                   - top_k: Número de documentos a recuperar
                   - min_score: Score mínimo para recuperación
                   - connection_params: Parámetros de conexión del proveedor
            embeddings_config: Configuración de embeddings conectada visualmente (opcional):
                   - provider: Proveedor (openai, azure, ollama, cohere, huggingface, google, aws)
                   - model: Modelo de embeddings
                   - dimension: Dimensión del vector
                   - api_key: API key del proveedor
                   - base_url: URL base (para Azure, Ollama, HuggingFace)
                   - Y otros parámetros específicos del proveedor

        Returns:
            Diccionario con:
            - result: Respuesta final del agente
            - tool_calls: Lista de herramientas llamadas
            - iterations: Número de iteraciones
            - reasoning_trace: Traza de razonamiento paso a paso
            - status: "completed", "max_iterations_reached", "error"
            - memory_retrievals: Contexto RAG recuperado (si memory_config presente)

        Example:
            | ${tools}= | Create List | ${tool1} | ${tool2} |
            | ${result}= | Run Agent With Tools | Extract invoice data | ${tools} |
            | # With memory: |
            | ${memory}= | Create Dictionary | provider=chroma | collection=docs | memory_type=both |
            | ${result}= | Run Agent With Tools | Answer questions | ${tools} | memory_config=${memory} |
            | # With embeddings: |
            | ${emb}= | Create Dictionary | provider=openai | model=text-embedding-3-small | api_key=${key} |
            | ${result}= | Run Agent With Tools | Answer questions | ${tools} | memory_config=${memory} | embeddings_config=${emb} |
        """
        self._ensure_configured()

        # Initialize memory if configured
        rag_context = ""
        memory_retrievals = []
        vectordb = None

        if memory_config:
            try:
                # Import and initialize vectordb
                from skuldbot.libs.vectordb import SkuldVectorDB
                vectordb = SkuldVectorDB()

                # Configure embeddings provider if embeddings_config is provided
                if embeddings_config:
                    emb_provider = embeddings_config.get("provider", "openai")
                    emb_model = embeddings_config.get("model", "text-embedding-3-small")
                    emb_api_key = embeddings_config.get("api_key")
                    emb_base_url = embeddings_config.get("base_url")
                    emb_dimension = embeddings_config.get("dimension", 1536)

                    vectordb.configure_embeddings_provider(
                        provider=emb_provider,
                        api_key=emb_api_key,
                        model=emb_model,
                        base_url=emb_base_url,
                        dimension=emb_dimension,
                    )
                    logger.info(f"Embeddings configured: {emb_provider} / {emb_model}")

                # Get connection params
                provider = memory_config.get("provider", "chroma")
                collection = memory_config.get("collection", "agent_memory")
                connection_params = memory_config.get("connection_params", {})

                # Initialize vector memory
                vectordb.initialize_vector_memory(
                    provider=provider,
                    collection=collection,
                    memory_type=memory_config.get("memory_type", "both"),
                    **connection_params
                )

                # Retrieve relevant context for the goal (RAG)
                top_k = memory_config.get("top_k", 5)
                min_score = memory_config.get("min_score", 0.5)

                rag_result = vectordb.build_rag_context(
                    query=goal,
                    top_k=top_k,
                    min_score=min_score
                )

                rag_context = rag_result.get("context", "")
                memory_retrievals = rag_result.get("sources", [])

                if rag_context:
                    logger.info(f"RAG context retrieved: {len(memory_retrievals)} sources")

            except Exception as e:
                logger.warn(f"Failed to initialize memory, continuing without RAG: {e}")
                vectordb = None

        # Build tool descriptions for the system prompt
        tools_description = self._build_tools_description(tools)

        # Build RAG context section if available
        rag_section = ""
        if rag_context:
            rag_section = f"""
RELEVANT CONTEXT (from knowledge base):
{rag_context}

Use this context to inform your responses when relevant. If the context doesn't contain useful information for the current task, you may ignore it.

---

"""

        # Default system prompt if not provided
        if not system_prompt:
            system_prompt = f"""You are {agent_name}, an autonomous AI agent that can use tools to accomplish tasks.

You follow the ReAct (Reason + Act) pattern:
1. THINK: Analyze the current situation and what needs to be done
2. ACT: Either use a tool or provide a final answer
{rag_section}
AVAILABLE TOOLS:
{tools_description}

RESPONSE FORMAT:
You must respond with a JSON object in one of these formats:

When you need to use a tool:
{{
  "thought": "Your reasoning about what to do next",
  "action": "tool_name",
  "action_input": {{ "param1": "value1", "param2": "value2" }}
}}

When you have the final answer:
{{
  "thought": "Your reasoning about why you're done",
  "action": "final_answer",
  "action_input": {{ "answer": "Your complete final answer here" }}
}}

IMPORTANT RULES:
- Always respond with valid JSON only, no other text
- Think step by step before acting
- Use tools when you need external information or to perform actions
- Only use final_answer when you have completed the task or have enough information
- If a tool fails, reason about what to try next"""
        else:
            # If custom system prompt, prepend RAG context
            if rag_context:
                system_prompt = f"""{rag_section}
{system_prompt}"""

        # Initialize conversation
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Task: {goal}"}
        ]

        # Tracking variables
        tool_calls = []
        reasoning_trace = []
        iteration = 0
        status = "running"
        final_result = None

        logger.info(f"ReAct Agent '{agent_name}' starting with goal: {goal}")

        while iteration < max_iterations and status == "running":
            iteration += 1
            logger.info(f"ReAct iteration {iteration}/{max_iterations}")

            # Get LLM response
            try:
                response = self._call_llm(messages, json_mode=True)
                action_data = self._parse_agent_response(response)
            except Exception as e:
                logger.error(f"Failed to get/parse agent response: {e}")
                reasoning_trace.append({
                    "iteration": iteration,
                    "error": str(e),
                    "raw_response": response if 'response' in dir() else None
                })
                status = "error"
                final_result = f"Agent error: {str(e)}"
                break

            thought = action_data.get("thought", "")
            action = action_data.get("action", "")
            action_input = action_data.get("action_input", {})

            # Record reasoning step
            step = {
                "iteration": iteration,
                "thought": thought,
                "action": action,
                "action_input": action_input
            }

            if action == "final_answer":
                # Agent is done
                final_result = action_input.get("answer", str(action_input))
                step["result"] = "TASK COMPLETED"
                reasoning_trace.append(step)
                status = "completed"
                logger.info(f"ReAct Agent completed after {iteration} iterations")

            elif action in [t["name"] for t in tools]:
                # Execute the tool
                tool = next(t for t in tools if t["name"] == action)
                logger.info(f"Executing tool: {action}")

                try:
                    # The tool execution will be done by the calling code
                    # We return a placeholder that signals tool execution needed
                    tool_call = {
                        "tool_name": action,
                        "tool_node_id": tool.get("node_id"),
                        "input": action_input,
                        "iteration": iteration
                    }
                    tool_calls.append(tool_call)

                    # For now, we simulate tool execution by adding observation
                    # In production, this would be replaced by actual tool execution
                    observation = f"[Tool '{action}' execution pending - integrate with bot runner]"
                    step["observation"] = observation

                    # Add tool result to conversation
                    messages.append({
                        "role": "assistant",
                        "content": response
                    })
                    messages.append({
                        "role": "user",
                        "content": f"Tool result: {observation}"
                    })

                except Exception as e:
                    error_msg = f"Tool execution failed: {str(e)}"
                    logger.error(error_msg)
                    step["error"] = error_msg
                    messages.append({
                        "role": "assistant",
                        "content": response
                    })
                    messages.append({
                        "role": "user",
                        "content": f"Error: {error_msg}. Please try a different approach."
                    })

                reasoning_trace.append(step)

            else:
                # Unknown action
                logger.warn(f"Unknown action: {action}")
                step["error"] = f"Unknown action: {action}"
                reasoning_trace.append(step)
                messages.append({
                    "role": "assistant",
                    "content": response
                })
                messages.append({
                    "role": "user",
                    "content": f"Error: '{action}' is not a valid action. Available actions: {', '.join([t['name'] for t in tools] + ['final_answer'])}"
                })

        # Check if we hit max iterations
        if iteration >= max_iterations and status == "running":
            status = "max_iterations_reached"
            final_result = f"Agent did not complete within {max_iterations} iterations. Last progress: {reasoning_trace[-1].get('thought', 'Unknown')}"
            logger.warn(f"ReAct Agent hit max iterations ({max_iterations})")

        # Store interaction in memory if configured (memory_type = "store" or "both")
        memory_stored = False
        if vectordb and memory_config and status == "completed":
            memory_type = memory_config.get("memory_type", "both")
            if memory_type in ["store", "both"]:
                try:
                    # Store the goal and result as a memory entry
                    memory_entry = f"Task: {goal}\n\nResult: {final_result}"
                    vectordb.store_in_memory(
                        content=memory_entry,
                        metadata={
                            "type": "agent_interaction",
                            "agent_name": agent_name,
                            "status": status,
                            "iterations": iteration,
                        }
                    )
                    memory_stored = True
                    logger.info("Agent interaction stored in memory")
                except Exception as e:
                    logger.warn(f"Failed to store interaction in memory: {e}")

        result = {
            "result": final_result,
            "tool_calls": tool_calls,
            "iterations": iteration,
            "reasoning_trace": reasoning_trace,
            "status": status,
            "agent_name": agent_name,
            "goal": goal,
            "memory_retrievals": memory_retrievals,
            "memory_stored": memory_stored,
        }

        logger.info(f"ReAct Agent finished with status: {status}")
        return result

    def _build_tools_description(self, tools: List[Dict[str, Any]]) -> str:
        """Construye la descripción de herramientas para el prompt del agente."""
        if not tools:
            return "No tools available. You can only provide a final_answer."

        descriptions = []
        for tool in tools:
            name = tool.get("name", "unnamed_tool")
            desc = tool.get("description", "No description")
            params = tool.get("input_mapping", {})

            param_str = ""
            if params:
                param_list = [f"  - {k}: {v}" for k, v in params.items()]
                param_str = "\n" + "\n".join(param_list)

            descriptions.append(f"- {name}: {desc}{param_str}")

        return "\n".join(descriptions)

    def _parse_agent_response(self, response: str) -> Dict[str, Any]:
        """Parsea la respuesta JSON del agente."""
        response = response.strip()

        # Clean up response if wrapped in markdown code blocks
        if response.startswith("```"):
            lines = response.split("\n")
            # Remove first and last lines (```json and ```)
            lines = [l for l in lines if not l.strip().startswith("```")]
            response = "\n".join(lines)

        try:
            data = json.loads(response)
            return {
                "thought": data.get("thought", ""),
                "action": data.get("action", ""),
                "action_input": data.get("action_input", {})
            }
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse agent response as JSON: {e}")
            logger.debug(f"Raw response: {response}")
            # Try to extract action from malformed response
            return {
                "thought": "Failed to parse response",
                "action": "final_answer",
                "action_input": {"answer": response, "parse_error": str(e)}
            }

    # =========================================================================
    # EXTRACCIÓN DE DATOS
    # =========================================================================

    @keyword("Extract Data From Text")
    def extract_data_from_text(
        self,
        text: str,
        schema: Dict[str, Any],
        instructions: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extrae datos estructurados de texto usando IA.

        Args:
            text: Texto del cual extraer datos
            schema: Esquema de datos esperado (dict con campos y tipos)
            instructions: Instrucciones adicionales

        Returns:
            Diccionario con datos extraídos

        Example:
            | ${schema}= | Create Dictionary | name=string | email=string | phone=string |
            | ${data}= | Extract Data From Text | ${email_text} | ${schema} |
        """
        self._ensure_configured()

        schema_str = json.dumps(schema, indent=2)

        system_prompt = """You are a data extraction expert. Extract structured data from the given text.
Return ONLY a valid JSON object matching the schema. Do not include explanations."""

        prompt = f"""Extract data from this text according to the schema.

Schema:
{schema_str}

{f"Additional instructions: {instructions}" if instructions else ""}

Text to extract from:
{text}

Return only the JSON object:"""

        response = self.send_llm_prompt(prompt, system_prompt, json_mode=True)

        try:
            # Limpiar respuesta y parsear JSON
            response = response.strip()
            if response.startswith("```"):
                response = response.split("```")[1]
                if response.startswith("json"):
                    response = response[4:]
            return json.loads(response)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse extracted data as JSON: {e}")
            return {"_raw": response, "_error": str(e)}

    @keyword("Extract Table From Text")
    def extract_table_from_text(
        self,
        text: str,
        columns: List[str]
    ) -> List[Dict[str, str]]:
        """
        Extrae datos tabulares de texto.

        Args:
            text: Texto con datos tabulares
            columns: Lista de nombres de columnas esperadas

        Returns:
            Lista de diccionarios (filas)

        Example:
            | ${cols}= | Create List | Name | Price | Quantity |
            | ${table}= | Extract Table From Text | ${invoice_text} | ${cols} |
        """
        schema = {col: "string" for col in columns}

        prompt = f"""Extract tabular data from this text.
Expected columns: {', '.join(columns)}

Text:
{text}

Return a JSON array of objects, each object having these keys: {', '.join(columns)}"""

        response = self.send_llm_prompt(prompt, json_mode=True)

        try:
            response = response.strip()
            if response.startswith("```"):
                response = response.split("```")[1]
                if response.startswith("json"):
                    response = response[4:]
            data = json.loads(response)
            return data if isinstance(data, list) else [data]
        except json.JSONDecodeError:
            return []

    # =========================================================================
    # RESUMEN
    # =========================================================================

    @keyword("Summarize Text")
    def summarize_text(
        self,
        text: str,
        max_length: int = 200,
        style: str = "concise",
        language: Optional[str] = None
    ) -> str:
        """
        Resume un texto usando IA.

        Args:
            text: Texto a resumir
            max_length: Longitud máxima aproximada del resumen
            style: Estilo (concise, detailed, bullet_points)
            language: Idioma del resumen (None = mismo que input)

        Returns:
            Texto resumido

        Example:
            | ${summary}= | Summarize Text | ${long_document} | max_length=100 |
            | ${bullets}= | Summarize Text | ${article} | style=bullet_points |
        """
        style_instructions = {
            "concise": "Write a concise summary.",
            "detailed": "Write a detailed summary covering all main points.",
            "bullet_points": "Summarize as bullet points."
        }

        instruction = style_instructions.get(style, style_instructions["concise"])

        prompt = f"""{instruction}
Maximum length: approximately {max_length} words.
{f"Write the summary in {language}." if language else ""}

Text to summarize:
{text}"""

        return self.send_llm_prompt(prompt)

    # =========================================================================
    # CLASIFICACIÓN
    # =========================================================================

    @keyword("Classify Text")
    def classify_text(
        self,
        text: str,
        categories: List[str],
        multi_label: bool = False,
        include_confidence: bool = False
    ) -> Dict[str, Any]:
        """
        Clasifica texto en categorías predefinidas.

        Args:
            text: Texto a clasificar
            categories: Lista de categorías posibles
            multi_label: Si permite múltiples categorías
            include_confidence: Si incluir scores de confianza

        Returns:
            Dict con: category (str o list), confidence (float), all_scores (dict)

        Example:
            | ${cats}= | Create List | spam | not_spam |
            | ${result}= | Classify Text | ${email_body} | ${cats} |
            | ${category}= | Get From Dictionary | ${result} | category |
        """
        categories_str = ", ".join(categories)

        # Siempre pedimos confianza para tener datos completos
        prompt = f"""Classify this text into {"one or more of" if multi_label else "exactly one of"} these categories: {categories_str}

Return a JSON object with this exact structure:
{{
  "category": {"[\"cat1\", \"cat2\"]" if multi_label else "\"category_name\""},
  "confidence": 0.95,
  "all_scores": {{"category1": 0.95, "category2": 0.05}}
}}

{"You may assign multiple categories in the category array." if multi_label else "Choose only the best matching category."}
The confidence should be between 0 and 1.
The all_scores should have confidence for each category.

Text to classify:
{text}

Return only the JSON object:"""

        response = self.send_llm_prompt(prompt, json_mode=True)

        try:
            result = json.loads(response.strip())
            # Asegurar estructura consistente
            if "category" not in result:
                # Buscar la categoría en la respuesta
                for cat in categories:
                    if cat.lower() in str(result).lower():
                        result = {"category": cat, "confidence": 0.8, "all_scores": {cat: 0.8}}
                        break
                else:
                    result = {"category": categories[0] if categories else "", "confidence": 0.5, "all_scores": {}}

            # Normalizar category: si es lista y multi_label=False, tomar el primero
            if not multi_label and isinstance(result.get("category"), list):
                result["category"] = result["category"][0] if result["category"] else ""

            # Asegurar que confidence existe
            if "confidence" not in result:
                result["confidence"] = 0.8

            # Asegurar que all_scores existe
            if "all_scores" not in result:
                result["all_scores"] = {result.get("category", ""): result.get("confidence", 0.8)}

            return result

        except json.JSONDecodeError:
            # Fallback: buscar categoría en texto plano
            response_lower = response.lower().strip()
            for cat in categories:
                if cat.lower() in response_lower:
                    return {"category": cat, "confidence": 0.7, "all_scores": {cat: 0.7}}

            # Si no encuentra, retornar la primera categoría con baja confianza
            return {
                "category": categories[0] if categories else response,
                "confidence": 0.5,
                "all_scores": {categories[0]: 0.5} if categories else {}
            }

    # =========================================================================
    # TRADUCCIÓN
    # =========================================================================

    @keyword("Translate Text")
    def translate_text(
        self,
        text: str,
        target_language: str,
        source_language: Optional[str] = None,
        preserve_formatting: bool = True
    ) -> str:
        """
        Traduce texto a otro idioma.

        Args:
            text: Texto a traducir
            target_language: Idioma destino
            source_language: Idioma origen (auto-detectado si no se especifica)
            preserve_formatting: Mantener formato original

        Returns:
            Texto traducido

        Example:
            | ${spanish}= | Translate Text | Hello world | Spanish |
            | ${english}= | Translate Text | ${french_text} | English | French |
        """
        prompt = f"""Translate the following text to {target_language}.
{f"Source language: {source_language}" if source_language else "Auto-detect the source language."}
{"Preserve the original formatting (paragraphs, lists, etc.)." if preserve_formatting else ""}

Text:
{text}

Translation:"""

        return self.send_llm_prompt(prompt)

    # =========================================================================
    # ANÁLISIS DE SENTIMIENTO
    # =========================================================================

    @keyword("Analyze Sentiment")
    def analyze_sentiment(
        self,
        text: str,
        detailed: bool = False
    ) -> Union[str, Dict[str, Any]]:
        """
        Analiza el sentimiento de un texto.

        Args:
            text: Texto a analizar
            detailed: Si True, retorna análisis detallado

        Returns:
            Sentimiento (positive/negative/neutral) o análisis detallado

        Example:
            | ${sentiment}= | Analyze Sentiment | Great product! |
            | ${analysis}= | Analyze Sentiment | ${review} | detailed=True |
        """
        if detailed:
            prompt = f"""Analyze the sentiment of this text in detail.

Return a JSON object with:
- "sentiment": overall sentiment (positive, negative, neutral, mixed)
- "confidence": confidence score 0-1
- "emotions": detected emotions (list)
- "key_phrases": phrases that indicate the sentiment (list)
- "summary": brief explanation

Text:
{text}

Return only the JSON object:"""

            response = self.send_llm_prompt(prompt, json_mode=True)
            try:
                return json.loads(response.strip())
            except json.JSONDecodeError:
                return {"sentiment": "unknown", "raw": response}
        else:
            prompt = f"""Analyze the sentiment of this text.
Reply with exactly one word: positive, negative, or neutral.

Text:
{text}

Sentiment:"""

            response = self.send_llm_prompt(prompt).strip().lower()

            for sentiment in ["positive", "negative", "neutral"]:
                if sentiment in response:
                    return sentiment
            return response

    # =========================================================================
    # VISIÓN (Análisis de Imágenes)
    # =========================================================================

    @keyword("Analyze Image")
    def analyze_image(
        self,
        image_path: str,
        prompt: str = "Describe this image in detail.",
        extract_text: bool = False
    ) -> str:
        """
        Analiza una imagen usando IA de visión.

        Args:
            image_path: Ruta a la imagen
            prompt: Pregunta o instrucción sobre la imagen
            extract_text: Si True, extrae texto de la imagen (OCR)

        Returns:
            Descripción o análisis de la imagen

        Example:
            | ${description}= | Analyze Image | /path/to/image.png |
            | ${text}= | Analyze Image | ${screenshot} | extract_text=True |
        """
        self._ensure_configured()

        # Leer y codificar imagen
        try:
            with open(image_path, "rb") as f:
                image_data = base64.b64encode(f.read()).decode("utf-8")
        except FileNotFoundError:
            logger.error(f"Image not found: {image_path}")
            return f"Error: Image not found at {image_path}"

        # Determinar tipo MIME
        ext = image_path.lower().split(".")[-1]
        mime_types = {
            "png": "image/png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "gif": "image/gif",
            "webp": "image/webp"
        }
        mime_type = mime_types.get(ext, "image/png")

        if extract_text:
            prompt = "Extract and return all text visible in this image. Maintain the original structure and formatting as much as possible."

        # Llamar API con imagen
        return self._call_vision(image_data, mime_type, prompt)

    @keyword("Compare Images")
    def compare_images(
        self,
        image_path_1: str,
        image_path_2: str,
        comparison_type: str = "differences"
    ) -> str:
        """
        Compara dos imágenes usando IA de visión.

        Args:
            image_path_1: Ruta a la primera imagen
            image_path_2: Ruta a la segunda imagen
            comparison_type: Tipo de comparación (differences, similarity)

        Returns:
            Análisis de comparación

        Example:
            | ${diff}= | Compare Images | /before.png | /after.png | differences |
        """
        # Por ahora, analizar cada imagen y comparar
        desc1 = self.analyze_image(image_path_1, "Describe this image focusing on key visual elements.")
        desc2 = self.analyze_image(image_path_2, "Describe this image focusing on key visual elements.")

        comparison_prompt = f"""Compare these two image descriptions and identify {comparison_type}.

Image 1 description:
{desc1}

Image 2 description:
{desc2}

Provide a detailed comparison:"""

        return self.send_llm_prompt(comparison_prompt)

    # =========================================================================
    # EMBEDDINGS
    # =========================================================================

    @keyword("Generate Embeddings")
    def generate_embeddings(
        self,
        text: str,
        model: Optional[str] = None
    ) -> List[float]:
        """
        Genera embeddings (vectores) para un texto.

        Args:
            text: Texto para generar embeddings
            model: Modelo de embeddings (default: text-embedding-ada-002)

        Returns:
            Lista de floats (vector de embeddings)

        Example:
            | ${vector}= | Generate Embeddings | Hello world |
        """
        self._ensure_configured()

        # Check cache
        cache_key = f"{text}:{model or 'default'}"
        if cache_key in self._embeddings_cache:
            return self._embeddings_cache[cache_key]

        if self._config.provider in [AIProvider.OPENAI, AIProvider.AZURE_OPENAI]:
            try:
                embedding_model = model or "text-embedding-ada-002"
                response = self._client.embeddings.create(
                    input=text,
                    model=embedding_model
                )
                embeddings = response.data[0].embedding
                self._embeddings_cache[cache_key] = embeddings
                return embeddings
            except Exception as e:
                logger.error(f"Failed to generate embeddings: {e}")
                return []
        else:
            logger.warn(f"Embeddings not supported for provider {self._config.provider}")
            return []

    @keyword("Calculate Text Similarity")
    def calculate_text_similarity(
        self,
        text1: str,
        text2: str
    ) -> float:
        """
        Calcula similitud semántica entre dos textos.

        Args:
            text1: Primer texto
            text2: Segundo texto

        Returns:
            Score de similitud (0-1)

        Example:
            | ${similarity}= | Calculate Text Similarity | Hello | Hi there |
        """
        emb1 = self.generate_embeddings(text1)
        emb2 = self.generate_embeddings(text2)

        if not emb1 or not emb2:
            # Fallback: usar LLM para estimar similitud
            prompt = f"""Rate the semantic similarity between these two texts on a scale of 0 to 1.
Reply with only a number.

Text 1: {text1}
Text 2: {text2}

Similarity score:"""
            try:
                return float(self.send_llm_prompt(prompt).strip())
            except ValueError:
                return 0.0

        # Cosine similarity
        dot_product = sum(a * b for a, b in zip(emb1, emb2))
        norm1 = sum(a * a for a in emb1) ** 0.5
        norm2 = sum(b * b for b in emb2) ** 0.5

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return dot_product / (norm1 * norm2)

    # =========================================================================
    # HELPERS INTERNOS
    # =========================================================================

    def _ensure_configured(self):
        """Verifica que el proveedor esté configurado"""
        if not self._config:
            raise ValueError(
                "AI provider not configured. Use 'Configure AI Provider' keyword first."
            )

    def _call_llm(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        json_mode: bool = False
    ) -> str:
        """Llama al LLM según el proveedor configurado"""
        if not self._client:
            logger.error("AI client not initialized")
            return "[AI client not available]"

        temp = temperature if temperature is not None else self._config.temperature
        tokens = max_tokens if max_tokens is not None else self._config.max_tokens

        try:
            if self._config.provider == AIProvider.ANTHROPIC:
                # Separar system message para Anthropic
                system = None
                user_messages = []
                for msg in messages:
                    if msg["role"] == "system":
                        system = msg["content"]
                    else:
                        user_messages.append(msg)

                response = self._client.messages.create(
                    model=self._config.model,
                    max_tokens=tokens,
                    system=system,
                    messages=user_messages
                )
                return response.content[0].text

            elif self._config.provider == AIProvider.GOOGLE:
                # Google Gemini uses different API
                # Convert messages to Gemini format
                prompt_parts = []
                for msg in messages:
                    prefix = "System: " if msg["role"] == "system" else ("User: " if msg["role"] == "user" else "Assistant: ")
                    prompt_parts.append(f"{prefix}{msg['content']}")

                full_prompt = "\n\n".join(prompt_parts)
                response = self._client.generate_content(
                    full_prompt,
                    generation_config={
                        "temperature": temp,
                        "max_output_tokens": tokens,
                    }
                )
                return response.text

            elif self._config.provider == AIProvider.AWS:
                # AWS Bedrock - uses invoke_model
                import json as json_lib
                # Convert messages to prompt format for Claude on Bedrock
                system = None
                user_messages = []
                for msg in messages:
                    if msg["role"] == "system":
                        system = msg["content"]
                    else:
                        user_messages.append(msg)

                body = {
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": tokens,
                    "messages": user_messages,
                }
                if system:
                    body["system"] = system
                if temp is not None:
                    body["temperature"] = temp

                response = self._client.invoke_model(
                    modelId=self._config.model,
                    body=json_lib.dumps(body),
                    contentType="application/json",
                    accept="application/json",
                )
                result = json_lib.loads(response["body"].read())
                return result["content"][0]["text"]

            else:  # OpenAI, Azure, Ollama, Groq, Mistral (OpenAI-compatible)
                kwargs = {
                    "model": self._config.model,
                    "messages": messages,
                    "temperature": temp,
                    "max_tokens": tokens,
                }

                if json_mode:
                    kwargs["response_format"] = {"type": "json_object"}

                response = self._client.chat.completions.create(**kwargs)
                return response.choices[0].message.content

        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            return f"[Error: {str(e)}]"

    def _call_vision(
        self,
        image_base64: str,
        mime_type: str,
        prompt: str
    ) -> str:
        """Llama al modelo de visión"""
        if not self._client:
            return "[AI client not available]"

        try:
            if self._config.provider == AIProvider.ANTHROPIC:
                response = self._client.messages.create(
                    model=self._config.model,
                    max_tokens=self._config.max_tokens,
                    messages=[{
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": mime_type,
                                    "data": image_base64,
                                },
                            },
                            {"type": "text", "text": prompt}
                        ],
                    }]
                )
                return response.content[0].text

            else:  # OpenAI, Azure
                response = self._client.chat.completions.create(
                    model=self._config.model,
                    messages=[{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime_type};base64,{image_base64}"
                                }
                            }
                        ],
                    }],
                    max_tokens=self._config.max_tokens
                )
                return response.choices[0].message.content

        except Exception as e:
            logger.error(f"Vision call failed: {e}")
            return f"[Error: {str(e)}]"

    # =========================================================================
    # AI REPAIR DATA - Reparación inteligente de datos
    # =========================================================================

    @keyword("AI Repair Data")
    def ai_repair_data(
        self,
        data: List[Dict[str, Any]],
        validation_report: Dict[str, Any],
        context: str = "general",
        allow_format_normalization: bool = True,
        allow_semantic_cleanup: bool = True,
        allow_value_inference: bool = False,
        allow_sensitive_repair: bool = False,
        min_confidence: float = 0.9,
    ) -> Dict[str, Any]:
        """
        Repara datos con problemas de calidad usando IA.

        PRINCIPIO RECTOR: El nodo NO inventa datos.
        Solo corrige, normaliza o completa con ALTA CONFIANZA.

        Qué SÍ puede reparar:
        - Formatos incorrectos (fechas, montos, IDs)
        - Normalización (nombres, direcciones, códigos)
        - Campos derivados (ej. full_name desde partes)
        - Limpieza semántica (OCR, texto sucio)

        Qué NO debe reparar:
        - Datos faltantes críticos sin evidencia
        - Valores legales/financieros sensibles (si no está habilitado)
        - Diagnósticos médicos
        - Decisiones de negocio

        Args:
            data: Lista de diccionarios con los datos a reparar
            validation_report: Reporte de validación con reglas fallidas
            context: Contexto del proceso (general, insurance, healthcare, finance)
            allow_format_normalization: Permitir normalización de formatos
            allow_semantic_cleanup: Permitir limpieza semántica
            allow_value_inference: Permitir inferencia de valores (CUIDADO)
            allow_sensitive_repair: Permitir reparar campos sensibles
            min_confidence: Confianza mínima requerida (0.0 - 1.0)

        Returns:
            Diccionario con datos reparados, métricas y auditoría

        Example:
            | ${result}= | AI Repair Data | ${data} | ${validation_report} |
            | Log | Repaired quality: ${result}[repaired_quality] |
        """
        if not self._config:
            return {
                "status": "failed",
                "error": "AI provider not configured. Call Configure AI Provider first.",
                "repaired_data": data,
                "original_quality": 0,
                "repaired_quality": 0,
            }

        # Extraer información del reporte de validación
        failed_validations = validation_report.get("validation_results", [])
        if not failed_validations:
            failed_validations = validation_report.get("results", [])

        original_quality = validation_report.get("success_rate",
                          validation_report.get("summary", {}).get("data_quality_score", 100))

        # Si no hay problemas, retornar directamente
        if original_quality >= 95:
            return {
                "status": "repaired",
                "original_quality": original_quality,
                "repaired_quality": original_quality,
                "repaired_data": data,
                "repairs": [],
                "message": "Data quality already acceptable, no repairs needed",
            }

        # Identificar campos con problemas
        problem_fields = self._identify_problem_fields(failed_validations)

        if not problem_fields:
            return {
                "status": "repaired",
                "original_quality": original_quality,
                "repaired_quality": original_quality,
                "repaired_data": data,
                "repairs": [],
                "message": "No repairable fields identified",
            }

        # Generate execution ID for audit trail
        execution_id = str(uuid.uuid4())[:8]

        # Construir prompt para reparación (usando prompts versionados)
        repair_prompt, prompt_audit = self._build_repair_prompt(
            data=data,
            problem_fields=problem_fields,
            context=context,
            allow_format_normalization=allow_format_normalization,
            allow_semantic_cleanup=allow_semantic_cleanup,
            allow_value_inference=allow_value_inference,
            allow_sensitive_repair=allow_sensitive_repair,
            min_confidence=min_confidence,
            execution_id=execution_id,
        )

        # Llamar al LLM
        try:
            response = self._call_llm(
                messages=[{"role": "user", "content": repair_prompt}],
                json_mode=True,
            )

            # Parsear respuesta
            repair_result = json.loads(response)

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI repair response: {e}")
            return {
                "status": "failed",
                "error": f"Invalid AI response format: {e}",
                "repaired_data": data,
                "original_quality": original_quality,
                "repaired_quality": original_quality,
            }
        except Exception as e:
            logger.error(f"AI repair failed: {e}")
            return {
                "status": "failed",
                "error": str(e),
                "repaired_data": data,
                "original_quality": original_quality,
                "repaired_quality": original_quality,
            }

        # Aplicar reparaciones con filtro de confianza
        repaired_data, applied_repairs = self._apply_repairs(
            data=data,
            repairs=repair_result.get("repairs", []),
            min_confidence=min_confidence,
        )

        # Calcular nueva calidad estimada
        repair_count = len(applied_repairs)
        total_issues = len(problem_fields)
        improvement = (repair_count / total_issues * (100 - original_quality)) if total_issues > 0 else 0
        repaired_quality = min(original_quality + improvement, 100)

        # Determinar estado final
        if repaired_quality >= 90:
            status = "repaired"
        elif repaired_quality > original_quality:
            status = "partially_fixed"
        else:
            status = "failed"

        result = {
            "status": status,
            "original_quality": round(original_quality, 2),
            "repaired_quality": round(repaired_quality, 2),
            "improvement": round(repaired_quality - original_quality, 2),
            "repaired_data": repaired_data,
            "repairs": applied_repairs,
            "skipped_repairs": [
                r for r in repair_result.get("repairs", [])
                if r.get("confidence", 0) < min_confidence
            ],
            "total_issues": total_issues,
            "issues_fixed": repair_count,
            "context": context,
            "settings": {
                "allow_format_normalization": allow_format_normalization,
                "allow_semantic_cleanup": allow_semantic_cleanup,
                "allow_value_inference": allow_value_inference,
                "allow_sensitive_repair": allow_sensitive_repair,
                "min_confidence": min_confidence,
            },
            # Audit trail for compliance (HIPAA, SOC2, etc.)
            "audit": {
                "execution_id": execution_id,
                "prompt_info": prompt_audit,
                "provider": self._config.provider.value if self._config else "unknown",
            },
        }

        logger.info(f"AI Repair: {status} - Quality {original_quality:.1f}% → {repaired_quality:.1f}%")
        return result

    def _identify_problem_fields(self, failed_validations: List[Dict]) -> List[Dict]:
        """Identifica campos con problemas de los reportes de validación"""
        problem_fields = []

        for validation in failed_validations:
            if validation.get("valid", True):
                continue

            field_info = {
                "column": validation.get("column"),
                "expectation": validation.get("expectation", "unknown"),
                "issue_type": self._classify_issue_type(validation),
                "invalid_count": validation.get("invalid_count", validation.get("null_count", 0)),
                "invalid_values": validation.get("invalid_values", validation.get("unexpected_values", []))[:5],
            }

            if field_info["column"]:
                problem_fields.append(field_info)

        return problem_fields

    def _classify_issue_type(self, validation: Dict) -> str:
        """Clasifica el tipo de problema"""
        expectation = validation.get("expectation", "").lower()
        message = validation.get("message", "").lower()

        if "null" in expectation or "null" in message:
            return "missing_value"
        elif "unique" in expectation or "duplicate" in message:
            return "duplicate"
        elif "regex" in expectation or "format" in message or "pattern" in message:
            return "format_error"
        elif "between" in expectation or "range" in message:
            return "out_of_range"
        elif "in_set" in expectation or "allowed" in message:
            return "invalid_value"
        elif "email" in expectation or "email" in message:
            return "invalid_email"
        elif "date" in expectation or "date" in message:
            return "invalid_date"
        else:
            return "other"

    def _build_repair_prompt(
        self,
        data: List[Dict],
        problem_fields: List[Dict],
        context: str,
        allow_format_normalization: bool,
        allow_semantic_cleanup: bool,
        allow_value_inference: bool,
        allow_sensitive_repair: bool,
        min_confidence: float,
        execution_id: Optional[str] = None,
    ) -> tuple[str, Dict[str, Any]]:
        """
        Construye el prompt para reparación de datos usando prompts versionados.

        Returns:
            Tuple of (prompt_string, audit_metadata)

        The prompt is loaded from versioned .md files in skuldbot/ai/prompts/repair/
        This provides:
        - Auditability for compliance (HIPAA, SOC2, etc.)
        - Version control for prompt changes
        - Industry-specific context (healthcare, insurance, finance)
        """
        # Generate execution ID for audit trail
        exec_id = execution_id or str(uuid.uuid4())[:8]

        # Tomar muestra de datos con problemas
        sample_size = min(10, len(data))
        sample_data = data[:sample_size]

        # Build allowed actions list
        allowed_actions = []
        if allow_format_normalization:
            allowed_actions.append("Format normalization (dates, phone numbers, currency)")
        if allow_semantic_cleanup:
            allowed_actions.append("Semantic cleanup (typos, case normalization, whitespace)")
        if allow_value_inference:
            allowed_actions.append("Value inference (ONLY when evidence is very clear)")
        if allow_sensitive_repair:
            allowed_actions.append("Sensitive field repair (IDs, financial data)")

        # User config for audit
        user_config = {
            "allow_format_normalization": allow_format_normalization,
            "allow_semantic_cleanup": allow_semantic_cleanup,
            "allow_value_inference": allow_value_inference,
            "allow_sensitive_repair": allow_sensitive_repair,
            "min_confidence": min_confidence,
            "context": context,
        }

        # Get provider name for audit
        provider_name = self._config.provider.value if self._config else "unknown"

        # Try to use versioned prompt loader
        audit_metadata = {}
        if PROMPT_LOADER_AVAILABLE:
            try:
                # Load versioned system prompt and context
                prompt_result = build_full_prompt(
                    node_type="repair",
                    version="v1",
                    context=context,
                    user_config=user_config,
                    execution_id=exec_id,
                    provider=provider_name,
                )

                system_prompt = prompt_result["full_prompt"]
                audit_metadata = prompt_result.get("audit_log", {})

                logger.info(
                    f"Using versioned prompt: repair/system_v1 + context_{context} "
                    f"(checksum: {prompt_result['metadata'].get('checksum', 'n/a')})"
                )

            except FileNotFoundError as e:
                logger.warn(f"Versioned prompt not found, using fallback: {e}")
                system_prompt = self._get_fallback_repair_prompt(context)
                audit_metadata = {"fallback": True, "reason": str(e)}
            except Exception as e:
                logger.warn(f"Error loading versioned prompt, using fallback: {e}")
                system_prompt = self._get_fallback_repair_prompt(context)
                audit_metadata = {"fallback": True, "reason": str(e)}
        else:
            # Fallback when prompt loader not available
            logger.debug("Prompt loader not available, using inline prompt")
            system_prompt = self._get_fallback_repair_prompt(context)
            audit_metadata = {"fallback": True, "reason": "prompt_loader_not_available"}

        # Build the final prompt with data payload
        prompt = f"""{system_prompt}

## CONFIGURATION FOR THIS REPAIR

Minimum confidence threshold: {min_confidence}

ALLOWED ACTIONS:
{chr(10).join(f"- {action}" for action in allowed_actions) if allowed_actions else "- None specified (be very conservative)"}

## DATA TO REPAIR

PROBLEM FIELDS TO FIX:
{json.dumps(problem_fields, indent=2)}

SAMPLE DATA (first {sample_size} rows):
{json.dumps(sample_data, indent=2)}

Respond with a JSON object containing an array of repairs. Only output valid JSON, no additional text."""

        return prompt, audit_metadata

    def _get_fallback_repair_prompt(self, context: str) -> str:
        """
        Fallback prompt when versioned prompts are not available.

        This is kept for backwards compatibility but the versioned prompts
        in skuldbot/ai/prompts/repair/ should be preferred.
        """
        context_instructions = {
            "insurance": """
Context: Insurance data processing
- Be extra careful with claim amounts, policy numbers
- Date formats should be standardized to ISO
- Status codes must match industry standards
- Never infer financial values
""",
            "healthcare": """
Context: Healthcare data processing (HIPAA sensitive)
- Never modify medical record numbers or diagnosis codes
- Date of birth must be validated, not inferred
- Patient names can be normalized but not changed
- Medical codes (ICD, CPT) must be validated against standards
""",
            "finance": """
Context: Financial data processing
- Account numbers must be validated, not modified
- Currency amounts need proper formatting
- Dates must be precise
- Never infer or estimate monetary values
""",
            "general": """
Context: General data processing
- Apply standard data cleaning practices
- Normalize formats where clear
- Be conservative with inferences
"""
        }

        return f"""You are a data quality repair assistant. Your task is to suggest repairs for data quality issues.

CRITICAL RULES:
1. You can ONLY repair data, never invent or guess values
2. Each repair must have a confidence score (0.0 to 1.0)
3. If you cannot repair with high confidence, set confidence to 0

{context_instructions.get(context, context_instructions["general"])}

FORBIDDEN ACTIONS:
- Inventing values that don't exist in context
- Guessing sensitive data (SSN, medical IDs, account numbers)
- Modifying values that could have legal implications
- Making assumptions about missing critical data

RESPONSE FORMAT:
Return a JSON object with:
{{
  "repairs": [
    {{
      "row_index": 0,
      "field": "field_name",
      "original_value": "original",
      "repaired_value": "fixed value",
      "action": "format_normalization|semantic_cleanup|value_inference|validation_fix",
      "confidence": 0.95,
      "reason": "Brief explanation"
    }}
  ],
  "unrepairable": [
    {{
      "field": "field_name",
      "reason": "Why this cannot be repaired"
    }}
  ]
}}"""

    def _apply_repairs(
        self,
        data: List[Dict],
        repairs: List[Dict],
        min_confidence: float,
    ) -> tuple:
        """Aplica las reparaciones con filtro de confianza"""
        repaired_data = [row.copy() for row in data]
        applied_repairs = []

        for repair in repairs:
            confidence = repair.get("confidence", 0)

            # Filtrar por confianza
            if confidence < min_confidence:
                logger.debug(f"Skipping repair for {repair.get('field')} - confidence {confidence} < {min_confidence}")
                continue

            row_index = repair.get("row_index", 0)
            field = repair.get("field")
            repaired_value = repair.get("repaired_value")

            if row_index < len(repaired_data) and field and field in repaired_data[row_index]:
                original_value = repaired_data[row_index][field]
                repaired_data[row_index][field] = repaired_value

                applied_repairs.append({
                    "row_index": row_index,
                    "field": field,
                    "original_value": original_value,
                    "repaired_value": repaired_value,
                    "action": repair.get("action", "unknown"),
                    "confidence": confidence,
                    "reason": repair.get("reason", ""),
                })

                logger.info(f"Applied repair: {field}[{row_index}] '{original_value}' → '{repaired_value}' (conf: {confidence})")

        return repaired_data, applied_repairs

    @keyword("AI Suggest Data Repairs")
    def ai_suggest_data_repairs(
        self,
        data: List[Dict[str, Any]],
        validation_report: Dict[str, Any],
        context: str = "general",
    ) -> Dict[str, Any]:
        """
        Sugiere reparaciones sin aplicarlas (modo preview).

        Útil para revisión humana antes de aplicar cambios.

        Args:
            data: Lista de diccionarios con los datos
            validation_report: Reporte de validación
            context: Contexto del proceso

        Returns:
            Sugerencias de reparación sin aplicar

        Example:
            | ${suggestions}= | AI Suggest Data Repairs | ${data} | ${report} |
            | Log | Suggested ${suggestions}[suggestion_count] repairs |
        """
        result = self.ai_repair_data(
            data=data,
            validation_report=validation_report,
            context=context,
            allow_format_normalization=True,
            allow_semantic_cleanup=True,
            allow_value_inference=False,
            allow_sensitive_repair=False,
            min_confidence=0.0,  # Get all suggestions
        )

        # Reorganizar para modo preview
        all_repairs = result.get("repairs", []) + result.get("skipped_repairs", [])

        return {
            "suggestion_count": len(all_repairs),
            "high_confidence": [r for r in all_repairs if r.get("confidence", 0) >= 0.9],
            "medium_confidence": [r for r in all_repairs if 0.7 <= r.get("confidence", 0) < 0.9],
            "low_confidence": [r for r in all_repairs if r.get("confidence", 0) < 0.7],
            "suggestions": all_repairs,
            "original_quality": result.get("original_quality"),
            "estimated_quality_after_repair": result.get("repaired_quality"),
        }
