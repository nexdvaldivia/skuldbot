"""
Ejemplo de automatización browser con skuldbot-engine
"""

from skuldbot import Executor, ExecutionMode

# DSL de bot con automatización web
dsl = {
    "version": "1.0",
    "bot": {
        "id": "web-scraper",
        "name": "Web Scraper Bot",
        "description": "Navega a una página y extrae información",
    },
    "nodes": [
        {
            "id": "open-browser",
            "type": "browser.open",
            "config": {
                "url": "https://example.com",
                "browser": "chromium",
                "headless": False,
            },
            "outputs": {"success": "extract-title", "error": "error-handler"},
        },
        {
            "id": "extract-title",
            "type": "browser.click",
            "config": {"selector": "h1"},
            "outputs": {"success": "close-browser", "error": "error-handler"},
        },
        {
            "id": "close-browser",
            "type": "browser.close",
            "config": {},
            "outputs": {"success": "log-success", "error": "error-handler"},
        },
        {
            "id": "log-success",
            "type": "control.log",
            "config": {"message": "Scraping completado exitosamente"},
            "outputs": {"success": "log-success", "error": "error-handler"},
        },
        {
            "id": "error-handler",
            "type": "control.log",
            "config": {"message": "Error durante el scraping"},
            "outputs": {"success": "error-handler", "error": "error-handler"},
        },
    ],
}


def main():
    print("=== Browser Automation Example ===\n")

    # Callbacks para monitorear ejecución
    def on_start():
        print("🚀 Iniciando bot...")

    def on_log(log):
        print(f"📝 [{log.level}] {log.message}")

    def on_complete(result):
        print(f"\n✅ Bot completado con estado: {result.status}")

    # Ejecutar bot
    executor = Executor(mode=ExecutionMode.DEBUG)

    result = executor.run_from_dsl(
        dsl,
        callbacks={
            "on_start": on_start,
            "on_log": on_log,
            "on_complete": on_complete,
        },
    )

    print(f"\nDuración: {result.duration:.2f}s")
    print(f"Éxito: {result.success}")


if __name__ == "__main__":
    main()

