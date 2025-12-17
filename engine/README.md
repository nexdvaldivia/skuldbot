# Skuldbot Engine

Motor de ejecución RPA compartido para Studio y BotRunner.

## Características

- 🔄 Compiler: DSL JSON → Robot Framework
- ⚙️ Executor: Motor de ejecución con hooks y callbacks
- 🎯 Nodos RPA: Librerías de automatización listas para usar
- ✅ Validación: Schemas y validación de DSL
- 🐛 Debug Mode: Breakpoints y step-by-step para Studio
- 🚀 Production Mode: Ejecución robusta para BotRunner

## Instalación

```bash
pip install skuldbot-engine
```

## Uso Básico

### Compilar DSL

```python
from skuldbot import Compiler

compiler = Compiler()
dsl = {
    "version": "1.0",
    "bot": {"id": "bot-001", "name": "Mi Bot"},
    "nodes": [...]
}

bot_package = compiler.compile(dsl)
```

### Ejecutar Bot

```python
from skuldbot import Executor, ExecutionMode

executor = Executor(mode=ExecutionMode.DEBUG)
result = executor.run_from_package(
    "path/to/bot",
    callbacks={
        "on_step": lambda step: print(f"Ejecutando: {step.node_id}"),
        "on_log": lambda log: print(log.message)
    }
)

print(f"Status: {result.status}")
print(f"Output: {result.output}")
```

## Arquitectura

```
skuldbot/
├── compiler/       # DSL → Robot Framework
├── executor/       # Motor de ejecución
├── dsl/           # Schemas y validación
└── nodes/         # Librerías de nodos RPA
```

## Desarrollo

```bash
# Clonar repositorio
git clone https://github.com/khipus/skuldbot-engine
cd skuldbot-engine

# Crear entorno virtual
python -m venv .venv
source .venv/bin/activate  # En Windows: .venv\Scripts\activate

# Instalar dependencias
pip install -e ".[dev]"

# Ejecutar tests
pytest

# Formatear código
black skuldbot tests
ruff check skuldbot tests
```

## Empaquetado y Distribución

### Dependencias del Runtime

El engine requiere:
- Python 3.10+
- Robot Framework (`robotframework`)
- Jinja2 (`jinja2`)
- (Opcional) RPA Framework (`rpaframework`) para nodos avanzados

### Virtual Environment

**IMPORTANTE**: El engine busca el ejecutable `robot` en el mismo directorio que el Python que lo ejecuta.

```python
# executor/executor.py - get_robot_executable()
# Busca 'robot' en: Path(sys.executable).parent / "robot"
```

Esto significa que:
1. **Desarrollo (Studio)**: Tauri debe usar el Python del venv (`engine/.venv/bin/python3`)
2. **Producción (BotRunner)**: Instalar robotframework en el mismo entorno

### Configuracion para Tauri (Studio)

En `studio/src-tauri/src/main.rs`, la funcion `get_python_executable()` busca:
1. `engine/.venv/bin/python3` (venv del engine)
2. `python3` del sistema (fallback)

### Configuracion para BotRunner (Produccion)

El BotRunner debe:
1. Crear un venv dedicado
2. Instalar el engine: `pip install skuldbot-engine`
3. Instalar Robot Framework: `pip install robotframework`
4. (Opcional) Instalar rpaframework para nodos RPA avanzados

```bash
# Ejemplo de setup para produccion
python -m venv /opt/skuldbot/venv
source /opt/skuldbot/venv/bin/activate
pip install skuldbot-engine robotframework
```

### Estructura de Bot Package

Cuando se empaqueta un bot para distribucion:

```
bot-001/
├── manifest.json      # Metadata del bot
├── main.robot        # Entry point
├── resources/        # Keywords y recursos
├── variables/        # Variables de configuracion
├── python/           # Librerias Python custom
└── output/           # (runtime) Logs y reportes
```

## Licencia

MIT License - Ver [LICENSE](LICENSE) para más detalles.

