# Ejemplos de Skuldbot Engine

Esta carpeta contiene ejemplos de uso del engine.

## Ejemplos Disponibles

### 1. `simple_bot.py`
Bot básico que demuestra:
- Compilación de DSL
- Ejecución con callbacks
- Manejo de logs

```bash
python examples/simple_bot.py
```

### 2. `browser_automation.py`
Automatización web que demuestra:
- Nodos de browser
- Navegación y scraping
- Callbacks de ejecución

```bash
python examples/browser_automation.py
```

## Requisitos

```bash
pip install skuldbot-engine
```

Para ejemplos de browser, también necesitas:

```bash
# Instalar navegadores
rfbrowser init
```

## Crear tu Propio Bot

```python
from skuldbot import Executor, ExecutionMode

# Define tu DSL
dsl = {
    "version": "1.0",
    "bot": {"id": "my-bot", "name": "Mi Bot"},
    "nodes": [
        {
            "id": "node-1",
            "type": "control.log",
            "config": {"message": "¡Hola mundo!"},
            "outputs": {"success": "node-1", "error": "node-1"}
        }
    ]
}

# Ejecuta
executor = Executor(mode=ExecutionMode.DEBUG)
result = executor.run_from_dsl(dsl)

print(f"Estado: {result.status}")
```

## Más Información

- [Documentación completa](https://skuldbot.readthedocs.io)
- [Repositorio](https://github.com/khipus/skuldbot-engine)

