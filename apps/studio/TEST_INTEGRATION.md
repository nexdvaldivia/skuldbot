# Test de Integración - Guía Paso a Paso

## ✅ Pre-requisitos

Verifica que tienes instalado:

```bash
# Node.js
node --version  # Debe ser 18+

# Rust (para Tauri)
rustc --version

# Python (para Engine)
python3 --version  # Debe ser 3.10+

# Engine dependencies
cd ../../services/engine
python3 -c "from skuldbot import Compiler; print('✅ Engine OK')"
```

Si falta algo:

```bash
# Instalar Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Instalar dependencias del Engine
cd ../../services/engine
pip3 install --user pydantic pyyaml jinja2
```

## 🚀 Instalación

```bash
cd apps/studio/

# Instalar dependencias npm
npm install

# Esto instalará:
# - React, Vite, TailwindCSS
# - React Flow
# - Tauri CLI
# - Lucide icons
```

## 🧪 Test 1: Web Mode (Sin Tauri)

Prueba el UI sin la integración:

```bash
npm run dev
```

- Abre: http://localhost:1420
- Crea un flujo
- Exporta/Importa DSL
- **Limitación**: Compilar/Ejecutar no funcionará (solo alerts)

## 🧪 Test 2: Tauri Mode (Con Integración)

Prueba la integración completa:

```bash
npm run tauri:dev
```

**Primera vez tomará ~5-10 min** (Rust compila todas las dependencias)

### Qué Esperar

1. **Ventana de la App**:
   - Se abre una ventana nativa
   - Tamaño: 1400x900
   - Título: "Skuldbot Studio"

2. **Indicator de Estado** (barra verde/roja):
   - 🟢 Verde: "Engine conectado y listo"
   - 🔴 Rojo: "Engine no disponible"

3. **Si está verde** ✅:
   - Todo listo para probar

4. **Si está rojo** ❌:
   - Ve a "Troubleshooting" abajo

## 🎯 Test 3: Crear y Ejecutar Bot

### Paso 1: Crear Bot Simple

1. Arrastra "Log" desde el sidebar al canvas
2. Click en el nodo
3. Configura el mensaje: "¡Hola desde Skuldbot!"
4. Conecta el nodo a sí mismo (success → mismo nodo)

### Paso 2: Compilar

1. Click en botón **"Compilar"**
2. Espera ~2-3 segundos
3. Deberías ver:
   ```
   ✅ Bot compilado exitosamente!
   
   Path: /var/folders/.../bots/test-bot-XXX
   ```

### Paso 3: Ejecutar

1. Click en botón **"▶️ Ejecutar"**
2. Espera ~3-5 segundos
3. Deberías ver:
   ```
   ✅ Bot ejecutado!
   
   Resultado:
   STATUS: success
   DURATION: 1.23
   SUCCESS: True
   ```

### Paso 4: Bot más Complejo

Prueba con múltiples nodos:

1. Arrastra: Log → Wait → Log
2. Conecta en secuencia
3. Configura cada nodo
4. Compila y ejecuta

## 🐛 Troubleshooting

### Problema: Indicator Rojo

**Síntoma**: "Engine no disponible"

**Solución 1**: Verifica Python
```bash
python3 --version
python3 -c "import sys; print(sys.path)"
```

**Solución 2**: Verifica Engine path
```bash
cd ../../services/engine
pwd  # Copia este path
```

Edita `src-tauri/src/main.rs` línea ~40:
```rust
fn get_engine_path() -> PathBuf {
    PathBuf::from("/RUTA/COMPLETA/AL/services/engine")  // <-- Tu path
}
```

**Solución 3**: Instala dependencias del Engine
```bash
cd ../../services/engine
pip3 install --user -e .
```

### Problema: "Failed to execute Python"

**Solución**: Verifica que `python3` está en PATH
```bash
which python3
# O en Windows:
where python
```

Si no está, edita `main.rs` línea ~60:
```rust
fn get_python_executable() -> String {
    "/usr/bin/python3".to_string()  // Path completo
}
```

### Problema: "No module named 'skuldbot'"

**Solución**: Instala el Engine
```bash
cd ../../services/engine
pip3 install --user -e .
```

### Problema: Tauri no compila

**Error**: "error: linking with `cc` failed"

**Solución**: Instala build tools
```bash
# macOS
xcode-select --install

# Linux
sudo apt install build-essential

# Windows
# Instala Visual Studio Build Tools
```

### Problema: Puerto 1420 ocupado

**Solución**: Cambia el puerto en `vite.config.ts`:
```typescript
server: {
  port: 3000,  // Cambia aquí
  ...
}
```

Y en `tauri.conf.json`:
```json
"devPath": "http://localhost:3000"
```

## 📊 Verificación de Éxito

### Checklist Completo

- [ ] Indicator verde ✅
- [ ] Puedo crear nodos
- [ ] Puedo configurar nodos
- [ ] Compilar muestra path del bot
- [ ] Ejecutar muestra logs
- [ ] No hay errores en consola
- [ ] File dialogs funcionan (Import DSL)

Si todos están ✅ → **Integración Exitosa!** 🎉

## 🎬 Siguiente Nivel

Una vez que todo funciona:

1. **Prueba bot de Browser**:
   - Necesitas: `pip3 install rpaframework`
   - Crea: Open Browser → Close Browser
   - Ejecuta

2. **Prueba bot de Excel**:
   - Necesitas: `pip3 install openpyxl`
   - Crea: Open Excel → Read Excel → Close Excel
   - Ejecuta

3. **Guarda un proyecto**:
   - Export DSL
   - Cierra app
   - Abre app
   - Import DSL
   - Todo debe cargar correctamente

## 📝 Notas Importantes

### Primera Ejecución de Tauri
- Toma 5-10 minutos (compila Rust + todas las deps)
- Solo la primera vez
- Siguientes ejecuciones: ~10-20 segundos

### Logs del Engine
- Aparecen en la terminal donde ejecutaste `tauri:dev`
- Busca líneas con "🔧", "✅", "❌"

### Hot Reload
- Cambios en React: Hot reload automático ✅
- Cambios en Rust: Requiere recompilar (Ctrl+C y npm run tauri:dev)

## 🆘 Si Nada Funciona

1. Verifica pre-requisitos (arriba)
2. Lee los logs completos
3. Busca el error específico en Google
4. Revisa los issues de Tauri: https://github.com/tauri-apps/tauri/issues

## ✨ Estado Esperado

Después de seguir esta guía:
- ✅ Studio ejecutándose con Tauri
- ✅ Engine conectado
- ✅ Puedes compilar bots
- ✅ Puedes ejecutar bots
- ✅ Ves resultados reales

**¡Felicidades!** Tienes un editor RPA funcional end-to-end 🚀

---

**Tiempo estimado**: 20-30 minutos (primera vez)




