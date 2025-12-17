"""
Compilador principal DSL → Robot Framework
"""

import json
import os
import re
from pathlib import Path
from typing import Dict, Optional, Any
from dataclasses import dataclass
from jinja2 import Environment, PackageLoader, select_autoescape

from skuldbot.dsl import BotDefinition, DSLValidator


def transform_variable_syntax(text: str) -> str:
    """
    Transform Studio variable syntax to Robot Framework syntax.

    Examples:
        ${Form Trigger.formData.name} -> ${formData}[name]
        ${Node Label.output.field} -> ${output}[field]
        ${formData.name} -> ${formData}[name]
    """
    # Pattern to match ${...} expressions
    pattern = r'\$\{([^}]+)\}'

    def replace_var(match):
        content = match.group(1)

        # Split by dots
        parts = content.split('.')

        if len(parts) == 1:
            # Simple variable like ${myVar}
            return f'${{{content}}}'

        # Check if first part looks like a node label (contains spaces or is "Form Trigger", etc.)
        # If so, skip it and use the rest
        if ' ' in parts[0] or parts[0] in ['Form Trigger', 'Form', 'Trigger']:
            # Skip the node label, use remaining parts
            parts = parts[1:]

        if len(parts) == 0:
            return match.group(0)  # Return original if nothing left

        if len(parts) == 1:
            # Just ${formData} or similar
            return f'${{{parts[0]}}}'

        # Convert formData.field.subfield to ${formData}[field][subfield]
        base_var = parts[0]
        accessors = ''.join(f'[{p}]' for p in parts[1:])
        return f'${{{base_var}}}{accessors}'

    return re.sub(pattern, replace_var, text)


@dataclass
class CompilerOptions:
    """Opciones de compilación"""

    output_dir: Optional[str] = None
    include_test_suite: bool = False
    optimization_level: int = 0  # 0=none, 1=basic, 2=aggressive


@dataclass
class BotPackage:
    """Representa un Bot Package compilado"""

    bot_id: str
    bot_name: str
    main_robot: str
    manifest: Dict[str, Any]
    resources: Dict[str, str]  # filename -> content
    variables: Dict[str, str]  # filename -> content


class Compiler:
    """Compilador DSL → Robot Framework"""

    def __init__(self, options: Optional[CompilerOptions] = None):
        self.options = options or CompilerOptions()
        self.validator = DSLValidator()

        # Setup Jinja2 para templates
        self.jinja_env = Environment(
            loader=PackageLoader("skuldbot.compiler", "templates"),
            autoescape=select_autoescape(),
            trim_blocks=True,
            lstrip_blocks=True,
        )
        # Register custom filter for variable syntax transformation
        self.jinja_env.filters['transform_vars'] = transform_variable_syntax

    def compile(self, dsl: Dict[str, Any]) -> BotPackage:
        """
        Compila un DSL a Bot Package

        Args:
            dsl: Diccionario con la definición DSL

        Returns:
            BotPackage compilado

        Raises:
            ValidationError: Si el DSL es inválido
        """
        # Validar DSL
        bot_def = self.validator.validate(dsl)

        # Generar componentes
        main_robot = self._generate_main_robot(bot_def)
        manifest = self._generate_manifest(bot_def)
        resources = self._generate_resources(bot_def)
        variables = self._generate_variables(bot_def)

        return BotPackage(
            bot_id=bot_def.bot.id,
            bot_name=bot_def.bot.name,
            main_robot=main_robot,
            manifest=manifest,
            resources=resources,
            variables=variables,
        )

    def compile_to_disk(self, dsl: Dict[str, Any], output_dir: str) -> Path:
        """
        Compila y guarda en disco

        Args:
            dsl: Diccionario con la definición DSL
            output_dir: Directorio de salida

        Returns:
            Path al directorio del bot package
        """
        package = self.compile(dsl)
        bot_dir = Path(output_dir) / package.bot_id
        bot_dir.mkdir(parents=True, exist_ok=True)

        # Escribir main.robot
        (bot_dir / "main.robot").write_text(package.main_robot, encoding="utf-8")

        # Escribir manifest.json
        (bot_dir / "manifest.json").write_text(
            json.dumps(package.manifest, indent=2), encoding="utf-8"
        )

        # Escribir resources
        if package.resources:
            resources_dir = bot_dir / "resources"
            resources_dir.mkdir(exist_ok=True)
            for filename, content in package.resources.items():
                (resources_dir / filename).write_text(content, encoding="utf-8")

        # Escribir variables
        if package.variables:
            variables_dir = bot_dir / "variables"
            variables_dir.mkdir(exist_ok=True)
            for filename, content in package.variables.items():
                (variables_dir / filename).write_text(content, encoding="utf-8")

        return bot_dir

    def _generate_main_robot(self, bot_def: BotDefinition) -> str:
        """Genera main.robot"""
        template = self.jinja_env.get_template("main_v2.robot.j2")
        return template.render(bot=bot_def)

    def _generate_manifest(self, bot_def: BotDefinition) -> Dict[str, Any]:
        """Genera manifest.json"""
        # Crear diccionario de configs por node_id
        node_configs = {}
        for node in bot_def.nodes:
            node_configs[node.id] = {
                "type": node.type,
                "config": node.config,
                "label": node.label,
                "description": node.description,
            }
        
        return {
            "bot_id": bot_def.bot.id,
            "bot_name": bot_def.bot.name,
            "version": bot_def.bot.version or "1.0.0",
            "dsl_version": bot_def.version,
            "description": bot_def.bot.description,
            "author": bot_def.bot.author,
            "tags": bot_def.bot.tags,
            "node_count": len(bot_def.nodes),
            "entry_point": "main.robot",
            "requires_credentials": self._has_credentials(bot_def),
            "nodes": node_configs,  # Agregar configs de nodos
        }

    def _generate_resources(self, bot_def: BotDefinition) -> Dict[str, str]:
        """Genera archivos de resources/"""
        resources = {}

        # Generar keywords.robot con keywords helper
        template = self.jinja_env.get_template("keywords.robot.j2")
        resources["keywords.robot"] = template.render(bot=bot_def)

        # Generar error_handler.robot
        template = self.jinja_env.get_template("error_handler.robot.j2")
        resources["error_handler.robot"] = template.render(bot=bot_def)

        return resources

    def _generate_variables(self, bot_def: BotDefinition) -> Dict[str, str]:
        """Genera archivos de variables/"""
        variables = {}

        if bot_def.variables:
            # Generar config.yaml con variables
            import yaml

            var_dict = {}
            for var_name, var_def in bot_def.variables.items():
                if var_def.type != "credential":
                    var_dict[var_name] = var_def.value

            variables["config.yaml"] = yaml.dump(var_dict, default_flow_style=False)

        return variables

    def _has_credentials(self, bot_def: BotDefinition) -> bool:
        """Verifica si el bot requiere credenciales"""
        for var_def in bot_def.variables.values():
            if var_def.type == "credential":
                return True
        return False

