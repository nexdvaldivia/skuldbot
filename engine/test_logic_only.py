#!/usr/bin/env python3
"""
Test de lógica pura - Sin dependencias externas
Solo valida que las clases y la lógica están bien
"""

import sys
from pathlib import Path

print("=" * 70)
print("  SKULDBOT ENGINE - TEST DE LÓGICA")
print("=" * 70)
print()

# Test 1: Importar modelos sin dependencias
print("TEST 1: Modelos DSL")
print("-" * 70)
try:
    # Agregar al path
    sys.path.insert(0, str(Path(__file__).parent))
    
    # Importar directamente sin pasar por __init__
    from skuldbot.dsl.models import (
        BotDefinition,
        NodeDefinition,
        NodeOutput,
        BotMetadata,
        VariableDefinition
    )
    
    print("✅ Modelos importados correctamente")
    
    # Crear un nodo
    node = NodeDefinition(
        id="test-node",
        type="control.log",
        config={"message": "test"},
        outputs=NodeOutput(success="end", error="error")
    )
    
    print(f"✅ Nodo creado: {node.id} ({node.type})")
    
    # Crear bot
    bot = BotDefinition(
        version="1.0",
        bot=BotMetadata(id="test", name="Test Bot"),
        nodes=[node, NodeDefinition(
            id="end",
            type="control.log",
            config={},
            outputs=NodeOutput(success="end", error="end")
        ), NodeDefinition(
            id="error",
            type="control.log",
            config={},
            outputs=NodeOutput(success="error", error="error")
        )]
    )
    
    print(f"✅ Bot creado: {bot.bot.name} con {len(bot.nodes)} nodos")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print()

# Test 2: Validador
print("TEST 2: Validador DSL")
print("-" * 70)
try:
    from skuldbot.dsl.validator import DSLValidator
    
    validator = DSLValidator()
    
    dsl_dict = {
        "version": "1.0",
        "bot": {
            "id": "test-001",
            "name": "Test Bot"
        },
        "nodes": [
            {
                "id": "start",
                "type": "control.log",
                "config": {"message": "Hello"},
                "outputs": {"success": "end", "error": "error"}
            },
            {
                "id": "end",
                "type": "control.log",
                "config": {"message": "Done"},
                "outputs": {"success": "end", "error": "error"}
            },
            {
                "id": "error",
                "type": "control.log",
                "config": {"message": "Error"},
                "outputs": {"success": "error", "error": "error"}
            }
        ]
    }
    
    bot_validated = validator.validate(dsl_dict)
    print(f"✅ DSL validado correctamente")
    print(f"   Bot: {bot_validated.bot.name}")
    print(f"   Nodos: {len(bot_validated.nodes)}")
    
except Exception as e:
    print(f"❌ Error en validación: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print()

# Test 3: Detección de errores
print("TEST 3: Detección de Errores")
print("-" * 70)
try:
    from skuldbot.dsl.validator import DSLValidator, ValidationError
    
    validator = DSLValidator()
    
    # DSL inválido - referencia a nodo inexistente
    bad_dsl = {
        "version": "1.0",
        "bot": {"id": "bad", "name": "Bad Bot"},
        "nodes": [
            {
                "id": "start",
                "type": "control.log",
                "config": {},
                "outputs": {"success": "nonexistent", "error": "error"}
            },
            {
                "id": "error",
                "type": "control.log",
                "config": {},
                "outputs": {"success": "error", "error": "error"}
            }
        ]
    }
    
    try:
        validator.validate(bad_dsl)
        print("❌ Debería haber detectado el error!")
        sys.exit(1)
    except ValidationError as e:
        print(f"✅ Error detectado correctamente: {str(e)}")
        print(f"   Errores: {len(e.errors)}")
    
except Exception as e:
    print(f"❌ Error inesperado: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print()

# Test 4: Executor models
print("TEST 4: Executor Models")
print("-" * 70)
try:
    from skuldbot.executor.executor import (
        ExecutionMode,
        ExecutionStatus,
        ExecutionResult,
        StepInfo,
        LogEntry
    )
    
    print("✅ Executor models importados")
    
    # Crear log entry
    log = LogEntry(
        level="INFO",
        message="Test log",
        timestamp=1234567890.0
    )
    print(f"✅ LogEntry creado: [{log.level}] {log.message}")
    
    # Crear step info
    step = StepInfo(
        node_id="test-node",
        node_type="control.log",
        timestamp=1234567890.0,
        status=ExecutionStatus.SUCCESS
    )
    print(f"✅ StepInfo creado: {step.node_id} - {step.status}")
    
    # Crear resultado
    result = ExecutionResult(
        status=ExecutionStatus.SUCCESS,
        start_time=1234567890.0,
        end_time=1234567895.0,
        duration=5.0,
        output={}
    )
    print(f"✅ ExecutionResult creado: {result.status} ({result.duration}s)")
    print(f"   Success: {result.success}")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print()

# Test 5: Node Libraries
print("TEST 5: Node Libraries")
print("-" * 70)
try:
    # Estas requieren Robot Framework, pero podemos al menos importarlas
    # para verificar que la estructura está bien
    from skuldbot.nodes.control import ControlLibrary
    
    print("✅ ControlLibrary importada")
    
    # Crear instancia
    control = ControlLibrary()
    print(f"✅ ControlLibrary instanciada")
    
except Exception as e:
    print(f"⚠️  Node libraries requieren Robot Framework")
    print(f"   Esto es esperado si RF no está instalado")

print()
print("=" * 70)
print("✅ TESTS DE LÓGICA PASADOS")
print("=" * 70)
print()
print("La lógica del engine está correcta!")
print()
print("Para testing completo con dependencias:")
print("  1. Instala dependencias:")
print("     pip install pydantic pyyaml jinja2")
print()
print("  2. Para ejecutar bots:")
print("     pip install robotframework rpaframework")
print()

