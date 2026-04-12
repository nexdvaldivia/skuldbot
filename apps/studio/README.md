# Skuldbot Studio

Editor visual de flujos RPA - Aplicación desktop con Tauri + React.

## 🎉 Integración Completa

**✅ El Studio está completamente integrado con el Engine**

Puedes:

- ✅ Crear flujos visualmente
- ✅ **Compilar bots realmente** (genera Bot Package)
- ✅ **Ejecutar bots realmente** (usa el Engine)
- ✅ Guardar/Cargar proyectos
- ✅ Ver resultados de ejecución

## 🚀 Quick Start

### 1. Verificar Requisitos

```bash
# Ejecuta el script de verificación
chmod +x check-setup.sh
./check-setup.sh
```

### 2. Instalar

```bash
npm install
```

### 3. Ejecutar

```bash
# Modo Web (sin integración Engine)
npm run dev

# Modo Tauri (CON integración Engine) ⭐ RECOMENDADO
npm run tauri:dev
```

## 📚 Documentación

- **[INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)** - Detalles técnicos de la integración
- **[TEST_INTEGRATION.md](./TEST_INTEGRATION.md)** - Guía paso a paso para probar
- **[STUDIO_STATUS.md](./STUDIO_STATUS.md)** - Estado del proyecto

## 🎯 Features

### Editor Visual

- ✅ Drag & drop de nodos
- ✅ Conectar nodos (success/error)
- ✅ Configuración de nodos en panel
- ✅ MiniMap y controles de zoom
- ✅ Eliminar nodos

### Integración con Engine

- ✅ **Compilar**: DSL → Bot Package vía Tauri
- ✅ **Ejecutar**: Run bot con Engine real
- ✅ **Validar**: Validación de DSL
- ✅ **Indicador de estado**: Verde = Engine conectado

### File System

- ✅ Export DSL a JSON
- ✅ Import DSL desde JSON (con file picker nativo)
- ✅ Guardar proyectos
- ✅ Cargar proyectos

### 12 Tipos de Nodos

- **Control**: log, wait, set_variable
- **Browser**: open, click, fill, close
- **Excel**: open, read, close

## 🧪 Testing

Ver [TEST_INTEGRATION.md](./TEST_INTEGRATION.md) para guía completa.

**TL;DR:**

```bash
# Instalar
npm install

# Verificar setup
./check-setup.sh

# Ejecutar con Tauri
npm run tauri:dev

# Crear bot → Compilar → Ejecutar
```

## 🏗️ Arquitectura

```
┌─────────────────────┐
│  React Frontend     │  TypeScript + React Flow
│  (UI Components)    │
└──────────┬──────────┘
           │ invoke('compile_dsl', ...)
           ▼
┌─────────────────────┐
│  Tauri Backend      │  Rust
│  (Commands)         │
└──────────┬──────────┘
           │ std::process::Command
           ▼
┌─────────────────────┐
│  Python Inline      │  Python code as string
│  (Bridge)           │
└──────────┬──────────┘
           │ import skuldbot
           ▼
┌─────────────────────┐
│  Skuldbot Engine    │  DSL → Robot Framework
│  (Compiler/Executor)│
└─────────────────────┘
```

## 📁 Estructura

```
studio/
├── src/
│   ├── components/          # React components
│   │   ├── FlowEditor.tsx   # Canvas principal
│   │   ├── Sidebar.tsx      # Panel de nodos
│   │   ├── Toolbar.tsx      # Barra superior
│   │   ├── CustomNode.tsx   # Nodo visual
│   │   └── NodeConfig.tsx   # Configuración
│   ├── store/
│   │   └── flowStore.ts     # State (Zustand)
│   ├── types/
│   │   ├── flow.ts          # Flow types
│   │   └── tauri.d.ts       # Tauri types
│   ├── data/
│   │   └── nodeTemplates.ts # Templates de nodos
│   └── lib/
│       └── utils.ts         # Helpers
│
├── src-tauri/               # Backend Tauri
│   ├── src/
│   │   └── main.rs          # Commands Rust ⭐
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

## 🔧 Comandos Disponibles

```bash
# Desarrollo web (sin Tauri)
npm run dev

# Desarrollo desktop (con Tauri) ⭐
npm run tauri:dev

# Build
npm run build

# Build desktop
npm run tauri:build

# Lint
npm run lint
```

## 🐛 Troubleshooting

### Indicator Rojo (Engine no conectado)

1. Verifica Python:

```bash
python3 --version
cd ../engine
python3 -c "from skuldbot import Compiler; print('OK')"
```

2. Instala dependencias del Engine:

```bash
cd ../engine
pip3 install --user -e .
```

3. Reinicia Tauri:

```bash
# Ctrl+C
npm run tauri:dev
```

### Tauri no compila

```bash
# Instala Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# macOS: Instala Xcode tools
xcode-select --install
```

### "Failed to execute Python"

Edita `src-tauri/src/main.rs` y ajusta:

```rust
fn get_python_executable() -> String {
    "/usr/bin/python3".to_string()  // Tu path a python
}
```

Ver [TEST_INTEGRATION.md](./TEST_INTEGRATION.md) para más soluciones.

## 🎯 Uso

### 1. Crear Bot

- Arrastra nodos desde sidebar
- Conecta nodos (verde=success, rojo=error)
- Click en nodo para configurar

### 2. Compilar

- Click en "Compilar"
- Ve la ruta del Bot Package generado

### 3. Ejecutar

- Click en "▶️ Ejecutar"
- Ve los logs de ejecución

### 4. Guardar/Cargar

- Export: Botón 📥
- Import: Botón 📤 (file picker nativo)

## 🚀 Próximas Features

### Corto Plazo

- [ ] Logs en tiempo real (streaming)
- [ ] Better error display
- [ ] Undo/Redo
- [ ] Keyboard shortcuts

### Mediano Plazo

- [ ] Breakpoints en debug
- [ ] Step-by-step execution
- [ ] Variables inspector
- [ ] Search nodes

## 🛠️ Stack Tecnológico

- **Frontend**: React 18 + TypeScript
- **Desktop**: Tauri 1.5 (Rust + WebView)
- **Build**: Vite
- **Flow Editor**: React Flow
- **State**: Zustand
- **Styling**: TailwindCSS
- **Icons**: Lucide React
- **Engine**: Python + Robot Framework

## 📊 Estado

| Componente         | Estado  |
| ------------------ | ------- |
| UI Components      | ✅ 100% |
| Tauri Integration  | ✅ 100% |
| Engine Integration | ✅ 100% |
| File System        | ✅ 100% |
| Debug Features     | 🔜 0%   |

**Progreso Total**: 80% ✅

## 🤝 Contribuir

Ver [CONTRIBUTING.md](../CONTRIBUTING.md) en la raíz del proyecto.

## 📄 Licencia

MIT License

---

**Última actualización**: 16 de Diciembre 2025  
**Versión**: 0.1.0  
**Estado**: ✅ Funcional con integración completa
