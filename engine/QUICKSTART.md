# Quickstart Guide

Guía rápida para empezar con **skuldbot-engine** en menos de 5 minutos.

## 1. Instalación

```bash
# Clonar repositorio
git clone https://github.com/khipus/skuldbot-engine
cd skuldbot-engine

# Crear entorno virtual
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Instalar
pip install -e ".[dev]"
```

## 2. Primer Bot (Python API)

Crea `my_first_bot.py`:

```python
from skuldbot import Executor, ExecutionMode

# Define tu bot en DSL
dsl = {
    "version": "1.0",
    "bot": {
        "id": "hello-bot",
        "name": "Mi Primer Bot"
    },
    "nodes": [
        {
            "id": "greet",
            "type": "control.log",
            "config": {"message": "¡Hola desde Skuldbot!"},
            "outputs": {"success": "greet", "error": "greet"}
        }
    ]
}

# Ejecuta
executor = Executor(mode=ExecutionMode.DEBUG)
result = executor.run_from_dsl(dsl)

print(f"Status: {result.status}")
print(f"Success: {result.success}")
```

Ejecuta:

```bash
python my_first_bot.py
```

## 3. Bot con Browser

```python
from skuldbot import Executor

dsl = {
    "version": "1.0",
    "bot": {"id": "web-bot", "name": "Web Bot"},
    "nodes": [
        {
            "id": "open",
            "type": "browser.open",
            "config": {
                "url": "https://example.com",
                "browser": "chromium"
            },
            "outputs": {"success": "close", "error": "error"}
        },
        {
            "id": "close",
            "type": "browser.close",
            "config": {},
            "outputs": {"success": "close", "error": "error"}
        },
        {
            "id": "error",
            "type": "control.log",
            "config": {"message": "Error!"},
            "outputs": {"success": "error", "error": "error"}
        }
    ]
}

executor = Executor()
result = executor.run_from_dsl(dsl)
```

## 4. Compilar a Disco

```python
from skuldbot import Compiler

dsl = { ... }  # Tu DSL

compiler = Compiler()
bot_dir = compiler.compile_to_disk(dsl, "./bots")

print(f"Bot compilado en: {bot_dir}")
# Ahora puedes inspeccionar los archivos .robot generados
```

## 5. Usar Callbacks

```python
from skuldbot import Executor

def on_log(log):
    print(f"[{log.level}] {log.message}")

def on_complete(result):
    print(f"Bot terminó: {result.status}")

executor = Executor()
result = executor.run_from_dsl(
    dsl,
    callbacks={
        "on_log": on_log,
        "on_complete": on_complete
    }
)
```

## 6. Variables y Configuración

```python
dsl = {
    "version": "1.0",
    "bot": {"id": "config-bot", "name": "Bot con Variables"},
    "nodes": [...],
    "variables": {
        "api_url": {
            "type": "string",
            "value": "https://api.example.com"
        },
        "max_retries": {
            "type": "number",
            "value": 3
        }
    }
}

# Pasar variables en runtime
executor = Executor()
result = executor.run_from_dsl(
    dsl,
    variables={"custom_var": "value"}
)
```

## 7. Testing

```bash
# Ejecutar todos los tests
pytest

# Con cobertura
pytest --cov=skuldbot --cov-report=html

# Test específico
pytest tests/test_dsl.py -v
```

## 8. Ejemplos Incluidos

Revisa la carpeta `examples/`:

```bash
# Bot simple
python examples/simple_bot.py

# Automatización browser
python examples/browser_automation.py
```

## Siguientes Pasos

1. Lee la [Documentación Completa](./README.md)
2. Revisa la [Especificación del DSL](./docs/DSL_SPEC.md)
3. Explora la [Arquitectura](./docs/ARCHITECTURE.md)
4. Únete a la comunidad (Discord - próximamente)

## Problemas Comunes

### Error: `robot` command not found

```bash
pip install robotframework rpaframework
```

### Error al ejecutar browser

```bash
# Instalar navegadores
rfbrowser init
```

### Import error

Asegúrate de haber instalado en modo editable:

```bash
pip install -e .
```

## ¿Necesitas Ayuda?

- 📖 [Documentación](./README.md)
- 🐛 [Reportar Bug](https://github.com/khipus/skuldbot-engine/issues)
- 💡 [Feature Request](https://github.com/khipus/skuldbot-engine/issues)
- 💬 Discord (próximamente)

¡Happy botting! 🤖

