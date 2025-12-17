# Skuldbot Engine - Referencia Tecnica

## Descripcion General

El Engine es el motor de ejecucion de Skuldbot. Convierte el DSL JSON en archivos Robot Framework
y los ejecuta. Es un paquete Python que puede usarse de forma independiente o integrado con el Studio.

---

## Instalacion

### Dependencias Base

```bash
cd engine
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

Esto instala:
- `robotframework>=6.1.0` - Motor de ejecucion
- `pydantic>=2.0.0` - Validacion de datos
- `pyyaml>=6.0` - Configuracion
- `jinja2>=3.1.0` - Templates

### Con RPA Framework (opcional)

```bash
pip install -e ".[rpa]"
```

Esto agrega `rpaframework>=27.0.0` con capacidades completas de RPA.

**Nota macOS**: Requiere Xcode completo (no solo Command Line Tools).

---

## Arquitectura del Engine

```
skuldbot/
├── __init__.py           # Exporta compiler y executor
├── compiler/
│   ├── __init__.py
│   └── compiler.py       # DSLCompiler class
├── executor/
│   ├── __init__.py
│   └── executor.py       # BotExecutor class
├── dsl/
│   ├── __init__.py
│   └── models.py         # Pydantic models para DSL
└── nodes/
    ├── __init__.py
    └── registry.py       # Registro de nodos disponibles
```

---

## Uso Programatico

### Compilar DSL

```python
from skuldbot import compiler

dsl = {
    "version": "1.0",
    "bot": {
        "id": "bot-001",
        "name": "Test Bot"
    },
    "nodes": [
        {
            "id": "node-1",
            "type": "trigger.manual",
            "config": {},
            "outputs": {"success": "node-2"}
        },
        {
            "id": "node-2",
            "type": "browser.open",
            "config": {"url": "https://example.com"},
            "outputs": {"success": None, "error": None}
        }
    ],
    "edges": []
}

# Compilar
result = compiler.compile(dsl)
# result.output_path -> ruta al Bot Package generado
# result.robot_file -> contenido del archivo .robot
```

### Ejecutar Bot

```python
from skuldbot import executor

result = executor.run("/path/to/bot-package")

print(result.status)      # "PASS" o "FAIL"
print(result.logs)        # Lista de LogEntry
print(result.output_xml)  # Ruta al output.xml de Robot Framework
```

### Validar DSL

```python
from skuldbot.dsl import validate_dsl

errors = validate_dsl(dsl)
if errors:
    for error in errors:
        print(f"{error.path}: {error.message}")
else:
    print("DSL valido")
```

---

## Modelos DSL (Pydantic)

### BotInfo

```python
class BotInfo(BaseModel):
    id: str
    name: str
    description: str = ""
```

### Node

```python
class Node(BaseModel):
    id: str
    type: str                           # ej: "browser.open"
    config: dict[str, Any] = {}
    position: Position | None = None
    outputs: dict[str, str | None] = {} # {"success": "node-2", "error": None}
```

### Edge

```python
class Edge(BaseModel):
    id: str
    source: str          # node id
    target: str          # node id
    sourceHandle: str    # "success" o "error"
```

### DSL Completo

```python
class DSL(BaseModel):
    version: str = "1.0"
    bot: BotInfo
    nodes: list[Node]
    edges: list[Edge] = []
    variables: dict[str, Any] = {}
```

---

## Registro de Nodos

### Estructura de un nodo

```python
@register_node("browser.open")
class BrowserOpenNode:
    label = "Open Browser"
    category = "browser"
    icon = "globe"
    description = "Opens a browser and navigates to URL"

    config_schema = [
        ConfigField(
            name="url",
            type="text",
            label="URL",
            required=True,
            placeholder="https://example.com"
        ),
        ConfigField(
            name="browser",
            type="select",
            label="Browser",
            default="chromium",
            options=[
                {"value": "chromium", "label": "Chromium"},
                {"value": "firefox", "label": "Firefox"},
                {"value": "webkit", "label": "WebKit"}
            ]
        )
    ]

    def to_robot(self, config: dict) -> str:
        """Genera codigo Robot Framework"""
        return f"""
    Open Browser    {config['url']}    {config['browser']}
"""
```

### Tipos de ConfigField

| Tipo | Descripcion | Propiedades extra |
|------|-------------|-------------------|
| `text` | Campo de texto | `placeholder` |
| `textarea` | Texto multilinea | `rows` |
| `number` | Campo numerico | `min`, `max` |
| `boolean` | Switch on/off | - |
| `select` | Lista desplegable | `options` |

---

## Compilacion DSL → Robot Framework

### Proceso

1. **Validacion**: Verifica estructura del DSL con Pydantic
2. **Ordenamiento**: Ordena nodos topologicamente
3. **Generacion**: Convierte cada nodo a keywords Robot Framework
4. **Templates**: Usa Jinja2 para generar archivos .robot
5. **Empaquetado**: Crea Bot Package con todo lo necesario

### Ejemplo de salida

**Input DSL:**
```json
{
  "nodes": [
    {"id": "1", "type": "trigger.manual", "outputs": {"success": "2"}},
    {"id": "2", "type": "browser.open", "config": {"url": "https://example.com"}}
  ]
}
```

**Output main.robot:**
```robot
*** Settings ***
Library    Browser

