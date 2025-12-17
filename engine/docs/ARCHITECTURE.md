# Arquitectura de Skuldbot Engine

## Visión General

Skuldbot Engine es el motor de ejecución compartido que alimenta tanto el Studio (editor visual) como el BotRunner (ejecución en producción).

## Componentes Principales

```
┌─────────────────────────────────────────┐
│         Skuldbot Engine                 │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────┐  ┌──────────┐           │
│  │   DSL    │  │ Compiler │           │
│  │ Validator│─▶│          │           │
│  └──────────┘  └─────┬────┘           │
│                      │                 │
│                      ▼                 │
│              ┌──────────────┐          │
│              │ Bot Package  │          │
│              │ (.robot + manifest)     │
│              └──────┬───────┘          │
│                     │                  │
│                     ▼                  │
│              ┌──────────────┐          │
│              │  Executor    │          │
│              │ (Robot FW)   │          │
│              └──────┬───────┘          │
│                     │                  │
│              ┌──────▼───────┐          │
│              │  Node Libs   │          │
│              │  - Browser   │          │
│              │  - Excel     │          │
│              │  - Control   │          │
│              └──────────────┘          │
└─────────────────────────────────────────┘
```

## Flujo de Datos

### 1. DSL (Domain Specific Language)

JSON que define el flujo del bot:

```json
{
  "version": "1.0",
  "bot": {"id": "...", "name": "..."},
  "nodes": [...],
  "variables": {...}
}
```

**Responsabilidades:**
- Schema estructurado con Pydantic
- Validación de referencias entre nodos
- Detección de ciclos
- Verificación de alcanzabilidad

### 2. Compiler

Transforma DSL → Robot Framework.

**Input:** DSL JSON
**Output:** Bot Package

Bot Package contiene:
- `main.robot` - Entry point
- `resources/` - Keywords y helpers
- `variables/` - Configuración
- `manifest.json` - Metadata

**Proceso:**
1. Valida DSL
2. Genera templates Jinja2
3. Crea estructura de archivos
4. Empaqueta recursos

### 3. Executor

Motor de ejecución con dos modos:

**Debug Mode (Studio):**
- Breakpoints
- Step-by-step
- Callbacks en tiempo real
- Logs verbose

**Production Mode (BotRunner):**
- Sin overhead de debug
- Logs estructurados
- Retry automático
- Envío a Orchestrator

**Callbacks:**
```python
{
    "on_start": lambda: ...,
    "on_step": lambda step: ...,
    "on_log": lambda log: ...,
    "on_complete": lambda result: ...,
    "on_error": lambda error: ...
}
```

### 4. Node Libraries

Librerías Python para Robot Framework.

**Browser Library:**
- Open, click, fill, wait
- Screenshots en error
- Retry automático

**Excel Library:**
- Open, read, write
- Filtrado de datos
- Export a diccionarios

**Control Library:**
- Logging
- Variables
- Condiciones
- Wait

## Patrones de Diseño

### 1. Template Method (Compiler)

El Compiler usa Jinja2 templates para generar código Robot Framework consistente.

### 2. Observer (Executor)

El Executor notifica eventos vía callbacks sin acoplamiento.

### 3. Strategy (Execution Modes)

ExecutionMode.DEBUG vs PRODUCTION cambian comportamiento sin cambiar interfaz.

### 4. Facade (API pública)

```python
from skuldbot import Compiler, Executor
```

API simple que oculta complejidad interna.

## Extensibilidad

### Agregar Nuevos Nodos

1. Crear nueva librería en `skuldbot/nodes/`
2. Heredar de Robot Framework Library
3. Usar decorador `@keyword`
4. Agregar template en `compiler/templates/`

Ejemplo:

```python
# skuldbot/nodes/pdf.py
from robot.api.deco import keyword, library

@library(scope="GLOBAL")
class PDFLibrary:
    @keyword("Extract Text From PDF")
    def extract_text(self, path: str):
        # Implementación
        pass
```

### Agregar Validaciones

Extender `DSLValidator`:

```python
class CustomValidator(DSLValidator):
    def _validate_custom_rules(self, bot: BotDefinition):
        # Reglas custom
        pass
```

## Testing

```
tests/
├── test_dsl.py        # Validación de DSL
├── test_compiler.py   # Compilación
├── test_executor.py   # Ejecución
└── conftest.py        # Fixtures
```

Coverage objetivo: >80%

## Performance

### Compiler
- Compilación de bot promedio: <100ms
- Cache de templates Jinja2

### Executor
- Overhead de callbacks: <5ms por evento
- Robot Framework: depende del bot

## Seguridad

- No eval() en código generado
- Variables sensibles via vault reference
- Sandbox execution (opcional con Docker)
- Input validation en todos los nodos

## Roadmap Técnico

### v0.2
- [ ] Parser de output.xml (resultados detallados)
- [ ] Breakpoints en debug mode
- [ ] Más nodos (PDF, API, Email)

### v0.3
- [ ] Hot reload en Studio
- [ ] Profiling de performance
- [ ] Distributed tracing

### v0.4
- [ ] Python Project Executor
- [ ] Custom node marketplace
- [ ] Visual debugger avanzado

