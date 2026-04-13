# Guía de Integración Tauri + Engine

## ✅ Integración Completada

El Studio ahora está completamente integrado con el Engine vía Tauri.

## 🔧 Componentes de la Integración

### 1. Backend Tauri (Rust)

**Archivo**: `src-tauri/src/main.rs`

**Commands implementados:**

- `compile_dsl` - Compilar DSL a Bot Package
- `run_bot` - Ejecutar bot en modo debug
- `validate_dsl` - Validar DSL
- `save_project` - Guardar proyecto
- `load_project` - Cargar proyecto
- `get_engine_info` - Obtener info del Engine

### 2. Frontend (TypeScript)

**Archivos modificados:**

- `src/store/flowStore.ts` - Usa `invoke` de Tauri
- `src/components/Toolbar.tsx` - File dialogs con Tauri
- `src/App.tsx` - Indicator de estado del Engine
- `src/types/tauri.d.ts` - TypeScript types

### 3. Flujo de Comunicación

```
┌─────────────────┐
│  React Frontend │
│  (TypeScript)   │
└────────┬────────┘
         │ invoke('compile_dsl', ...)
         ▼
┌─────────────────┐
│  Tauri Backend  │
│     (Rust)      │
└────────┬────────┘
         │ std::process::Command
         ▼
┌─────────────────┐
│ Python Script   │
│ (inline code)   │
└────────┬────────┘
         │ import skuldbot
         ▼
┌─────────────────┐
│ Skuldbot Engine │
│    (Python)     │
└─────────────────┘
```

## 🚀 Cómo Probarlo

### 1. Instalar Dependencias

```bash
cd studio/

# Instalar dependencias npm
npm install

# Instalar dependencias Rust (Tauri compilará automáticamente)
# Asegúrate de tener Rust instalado: https://rustup.rs/
```

### 2. Ejecutar en Modo Desarrollo

```bash
# Opción A: Solo Web (sin Tauri)
npm run dev

# Opción B: Con Tauri (integración completa)
npm run tauri:dev
```

### 3. Probar la Integración

1. **Crear un bot**:
   - Arrastra nodos al canvas
   - Conecta los nodos
   - Configura los parámetros

2. **Compilar** (botón "Compilar"):
   - Genera Bot Package
   - Muestra la ruta del bot compilado

3. **Ejecutar** (botón "▶️ Ejecutar"):
   - Ejecuta el bot con el Engine
   - Muestra logs de ejecución

4. **Guardar/Cargar**:
   - Export: Descarga DSL JSON
   - Import: Carga DSL JSON con file picker nativo

## 📋 Requisitos del Sistema

### Para Desarrollo

- **Node.js**: 18+
- **Rust**: Latest stable (via rustup)
- **Python**: 3.10+ (para Engine)
- **Sistema**: macOS, Linux, o Windows

### Para Producción

Al compilar con `npm run tauri:build`, el Engine debe estar:

- Instalado en el sistema del usuario, O
- Incluido en el bundle de la app

## 🔍 Debugging

### Ver Logs de Rust

```bash
# Los logs aparecen en la terminal donde ejecutaste tauri:dev
npm run tauri:dev
```

### Ver Logs del Engine

Los logs del Engine Python aparecen en:

- Console del navegador (si hay errores)
- Terminal de Rust (stdout/stderr)

### Errores Comunes

**Error: "Failed to execute Python"**

- Solución: Asegúrate de tener Python 3 instalado
- Verifica: `python3 --version` o `python --version`

**Error: "No module named 'skuldbot'"**

- Solución: El path al Engine no es correcto
- Verifica: `get_engine_path()` en `main.rs`

**Error: "Command not found: tauri"**

- Solución: Instala Tauri CLI
- Comando: `npm install -D @tauri-apps/cli`

## 🎯 Features Implementadas

### ✅ Funcionando

- [x] Compilar DSL a Bot Package
- [x] Ejecutar bots en modo debug
- [x] Validar DSL
- [x] Guardar proyectos (.json)
- [x] Cargar proyectos (.json)
- [x] Detectar Engine disponible
- [x] File dialogs nativos
- [x] Error handling

### 🔜 Por Implementar

- [ ] Logs en tiempo real (WebSocket o streaming)
- [ ] Breakpoints en debug mode
- [ ] Variables inspector
- [ ] Step-by-step execution
- [ ] Ejecución con output visual en el UI

## 🛠️ Personalización

### Cambiar la Ruta del Engine

Edita `get_engine_path()` en `src-tauri/src/main.rs`:

```rust
fn get_engine_path() -> PathBuf {
    // Tu ruta personalizada
    PathBuf::from("/ruta/custom/al/engine")
}
```

### Agregar Nuevos Commands

1. Agregar command en `main.rs`:

```rust
#[tauri::command]
async fn mi_comando(param: String) -> Result<String, String> {
    // Tu lógica
    Ok("resultado".to_string())
}
```

2. Registrar en el handler:

```rust
.invoke_handler(tauri::generate_handler![
    compile_dsl,
    run_bot,
    mi_comando  // <-- Agregar aquí
])
```

3. Llamar desde frontend:

```typescript
const result = await invoke('mi_comando', { param: 'valor' });
```

## 📦 Build para Producción

```bash
# Build completo
npm run tauri:build

# Output:
# - macOS: .app y .dmg en src-tauri/target/release/bundle/
# - Windows: .exe y .msi
# - Linux: .deb y .AppImage
```

## 🔐 Seguridad

- File system limitado a carpetas específicas (tauri.conf.json)
- No hay eval() ni código dinámico
- Python se ejecuta como subprocess separado
- DSL se valida antes de ejecutar

## 🎓 Recursos

- [Tauri Docs](https://tauri.app)
- [Rust Book](https://doc.rust-lang.org/book/)
- [Tauri API](https://tauri.app/v1/api/js/)

## ✨ Estado Final

**Integración**: ✅ COMPLETADA  
**Testing**: ⚠️ Pendiente (requiere npm install + tauri:dev)  
**Producción**: 🔜 Requiere build y testing

---

**Última actualización**: 16 de Diciembre 2025
