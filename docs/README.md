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
| [PLATFORM_EXECUTION_MAP.md](./PLATFORM_EXECUTION_MAP.md) | Mapa operativo unificado (portales, CP, Orchestrator, Studio, Runner, Deployers, marketing web) |
| [SKULDBOTWEB_CONTINUITY_BASELINE.md](./SKULDBOTWEB_CONTINUITY_BASELINE.md) | Decision oficial de continuidad de `skuldbotweb` + inventario real y plan inmediato |
| [NEXION_NEXIONONE_DEEP_SCAN_2026-02-22.md](./NEXION_NEXIONONE_DEEP_SCAN_2026-02-22.md) | Escaneo técnico completo de `nexion` (PaaS) y `nexion-one` (Control Plane) |
| [NEXION_SKULD_MODULE_DECISION_MATRIX.md](./NEXION_SKULD_MODULE_DECISION_MATRIX.md) | Matriz detallada modulo por modulo con decision `aplica/no aplica` y destino en Skuld |
| [SKULD_P0_EXECUTABLE_BACKLOG.md](./SKULD_P0_EXECUTABLE_BACKLOG.md) | Backlog P0 ejecutable con workstreams, tareas tecnicas, dependencias y DoD |
| [SKULD_P0_IMPLEMENTATION_CHECKLIST.md](./SKULD_P0_IMPLEMENTATION_CHECKLIST.md) | Checklist P0 de implementacion por rutas reales del repo, orden de PRs y gates de pruebas |
| [ENTERPRISE_UI_BRANDING_NON_NEGOTIABLES.md](./ENTERPRISE_UI_BRANDING_NON_NEGOTIABLES.md) | Estandar obligatorio de UI/branding (shadcn + Tailwind + Refactoring UI + emerald/logo oficial Skuld) |
| [REGULATORY_DESIGN_GUARDRAILS.md](./REGULATORY_DESIGN_GUARDRAILS.md) | Guardrails obligatorios regulated-first |
| [DOCS_GOVERNANCE_NODES_AND_PLATFORM.md](./DOCS_GOVERNANCE_NODES_AND_PLATFORM.md) | Regla docs-as-code para nodos y plataforma |
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
