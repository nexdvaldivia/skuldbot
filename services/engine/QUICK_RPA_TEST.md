# Quick RPA Test - Cómo Probar RPA Real

## 🚀 Instalación Rápida para RPA

```bash
cd /Users/dubielvaldivia/Documents/khipus/skuldbot-engine

# Instalar rpaframework (necesario para RPA real)
pip3 install --user rpaframework

# Para browser automation (opcional)
pip3 install --user robotframework-browser
rfbrowser init
```

## 🧪 Test 1: Control Flow (Ya funciona SIN rpaframework)

```bash
python3 test_engine_simple.py
cd test_output/test-bot-001
robot main.robot
```

**Resultado esperado:** ✅ PASS

## 🧪 Test 2: Browser RPA (Necesita rpaframework)

```bash
# Generar bot con browser
python3 test_rpa_real.py

# Ejecutar (si rpaframework está instalado)
cd test_rpa_output/browser-test
PYTHONPATH=/Users/dubielvaldivia/Documents/khipus/skuldbot-engine robot main.robot
```

**Resultado esperado:**
- Sin rpaframework: ❌ Error "No module named 'RPA'"
- Con rpaframework: ✅ Abre navegador, navega, cierra

## 📝 Ver Código Generado

```bash
cat test_rpa_output/browser-test/main.robot
```

Deberías ver:
```robot
Open Available Browser    https://example.com    browser=chromium    headless=true
```

## 🎯 Crear Tu Propio Bot RPA

```python
from skuldbot import Compiler

# Tu bot custom
dsl = {
    "version": "1.0",
    "bot": {"id": "my-rpa-bot", "name": "Mi Bot RPA"},
    "nodes": [
        {
            "id": "start",
            "type": "control.log",
            "config": {"message": "Iniciando..."},
            "outputs": {"success": "open", "error": "error"}
        },
        {
            "id": "open",
            "type": "browser.open",
            "config": {
                "url": "https://google.com",
                "browser": "chromium",
                "headless": False  # Ver el navegador
            },
            "outputs": {"success": "wait", "error": "error"}
        },
        {
            "id": "wait",
            "type": "control.wait",
            "config": {"seconds": 3},
            "outputs": {"success": "close", "error": "error"}
        },
        {
            "id": "close",
            "type": "browser.close",
            "config": {},
            "outputs": {"success": "end", "error": "error"}
        },
        {
            "id": "end",
            "type": "control.log",
            "config": {"message": "¡Completado!"},
            "outputs": {"success": "end", "error": "error"}
        },
        {
            "id": "error",
            "type": "control.log",
            "config": {"message": "Error!", "level": "ERROR"},
            "outputs": {"success": "error", "error": "error"}
        }
    ]
}

# Compilar
compiler = Compiler()
bot_dir = compiler.compile_to_disk(dsl, "./my_bot")
print(f"Bot creado en: {bot_dir}")
```

## ✅ Checklist de RPA

- [x] Engine compila DSL → Robot Framework ✅
- [x] Genera nodos control.* ✅
- [x] Genera nodos browser.* ✅
- [x] Genera nodos excel.* ✅
- [ ] rpaframework instalado ⚠️ (opcional)
- [ ] Browser drivers instalados ⚠️ (opcional)

## 🎓 Siguiente Nivel

Una vez que rpaframework funcione, puedes hacer:

1. **Web Scraping**
   - Navegar sitios
   - Extraer datos
   - Llenar formularios

2. **Excel Automation**
   - Leer/escribir datos
   - Procesar reportes
   - Generar dashboards

3. **Workflows Completos**
   - Web → Excel
   - Excel → Email
   - API → Database → Excel

## 💡 Tips

- **Headless=True**: Navegador invisible (más rápido)
- **Headless=False**: Ver el navegador (para debug)
- Usa `control.log` para debugging
- Usa `control.wait` para ver qué pasa
- Los errores van al output error-handler

## 🐛 Troubleshooting

**Error: "No module named 'RPA'"**
```bash
pip3 install --user rpaframework
```

**Error: "Browser not found"**
```bash
pip3 install --user robotframework-browser
rfbrowser init
```

**Error: "No module named 'skuldbot'"**
```bash
PYTHONPATH=/path/to/skuldbot-engine robot main.robot
```

**Bot se ejecuta pero no hace nada**
- Revisa que rpaframework esté instalado
- Verifica el output.xml
- Agrega más `control.log` para debugging

