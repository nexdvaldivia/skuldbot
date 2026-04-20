"""
Test rápido para verificar si el engine funciona end-to-end
"""

from skuldbot import Compiler, Executor, ExecutionMode
import json

# Bot súper simple
dsl = {
    "version": "1.0",
    "bot": {
        "id": "test-bot",
        "name": "Test Bot"
    },
    "nodes": [
        {
            "id": "node-1",
            "type": "control.log",
            "config": {"message": "Hello from Skuldbot!"},
            "outputs": {"success": "node-1", "error": "node-1"}
        }
    ]
}

print("=" * 60)
print("TEST 1: Validar y Compilar DSL")
print("=" * 60)

try:
    compiler = Compiler()
    package = compiler.compile(dsl)
    print(f"✅ Bot ID: {package.bot_id}")
    print(f"✅ Bot Name: {package.bot_name}")
    print(f"✅ Manifest: {json.dumps(package.manifest, indent=2)}")
    print("\n🔍 Preview del main.robot generado:")
    print("-" * 60)
    print(package.main_robot[:500] + "...")
except Exception as e:
    print(f"❌ Error en compilación: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("TEST 2: Compilar a Disco")
print("=" * 60)

try:
    compiler = Compiler()
    bot_dir = compiler.compile_to_disk(dsl, "./test_output")
    print(f"✅ Bot compilado en: {bot_dir}")
    
    # Verificar archivos
    import os
    files = []
    for root, dirs, filenames in os.walk(bot_dir):
        for f in filenames:
            rel_path = os.path.relpath(os.path.join(root, f), bot_dir)
            files.append(rel_path)
    
    print(f"✅ Archivos generados:")
    for f in sorted(files):
        print(f"   - {f}")
        
except Exception as e:
    print(f"❌ Error compilando a disco: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("TEST 3: Ejecutar Bot (esto puede fallar si Robot Framework no está instalado)")
print("=" * 60)

try:
    executor = Executor(mode=ExecutionMode.DEBUG)
    
    logs = []
    def on_log(log):
        logs.append(f"[{log.level}] {log.message}")
    
    result = executor.run_from_dsl(
        dsl,
        callbacks={"on_log": on_log}
    )
    
    print(f"✅ Status: {result.status}")
    print(f"✅ Duration: {result.duration:.2f}s")
    print(f"✅ Success: {result.success}")
    print(f"✅ Logs capturados: {len(logs)}")
    
    if logs:
        print("\n📝 Primeros logs:")
        for log in logs[:5]:
            print(f"   {log}")
    
except Exception as e:
    print(f"⚠️  Error en ejecución: {e}")
    print("   (Esto es normal si Robot Framework no está instalado)")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("RESUMEN")
print("=" * 60)
print("Si ves ✅ en los primeros 2 tests, la estructura funciona.")
print("El test 3 requiere tener Robot Framework instalado.")

