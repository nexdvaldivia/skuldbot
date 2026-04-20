"""
Librería de nodos de Control Flow (Robot Framework)
"""

import time
from typing import Any, Dict, Optional
from robot.api.deco import keyword, library
from robot.api import logger


@library(scope="GLOBAL", auto_keywords=True)
class ControlLibrary:
    """
    Librería de control de flujo para Skuldbot
    """

    ROBOT_LIBRARY_SCOPE = "GLOBAL"
    ROBOT_LIBRARY_DOC_FORMAT = "ROBOT"

    def __init__(self):
        self._variables: Dict[str, Any] = {}

    @keyword("Log Message With Level")
    def log_message_with_level(self, message: str, level: str = "INFO"):
        """
        Log con nivel específico

        Args:
            message: Mensaje a loguear
            level: Nivel (INFO, WARN, ERROR, DEBUG)

        Example:
            | Log Message With Level | Processing started | INFO |
        """
        level_upper = level.upper()
        if level_upper == "INFO":
            logger.info(message)
        elif level_upper == "WARN":
            logger.warn(message)
        elif level_upper == "ERROR":
            logger.error(message)
        elif level_upper == "DEBUG":
            logger.debug(message)
        else:
            logger.info(message)

    @keyword("Wait Seconds")
    def wait_seconds(self, seconds: float):
        """
        Espera un número de segundos

        Args:
            seconds: Segundos a esperar

        Example:
            | Wait Seconds | 5.5 |
        """
        time.sleep(seconds)

    @keyword("Set Bot Variable")
    def set_bot_variable(self, name: str, value: Any):
        """
        Define una variable del bot

        Args:
            name: Nombre de la variable
            value: Valor

        Example:
            | Set Bot Variable | user_count | 42 |
        """
        self._variables[name] = value
        logger.info(f"Variable '{name}' set to: {value}")

    @keyword("Get Bot Variable")
    def get_bot_variable(self, name: str, default: Optional[Any] = None) -> Any:
        """
        Obtiene una variable del bot

        Args:
            name: Nombre de la variable
            default: Valor por defecto si no existe

        Returns:
            Valor de la variable

        Example:
            | ${value}= | Get Bot Variable | user_count | 0 |
        """
        return self._variables.get(name, default)

    @keyword("Check Condition")
    def check_condition(self, condition: str) -> bool:
        """
        Evalúa una condición simple

        Args:
            condition: Condición a evaluar (ej: "x > 5")

        Returns:
            True si la condición es verdadera

        Example:
            | ${result}= | Check Condition | ${count} > 10 |
        """
        try:
            # Evaluación simple y segura
            # TODO: Implementar parser más robusto
            result = eval(condition, {"__builtins__": {}}, self._variables)
            return bool(result)
        except Exception as e:
            logger.warn(f"Error evaluating condition '{condition}': {e}")
            return False

    @keyword("Execute If Condition")
    def execute_if_condition(
        self, condition: str, true_action: str, false_action: Optional[str] = None
    ) -> str:
        """
        Ejecuta acción según condición

        Args:
            condition: Condición a evaluar
            true_action: Nodo si es verdadero
            false_action: Nodo si es falso

        Returns:
            ID del siguiente nodo

        Example:
            | ${next}= | Execute If Condition | ${age} >= 18 | node-adult | node-minor |
        """
        result = self.check_condition(condition)
        if result:
            return true_action
        else:
            return false_action or "END"

    @keyword("Increment Counter")
    def increment_counter(self, name: str, increment: int = 1) -> int:
        """
        Incrementa un contador

        Args:
            name: Nombre del contador
            increment: Valor a incrementar

        Returns:
            Nuevo valor del contador

        Example:
            | ${count}= | Increment Counter | processed_items | 1 |
        """
        current = self._variables.get(name, 0)
        new_value = current + increment
        self._variables[name] = new_value
        return new_value

    @keyword("Reset All Variables")
    def reset_all_variables(self):
        """
        Resetea todas las variables del bot

        Example:
            | Reset All Variables |
        """
        self._variables.clear()
        logger.info("All bot variables cleared")

