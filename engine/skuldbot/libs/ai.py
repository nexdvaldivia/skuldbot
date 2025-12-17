"""
Librería SkuldAI para nodos de Inteligencia Artificial (Robot Framework)

Proporciona keywords para integración con LLMs y servicios de IA.
Soporta múltiples proveedores: OpenAI, Anthropic, Azure OpenAI, local (Ollama).
"""

import json
import base64
from typing import Any, Dict, List, Optional, Union
from dataclasses import dataclass, field
from enum import Enum
from robot.api.deco import keyword, library
from robot.api import logger


class AIProvider(Enum):
    """Proveedores de IA soportados"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    AZURE_OPENAI = "azure_openai"
    OLLAMA = "ollama"
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

        elif provider == AIProvider.AZURE_OPENAI:
            try:
                from openai import AzureOpenAI
                self._client = AzureOpenAI(
                    api_key=self._config.api_key,
                    azure_endpoint=self._config.base_url,
                    api_version=self._config.extra_params.get("api_version", "2024-02-15-preview")
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
    ) -> Union[str, List[str], Dict[str, Any]]:
        """
        Clasifica texto en categorías predefinidas.

        Args:
            text: Texto a clasificar
            categories: Lista de categorías posibles
            multi_label: Si permite múltiples categorías
            include_confidence: Si incluir scores de confianza

        Returns:
            Categoría(s) asignada(s)

        Example:
            | ${cats}= | Create List | spam | not_spam |
            | ${result}= | Classify Text | ${email_body} | ${cats} |
            | ${results}= | Classify Text | ${text} | ${categories} | multi_label=True |
        """
        categories_str = ", ".join(categories)

        if include_confidence:
            prompt = f"""Classify this text into one{"or more" if multi_label else ""} of these categories: {categories_str}

Return a JSON object with category names as keys and confidence scores (0-1) as values.
{"You may assign multiple categories." if multi_label else "Choose only the best matching category."}

Text:
{text}

Return only the JSON object:"""

            response = self.send_llm_prompt(prompt, json_mode=True)
            try:
                return json.loads(response.strip())
            except json.JSONDecodeError:
                return {"_raw": response}
        else:
            prompt = f"""Classify this text into {"one or more of" if multi_label else "exactly one of"} these categories: {categories_str}

{"Return categories as a JSON array." if multi_label else "Return only the category name, nothing else."}

Text:
{text}"""

            response = self.send_llm_prompt(prompt)
            response = response.strip()

            if multi_label:
                try:
                    return json.loads(response)
                except json.JSONDecodeError:
                    # Intentar extraer categorías del texto
                    return [cat for cat in categories if cat.lower() in response.lower()]
            else:
                # Buscar la categoría mencionada en la respuesta
                for cat in categories:
                    if cat.lower() in response.lower():
                        return cat
                return response

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

            else:  # OpenAI, Azure, Ollama
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
