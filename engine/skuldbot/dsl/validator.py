"""
Validador de DSL
"""

from typing import Dict, List, Set, Optional
from skuldbot.dsl.models import BotDefinition, NodeDefinition


class ValidationError(Exception):
    """Error de validación del DSL"""

    def __init__(self, message: str, errors: Optional[List[str]] = None):
        super().__init__(message)
        self.errors = errors or []


class DSLValidator:
    """Validador avanzado de DSL"""

    def __init__(self):
        self.errors: List[str] = []

    def validate(self, dsl_dict: Dict) -> BotDefinition:
        """
        Valida un diccionario DSL y retorna un BotDefinition

        Args:
            dsl_dict: Diccionario con la definición del bot

        Returns:
            BotDefinition validado

        Raises:
            ValidationError: Si hay errores de validación
        """
        self.errors = []

        try:
            # Validación con Pydantic
            bot = BotDefinition(**dsl_dict)
        except Exception as e:
            raise ValidationError(f"Error de schema: {str(e)}")

        # Validaciones adicionales
        self._validate_node_references(bot)
        self._validate_no_cycles(bot)
        self._validate_reachability(bot)

        if self.errors:
            raise ValidationError("Errores de validación encontrados", self.errors)

        return bot

    def _validate_node_references(self, bot: BotDefinition) -> None:
        """Valida que todas las referencias a nodos existan"""
        node_ids = {node.id for node in bot.nodes}
        # "END" is a special value that terminates the flow (implicit termination)
        node_ids.add("END")

        for node in bot.nodes:
            # Validar output success
            if node.outputs.success not in node_ids:
                self.errors.append(
                    f"Nodo '{node.id}': output.success '{node.outputs.success}' no existe"
                )

            # Validar output error
            if node.outputs.error not in node_ids:
                self.errors.append(
                    f"Nodo '{node.id}': output.error '{node.outputs.error}' no existe"
                )

    def _validate_no_cycles(self, bot: BotDefinition) -> None:
        """Detecta ciclos infinitos en el flujo"""
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
                self.errors.append(f"Ciclo detectado: {cycle}")
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
        """Valida que todos los nodos sean alcanzables desde el inicio o triggers"""
        # Obtener todos los puntos de entrada: start_node y triggers
        entry_points: Set[str] = set()

        # Agregar start_node si existe
        start_node = bot.get_start_node()
        if start_node:
            entry_points.add(start_node.id)

        # Agregar triggers como puntos de entrada
        if bot.triggers:
            for trigger_id in bot.triggers:
                if bot.get_node(trigger_id):
                    entry_points.add(trigger_id)

        if not entry_points:
            self.errors.append("No hay nodo inicial ni triggers definidos")
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

        # Reportar nodos no alcanzables
        all_nodes = {node.id for node in bot.nodes}
        unreachable = all_nodes - reachable

        if unreachable:
            for node_id in unreachable:
                self.errors.append(f"Nodo '{node_id}' no es alcanzable desde el inicio")