*** Test Cases ***
Main Flow
    [Documentation]    Generated by Skuldbot Engine

    # Node: Manual Trigger
    Log    Starting bot execution

    # Node: Open Browser
    New Browser    chromium    headless=false
    New Page    https://example.com
```

---

## Bot Package

### Estructura

```
bot-001.zip
├── manifest.json       # Metadata del bot
├── main.robot          # Flujo principal
├── resources/
│   ├── keywords.robot  # Keywords reutilizables
│   └── variables.robot # Variables globales
├── python/
│   └── custom_lib.py   # Librerias Python custom
└── requirements.txt    # Dependencias Python
```

### manifest.json

```json
{
  "id": "bot-001",
  "name": "Mi Bot",
  "version": "1.0.0",
  "engine_version": "0.1.0",
  "created_at": "2024-12-17T10:00:00Z",
  "entry_point": "main.robot",
  "variables": {},
  "secrets": ["API_KEY", "PASSWORD"]
}
```

---

## Ejecucion

### Proceso

1. **Desempaquetado**: Extrae Bot Package a directorio temporal
2. **Preparacion**: Instala dependencias si hay requirements.txt
3. **Ejecucion**: Llama a `robot` con los archivos .robot
4. **Captura**: Captura stdout/stderr y output.xml
5. **Reporte**: Genera resultado estructurado

### Resultado de ejecucion

```python
class ExecutionResult:
    status: Literal["PASS", "FAIL"]
    start_time: datetime
    end_time: datetime
    duration_ms: int
    logs: list[LogEntry]
    output_xml: str | None
    report_html: str | None
    error: str | None
```

### LogEntry

```python
class LogEntry:
    timestamp: datetime
    level: Literal["DEBUG", "INFO", "WARN", "ERROR"]
    message: str
    node_id: str | None
    details: dict | None
```

---

## Variables y Secrets

### Variables en DSL

```json
{
  "variables": {
    "BASE_URL": "https://example.com",
    "TIMEOUT": 30,
    "RETRY_COUNT": 3
  }
}
```

### Referencias a Secrets

```json
{
  "nodes": [{
    "type": "browser.fill",
    "config": {
      "selector": "#password",
      "value": "${vault.PASSWORD}"
    }
  }]
}
```

Los secrets se resuelven en runtime desde:
1. Variables de entorno
2. Orchestrator vault (en produccion)
3. Archivo .env local (desarrollo)

---

## Integracion con Tauri

### Comandos disponibles

```rust
// main.rs

#[tauri::command]
fn compile_dsl(dsl: String) -> Result<CompileResult, String> {
    // Llama a: python -m skuldbot.cli compile --dsl <dsl>
}

#[tauri::command]
fn run_bot(bot_path: String) -> Result<RunResult, String> {
    // Llama a: python -m skuldbot.cli run --bot <path>
}

#[tauri::command]
fn validate_dsl(dsl: String) -> Result<ValidationResult, String> {
    // Llama a: python -m skuldbot.cli validate --dsl <dsl>
}
```

### Comunicacion

```
[React/TypeScript]
       │
       │ invoke("compile_dsl", { dsl: JSON.stringify(dsl) })
       ▼
[Tauri/Rust]
       │
       │ Command::new("python")
       │   .args(["-m", "skuldbot.cli", "compile", "--dsl", dsl])
       │   .output()
       ▼
[Python Engine]
       │
       │ DSLCompiler(dsl).compile()
       ▼
[Bot Package / Result JSON]
```

---

## Desarrollo

### Ejecutar tests

```bash
cd engine
source .venv/bin/activate
pytest
```

### Agregar un nuevo nodo

1. Crear archivo en `skuldbot/nodes/`:

```python
# skuldbot/nodes/my_node.py
from skuldbot.nodes.registry import register_node, ConfigField

@register_node("custom.my_action")
class MyActionNode:
    label = "My Action"
    category = "custom"
    icon = "zap"
    description = "Does something custom"

    config_schema = [
        ConfigField(name="param1", type="text", label="Parameter 1")
    ]

    def to_robot(self, config: dict) -> str:
        return f"    Log    Executing with {config['param1']}"
```

2. Registrar en `skuldbot/nodes/__init__.py`:

```python
from .my_node import MyActionNode
```

3. Agregar al Studio en `nodeTemplates.ts`

---

## Referencias

- [Robot Framework User Guide](https://robotframework.org/robotframework/latest/RobotFrameworkUserGuide.html)
- [RPA Framework Documentation](https://rpaframework.org/)
- [Pydantic v2 Documentation](https://docs.pydantic.dev/latest/)
