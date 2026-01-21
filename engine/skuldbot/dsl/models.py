"""
Modelos Pydantic para el DSL
"""

from typing import Dict, List, Optional, Any, Literal
from pydantic import BaseModel, Field, field_validator


class ErrorDefinition(BaseModel):
    """Definición de error estructurado"""

    code: str
    message: str
    node_id: str
    retryable: bool = False
    details: Optional[Dict[str, Any]] = None


class NodeOutput(BaseModel):
    """Salidas de un nodo"""

    success: str = Field(..., description="ID del nodo siguiente en caso de éxito")
    error: str = Field(..., description="ID del nodo siguiente en caso de error")


class ToolConnection(BaseModel):
    """Conexión de herramienta para AI Agent"""

    name: str = Field(..., description="Nombre de la herramienta")
    description: str = Field(..., description="Descripción para el LLM")
    nodeId: str = Field(..., description="ID del nodo a ejecutar")
    inputMapping: Optional[Dict[str, str]] = Field(None, description="Mapeo de parámetros")


class MemoryConnection(BaseModel):
    """Conexión de memoria vectorial para AI Agent"""

    provider: str = Field("chroma", description="Proveedor de vectordb (chroma, pgvector, pinecone, qdrant, supabase)")
    collection: str = Field("agent_memory", description="Nombre de la colección")
    memory_type: str = Field("both", description="Tipo de memoria (retrieve, store, both)")
    top_k: int = Field(5, description="Número de documentos a recuperar")
    min_score: float = Field(0.5, description="Score mínimo para recuperación")
    connection_params: Optional[Dict[str, Any]] = Field(None, description="Parámetros de conexión del proveedor")


class EmbeddingsConnection(BaseModel):
    """Configuración de embeddings conectada visualmente (estilo n8n)"""

    provider: str = Field("openai", description="Proveedor de embeddings (openai, azure, ollama, cohere, huggingface, google, aws)")
    model: str = Field("text-embedding-3-small", description="Modelo de embeddings")
    dimension: int = Field(1536, description="Dimensión del vector")
    # Provider-specific fields
    api_key: Optional[str] = Field(None, description="API key del proveedor")
    base_url: Optional[str] = Field(None, description="URL base (para Azure, Ollama, HuggingFace)")
    api_version: Optional[str] = Field(None, description="Versión de API (para Azure)")
    project_id: Optional[str] = Field(None, description="Project ID (para Google)")
    location: Optional[str] = Field(None, description="Ubicación/Region (para Google, AWS)")
    aws_access_key: Optional[str] = Field(None, description="AWS Access Key")
    aws_secret_key: Optional[str] = Field(None, description="AWS Secret Key")
    region: Optional[str] = Field(None, description="AWS Region")


class ModelConnection(BaseModel):
    """Configuración de LLM/Chat Model conectada visualmente (estilo n8n)"""

    provider: str = Field("openai", description="Proveedor de LLM (openai, anthropic, azure, ollama, google, aws, groq, mistral)")
    model: str = Field("gpt-4o", description="Modelo de LLM")
    temperature: float = Field(0.7, ge=0, le=2, description="Temperatura de generación")
    max_tokens: Optional[int] = Field(None, description="Máximo de tokens a generar")
    # Provider-specific fields
    api_key: Optional[str] = Field(None, description="API key del proveedor")
    base_url: Optional[str] = Field(None, description="URL base (para Azure, Ollama)")
    api_version: Optional[str] = Field(None, description="Versión de API (para Azure)")
    aws_access_key: Optional[str] = Field(None, description="AWS Access Key (para Bedrock)")
    aws_secret_key: Optional[str] = Field(None, description="AWS Secret Key (para Bedrock)")
    region: Optional[str] = Field(None, description="AWS Region (para Bedrock)")


class NodeDefinition(BaseModel):
    """Definición de un nodo en el flujo"""

    id: str = Field(..., description="Identificador único del nodo")
    type: str = Field(..., description="Tipo de nodo (ej: browser.open, excel.read)")
    config: Dict[str, Any] = Field(default_factory=dict, description="Configuración del nodo")
    outputs: NodeOutput = Field(..., description="Salidas del nodo")
    label: Optional[str] = Field(None, description="Etiqueta visible para el usuario")
    description: Optional[str] = Field(None, description="Descripción del nodo")
    # AI Agent specific fields (connected visually in n8n style)
    tools: Optional[List[ToolConnection]] = Field(None, description="Herramientas conectadas (solo para ai.agent)")
    model_config_: Optional[ModelConnection] = Field(None, alias="model_config", description="Configuración de LLM conectada visualmente")
    memory: Optional[MemoryConnection] = Field(None, description="Memoria vectorial conectada (solo para ai.agent)")
    embeddings: Optional[EmbeddingsConnection] = Field(None, description="Configuración de embeddings conectada visualmente")

    class Config:
        populate_by_name = True

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Node ID no puede estar vacío")
        return v

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if "." not in v:
            raise ValueError("Node type debe tener formato 'category.action' (ej: browser.open)")
        return v


class VariableDefinition(BaseModel):
    """Definición de variable"""

    type: Literal["string", "number", "boolean", "credential", "file", "json"]
    value: Optional[Any] = None
    vault: Optional[str] = None
    description: Optional[str] = None


class BotMetadata(BaseModel):
    """Metadata del bot"""

    id: str
    name: str
    description: Optional[str] = None
    version: Optional[str] = "1.0.0"
    author: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class BotDefinition(BaseModel):
    """Definición completa del bot en DSL"""

    version: str = Field(..., description="Versión del DSL")
    bot: BotMetadata = Field(..., description="Metadata del bot")
    nodes: List[NodeDefinition] = Field(..., description="Lista de nodos del flujo")
    variables: Dict[str, VariableDefinition] = Field(
        default_factory=dict, description="Variables del bot"
    )
    triggers: List[str] = Field(default_factory=list, description="IDs de nodos trigger")
    start_node: Optional[str] = Field(None, description="ID del nodo inicial")

    @field_validator("nodes")
    @classmethod
    def validate_nodes(cls, v: List[NodeDefinition]) -> List[NodeDefinition]:
        if not v:
            raise ValueError("Bot must have at least one node")

        # Validate unique IDs
        ids = [node.id for node in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Node IDs must be unique")

        return v

    @field_validator("start_node")
    @classmethod
    def validate_start_node(cls, v: Optional[str], info) -> Optional[str]:
        if v and "nodes" in info.data:
            node_ids = [node.id for node in info.data["nodes"]]
            if v not in node_ids:
                raise ValueError(f"start_node '{v}' does not exist in the node list")
        return v

    def get_node(self, node_id: str) -> Optional[NodeDefinition]:
        """Gets a node by its ID"""
        for node in self.nodes:
            if node.id == node_id:
                return node
        return None

    def get_start_node(self) -> Optional[NodeDefinition]:
        """Gets the start node"""
        if self.start_node:
            return self.get_node(self.start_node)
        # Si no se especifica, retornar el primer nodo
        return self.nodes[0] if self.nodes else None

