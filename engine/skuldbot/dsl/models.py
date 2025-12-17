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


class NodeDefinition(BaseModel):
    """Definición de un nodo en el flujo"""

    id: str = Field(..., description="Identificador único del nodo")
    type: str = Field(..., description="Tipo de nodo (ej: browser.open, excel.read)")
    config: Dict[str, Any] = Field(default_factory=dict, description="Configuración del nodo")
    outputs: NodeOutput = Field(..., description="Salidas del nodo")
    label: Optional[str] = Field(None, description="Etiqueta visible para el usuario")
    description: Optional[str] = Field(None, description="Descripción del nodo")

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
    start_node: Optional[str] = Field(None, description="ID del nodo inicial")

    @field_validator("nodes")
    @classmethod
    def validate_nodes(cls, v: List[NodeDefinition]) -> List[NodeDefinition]:
        if not v:
            raise ValueError("Bot debe tener al menos un nodo")

        # Validar IDs únicos
        ids = [node.id for node in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Los IDs de nodos deben ser únicos")

        return v

    @field_validator("start_node")
    @classmethod
    def validate_start_node(cls, v: Optional[str], info) -> Optional[str]:
        if v and "nodes" in info.data:
            node_ids = [node.id for node in info.data["nodes"]]
            if v not in node_ids:
                raise ValueError(f"start_node '{v}' no existe en la lista de nodos")
        return v

    def get_node(self, node_id: str) -> Optional[NodeDefinition]:
        """Obtiene un nodo por su ID"""
        for node in self.nodes:
            if node.id == node_id:
                return node
        return None

    def get_start_node(self) -> Optional[NodeDefinition]:
        """Obtiene el nodo inicial"""
        if self.start_node:
            return self.get_node(self.start_node)
        # Si no se especifica, retornar el primer nodo
        return self.nodes[0] if self.nodes else None

