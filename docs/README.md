# Skuldbot Documentation

## Indice de Documentacion

### Para Usuarios

| Documento | Descripcion |
|-----------|-------------|
| [USER_GUIDE.md](./USER_GUIDE.md) | Guia completa de uso del Studio |
| [INSTALLATION.md](./INSTALLATION.md) | Instrucciones de instalacion |

### Para Desarrolladores

| Documento | Descripcion |
|-----------|-------------|
| [TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md) | Arquitectura del sistema |
| [ENGINE_REFERENCE.md](./ENGINE_REFERENCE.md) | Referencia del Engine Python |
| [TRIGGERS.md](./TRIGGERS.md) | Sistema de Triggers (Form, Schedule, etc.) |
| [ORCHESTRATOR.md](./ORCHESTRATOR.md) | Especificacion del Orchestrator |
| [../CLAUDE.md](../CLAUDE.md) | Especificacion completa del proyecto |

### En el Engine

| Documento | Descripcion |
|-----------|-------------|
| [../engine/docs/DSL_SPEC.md](../engine/docs/DSL_SPEC.md) | Especificacion del formato DSL |
| [../engine/docs/ARCHITECTURE.md](../engine/docs/ARCHITECTURE.md) | Arquitectura del Engine |

---

## Quick Start

### 1. Requisitos

- macOS 11+ / Windows 10+
- Node.js 18+
- Python 3.10+
- Xcode (macOS, para RPA Framework)

### 2. Instalacion rapida

```bash
# Clonar
git clone https://github.com/khipus/skuldbot.git
cd skuldbot

# Engine
cd engine
python3 -m venv .venv
source .venv/bin/activate
pip install -e .

# Studio
cd ../studio
npm install
npm run tauri dev
```

### 3. Crear tu primer bot

1. En el Studio, arrastra un nodo "Manual Trigger" al canvas
2. Arrastra un nodo "Open Browser"
3. Conecta el trigger al browser
4. Configura la URL en el panel derecho
5. Click "Build" y luego "Run"

---

## Stack Tecnologico

| Componente | Tecnologia |
|------------|------------|
| **Studio Desktop** | Tauri + React + Vite + React Flow |
| **UI Components** | TailwindCSS + shadcn/ui |
| **State Management** | Zustand |
| **Engine** | Python + Robot Framework |
| **RPA Libraries** | rpaframework (opcional) |
| **Serialization** | Pydantic + JSON |

---

## Estructura del Proyecto

```
skuldbot/
├── engine/         # Motor Python
├── studio/         # Editor visual
├── docs/           # Documentacion (estas aqui)
└── CLAUDE.md       # Especificacion
```

---

## Soporte

- GitHub Issues: Para bugs y feature requests
- Email: dev@khipus.io
