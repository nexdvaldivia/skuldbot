"""
Ejemplo de bot simple usando skuldbot-engine
"""

from skuldbot import Compiler, Executor, ExecutionMode

# Definir DSL del bot
dsl = {
    "version": "1.0",
    "bot": {
        "id": "simple-bot",
        "name": "Bot Simple de Ejemplo",
        "description": "Ejemplo de bot que hace logging",
    },
    "nodes": [
        {
            "id": "start",
            "type": "control.log",
            "config": {"message": "Bot iniciado"},
            "outputs": {"success": "process", "error": "error-handler"},
        },
        {
            "id": "process",
            "type": "control.log",
            "config": {"message": "Procesando datos..."},
            "outputs": {"success": "end", "error": "error-handler"},
        },
        {
            "id": "end",
            "type": "control.log",
            "config": {"message": "Bot completado exitosamente"},
            "outputs": {"success": "end", "error": "error-handler"},
        },
        {
            "id": "error-handler",
            "type": "control.log",
            "config": {"message": "Error: algo salió mal"},
            "outputs": {"success": "error-handler", "error": "error-handler"},
        },
    ],
    "variables": {"retry_count": {"type": "number", "value": 3}},
}


def main():
    print("=== Ejemplo: Compilar DSL ===")

    # Compilar DSL a Bot Package
    compiler = Compiler()
    package = compiler.compile(dsl)

    print(f"Bot ID: {package.bot_id}")
    print(f"Bot Name: {package.bot_name}")
    print(f"Manifest: {package.manifest}")

    # Compilar a disco
    print("\n=== Compilando a disco ===")
    bot_dir = compiler.compile_to_disk(dsl, "./output")
    print(f"Bot compilado en: {bot_dir}")

    # Ejecutar bot
    print("\n=== Ejecutando bot ===")

    def on_log(log):
        print(f"[{log.level}] {log.message}")

    executor = Executor(mode=ExecutionMode.DEBUG)
    result = executor.run_from_package(
        str(bot_dir), callbacks={"on_log": on_log}
    )

    print(f"\nEstado: {result.status}")
    print(f"Duración: {result.duration:.2f}s")
    print(f"Éxito: {result.success}")

    if result.errors:
        print(f"Errores: {result.errors}")


if __name__ == "__main__":
    main()

