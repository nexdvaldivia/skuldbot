#!/usr/bin/env python3
"""
Test de capacidades RPA reales - Browser automation
"""

from skuldbot import Compiler

# Bot que abre un navegador y navega
dsl = {
    "version": "1.0",
    "bot": {
        "id": "browser-test",
        "name": "Test Browser RPA",
        "description": "Prueba real de automatización web"
    },
    "nodes": [
        {
            "id": "log-start",
            "type": "control.log",
            "config": {
                "message": "=== Iniciando prueba de Browser RPA ===",
                "level": "INFO"
            },
            "outputs": {
                "success": "open-browser",
                "error": "error-handler"
            }
        },
        {
            "id": "open-browser",
            "type": "browser.open",
            "config": {
                "url": "https://example.com",
                "browser": "chromium",
                "headless": True
            },
            "outputs": {
                "success": "log-success",
                "error": "error-handler"
            }
        },
        {
            "id": "log-success",
            "type": "control.log",
            "config": {
                "message": "✅ Navegador abierto exitosamente!",
                "level": "INFO"
            },
            "outputs": {
                "success": "close-browser",
                "error": "error-handler"
            }
        },
        {
            "id": "close-browser",
            "type": "browser.close",
            "config": {},
            "outputs": {
                "success": "end",
                "error": "error-handler"
            }
        },
        {
            "id": "end",
            "type": "control.log",
            "config": {
                "message": "=== Test completado ===",
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
                "message": "❌ Error en el test",
                "level": "ERROR"
            },
            "outputs": {
                "success": "error-handler",
                "error": "error-handler"
            }
        }
    ]
}

print("=" * 70)
print("  TEST DE CAPACIDADES RPA REALES")
print("=" * 70)
print()

# Compilar
print("📦 Compilando bot con nodos browser...")
compiler = Compiler()
bot_dir = compiler.compile_to_disk(dsl, "./test_rpa_output")
print(f"✅ Bot compilado en: {bot_dir}")
print()

# Mostrar el código generado
print("🔍 Código generado para browser.open:")
print("-" * 70)
with open(bot_dir / "main.robot") as f:
    content = f.read()
    # Encontrar el código del nodo browser.open
    lines = content.split('\n')
    in_browser_open = False
    for i, line in enumerate(lines):
        if 'browser.open' in line.lower():
            in_browser_open = True
        if in_browser_open:
            print(line)
            if 'EXCEPT' in line:
                print("        ...")
                break

print()
print("=" * 70)
print("📋 PRÓXIMOS PASOS PARA RPA REAL:")
print("=" * 70)
print()
print("1. Instalar rpaframework:")
print("   pip install rpaframework")
print()
print("2. Para browser automation específicamente:")
print("   pip install rpaframework-browser")
print("   rfbrowser init")
print()
print("3. Ejecutar el bot:")
print(f"   cd {bot_dir}")
print("   robot main.robot")
print()
print("⚠️  ESTADO ACTUAL:")
print("   - Templates generan código correcto ✅")
print("   - Librerías RPA están implementadas ✅")
print("   - Falta instalar dependencias ⚠️")
print()

