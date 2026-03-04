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


def escape_for_robot(text: str) -> str:
    """
    Escape special characters for Robot Framework.
    Converts newlines to literal \\n so they don't break the .robot file structure.
    """
    if not isinstance(text, str):
        return str(text) if text is not None else ''
    # Replace actual newlines with escaped \\n
    # Robot Framework will interpret \\n as literal newline in strings
    return text.replace('\r\n', '\\n').replace('\n', '\\n').replace('\r', '\\n')


def sanitize_node_identifier(node_id: str) -> str:
    """
    Normalize node IDs to Robot-safe identifier segments.

    Keeps only [A-Za-z0-9_] and replaces everything else with "_".
    """
    if not isinstance(node_id, str):
        node_id = str(node_id) if node_id is not None else ""
    return re.sub(r"[^A-Za-z0-9_]", "_", node_id)


def transform_variable_syntax(text) -> str:
    """
    Transform Studio variable syntax to Robot Framework syntax.

    Examples:
        ${node:web.open_browser-1|output} -> ${NODE_web_open_browser_1}[output]
        ${node:excel.read_range-1|rows[i].amount} -> ${NODE_excel_read_range_1}[rows][i][amount]
        ${formData.name} -> ${formData}[name]
        ${LAST_ERROR} -> ${LAST_ERROR}  (global vars unchanged)
    """
    # Handle non-string inputs (e.g., dicts from config)
    if text is None:
        return ''
    if isinstance(text, dict):
        # Convert dict to JSON string
        return json.dumps(text)
    if not isinstance(text, str):
        return str(text)
    
    def path_to_accessors(path: str) -> str:
        """
        Convert dot/bracket paths to Robot Framework dict accessors.
        Example: "row[i].name" -> "[row][i][name]"
        """
        if not path:
            return ""

        normalized = path.strip()
        if normalized.startswith('.'):
            normalized = normalized[1:]

        tokens = re.findall(r'([^\.\[\]]+)|\[([^\]]+)\]', normalized)
        parts = [token_a or token_b for token_a, token_b in tokens if (token_a or token_b)]
        return ''.join(f'[{p}]' for p in parts)

    # Pattern to match ${...} expressions
    pattern = r'\$\{([^}]+)\}'

    def replace_var(match):
        content = match.group(1)

        # Global variables - return as-is
        global_vars = ['LAST_ERROR', 'LAST_ERROR_NODE', 'LAST_ERROR_TYPE', 'BOT_ID', 'BOT_NAME', 'BOT_STATUS',
                       'EXCEL_DATA', 'EXCEL_ROW_COUNT', 'FILE_CONTENT', 'HTTP_RESPONSE', 'HTTP_STATUS',
                       'CELL_VALUE', 'FILE_EXISTS', 'LAST_TEXT', 'LAST_ATTRIBUTE', 'JS_RESULT']
        if content in global_vars:
            return f'${{{content}}}'

        # Canonical Studio syntax (node-id based):
        # ${node:<node_id>|<path>}
        if content.startswith('node:') and '|' in content:
            node_id, path = content[5:].split('|', 1)
            node_id = node_id.strip()
            path = path.strip()

            node_var_name = f'NODE_{sanitize_node_identifier(node_id)}'
            accessors = path_to_accessors(path)
            return f'${{{node_var_name}}}{accessors}'

        # Split by dots
        parts = content.split('.')

        if len(parts) == 1:
            # Simple variable like ${myVar}
            return f'${{{content}}}'

        if len(parts) == 0:
            return match.group(0)  # Return original if nothing left

        if len(parts) == 1:
            # Just ${formData} or similar
            return f'${{{parts[0]}}}'

        # Convert formData.field.subfield to ${formData}[field][subfield]
        base_var = parts[0]
        accessors = path_to_accessors('.'.join(parts[1:]))
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
    warnings: list = None  # Compilation warnings (non-blocking)

    def __post_init__(self):
        if self.warnings is None:
            self.warnings = []


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
        # Register custom filters for variable syntax transformation
        self.jinja_env.filters['transform_vars'] = lambda text: escape_for_robot(transform_variable_syntax(text))
        # Filter to escape newlines without variable transformation
        self.jinja_env.filters['escape_newlines'] = escape_for_robot
        # Normalize node IDs for Robot keyword/variable names.
        self.jinja_env.filters['node_id_safe'] = sanitize_node_identifier

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

        # Get warnings from validation
        warnings = self.validator.get_warnings()

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
            warnings=warnings,
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

        # Clean old files before writing new ones
        if bot_dir.exists():
            import shutil
            # Remove old .robot and .skb files to avoid conflicts
            for old_file in bot_dir.glob("*.robot"):
                old_file.unlink()
            for old_file in bot_dir.glob("*.skb"):
                old_file.unlink()
            # Clean resources directory
            resources_dir = bot_dir / "resources"
            if resources_dir.exists():
                shutil.rmtree(resources_dir)

        bot_dir.mkdir(parents=True, exist_ok=True)

        # Escribir main.skb (SkuldBot format - Robot Framework compatible)
        (bot_dir / "main.skb").write_text(package.main_robot, encoding="utf-8")

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
            "entry_point": "main.skb",
            "requires_credentials": self._has_credentials(bot_def),
            "nodes": node_configs,  # Agregar configs de nodos
        }

    def _generate_resources(self, bot_def: BotDefinition) -> Dict[str, str]:
        """Genera archivos de resources/"""
        resources = {}

        # Generar keywords.resource con keywords helper
        template = self.jinja_env.get_template("keywords.robot.j2")
        resources["keywords.resource"] = template.render(bot=bot_def)

        # Generar error_handler.resource
        template = self.jinja_env.get_template("error_handler.robot.j2")
        resources["error_handler.resource"] = template.render(bot=bot_def)

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
