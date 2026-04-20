#!/usr/bin/env python3
"""
Test simple del engine - Sin ejecutar Robot Framework
Solo prueba compilación y validación
"""

import json
from skuldbot import Compiler, DSLValidator
from skuldbot.dsl import BotDefinition

print("=" * 70)
print("  SKULDBOT ENGINE - TEST SIMPLE")
print("=" * 70)
print()

# DSL de prueba
dsl = {
    "version": "1.0",
    "bot": {
        "id": "test-bot-001",
        "name": "Bot de Prueba Simple",
        "description": "Este es un bot de prueba",
        "version": "1.0.0",
        "author": "Test User",
        "tags": ["test", "demo"]
    },
    "nodes": [
        {
            "id": "start",
            "type": "control.log",
            "config": {
                "message": "Iniciando bot...",
                "level": "INFO"
            },
            "outputs": {
                "success": "process",
                "error": "error-handler"
            }
        },
        {
            "id": "process",
            "type": "control.wait",
            "config": {
                "seconds": 2
            },
            "outputs": {
                "success": "end",
                "error": "error-handler"
            }
        },
        {
            "id": "end",
            "type": "control.log",
            "config": {
                "message": "Bot completado exitosamente!",
                "level": "INFO"
            },
            "outputs": {
                "success": "end",
                "error": "error-handler"
            }
        },
        {
            "id": "error-handler",
            "type": "control.log",
            "config": {
                "message": "Error en el bot",
                "level": "ERROR"
            },
            "outputs": {
                "success": "error-handler",
                "error": "error-handler"
            }
        }
    ],
    "variables": {
        "environment": {
            "type": "string",
            "value": "test"
        },
        "max_retries": {
            "type": "number",
            "value": 3
        }
    },
    "start_node": "start"
}

# Test 1: Validación
print("TEST 1: Validando DSL")
print("-" * 70)
try:
    validator = DSLValidator()
    bot_def = validator.validate(dsl)
    print(f"✅ DSL válido")
    print(f"   Bot ID: {bot_def.bot.id}")
    print(f"   Bot Name: {bot_def.bot.name}")
    print(f"   Nodos: {len(bot_def.nodes)}")
    print(f"   Variables: {len(bot_def.variables)}")
except Exception as e:
    print(f"❌ Error en validación: {e}")
    exit(1)

print()

# Test 2: Compilación
print("TEST 2: Compilando DSL a Bot Package")
print("-" * 70)
try:
    compiler = Compiler()
    package = compiler.compile(dsl)
    
    print(f"✅ Compilación exitosa")
    print(f"   Bot ID: {package.bot_id}")
    print(f"   Bot Name: {package.bot_name}")
    print(f"   Archivos generados:")
    print(f"     - main.robot: {len(package.main_robot)} caracteres")
    print(f"     - resources: {len(package.resources)} archivos")
    print(f"     - variables: {len(package.variables)} archivos")
    
    # Mostrar manifest
    print(f"\n   Manifest:")
    print(f"     - Version: {package.manifest['version']}")
    print(f"     - Nodos en manifest: {len(package.manifest.get('nodes', {}))}")
    
except Exception as e:
    print(f"❌ Error en compilación: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

print()

# Test 3: Compilar a disco
print("TEST 3: Compilando a disco")
print("-" * 70)
try:
    import os
    import shutil
    
    output_dir = "./test_output"
    
    # Limpiar si existe
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
    
    bot_dir = compiler.compile_to_disk(dsl, output_dir)
    
    print(f"✅ Bot compilado en: {bot_dir}")
    
    # Listar archivos
    print(f"\n   Archivos creados:")
    for root, dirs, files in os.walk(bot_dir):
        level = root.replace(str(bot_dir), '').count(os.sep)
        indent = ' ' * 2 * level
        print(f'{indent}{os.path.basename(root)}/')
        subindent = ' ' * 2 * (level + 1)
        for file in files:
            file_path = os.path.join(root, file)
            file_size = os.path.getsize(file_path)
            print(f'{subindent}{file} ({file_size} bytes)')
    
    # Verificar manifest
    manifest_path = bot_dir / "manifest.json"
    if manifest_path.exists():
        with open(manifest_path) as f:
            manifest_data = json.load(f)
        print(f"\n   ✅ Manifest.json verificado:")
        print(f"      - Bot: {manifest_data['bot_name']}")
        print(f"      - Nodos: {manifest_data['node_count']}")
        print(f"      - Configs en manifest: {len(manifest_data.get('nodes', {}))}")
    
except Exception as e:
    print(f"❌ Error compilando a disco: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

print()
print("=" * 70)
print("✅ TODOS LOS TESTS PASARON")
print("=" * 70)
print()
print("El engine está funcionando correctamente!")
print()
print("Próximos pasos:")
print("  1. Para ejecutar bots reales, instala Robot Framework:")
print("     pip install robotframework rpaframework")
print()
print("  2. Ejecuta el bot compilado:")
print("     cd test_output/test-bot-001")
print("     robot main.robot")
print()
print("  3. Ve ejemplos más avanzados en:")
print("     examples/simple_bot.py")
print("     examples/browser_automation.py")
print()

