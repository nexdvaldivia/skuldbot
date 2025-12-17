# Skuldbot - Plataforma RPA Open Source

Plataforma RPA moderna, abierta y extensible basada en Robot Framework.

## 🎉 ¡Funcional End-to-End!

**✨ El Studio ya está integrado con el Engine ✨**

Puedes crear bots visualmente y ejecutarlos REALMENTE.

## ⚡ Quick Start

```bash
# 1. Engine
cd engine/
pip3 install --user -e .

# 2. Studio
cd ../studio/
npm install
npm run tauri:dev

# 3. Crea un bot → Compila → Ejecuta ✅
```

**Ver [QUICKSTART.md](./QUICKSTART.md) para guía detallada.**

---

## 📁 Estructura del Proyecto

```
skuldbot/
├── engine/        ✅ Motor de ejecución (100%)
├── studio/        ✅ Editor visual con Tauri (100%)
├── orchestrator/  🔜 API + UI para gestión (0%)
│   ├── api/       
│   └── ui/        
└── runner/        🔜 Agente Python (0%)
```

---

## 🚀 Estado Actual

| Componente | Estado | Descripción |
|------------|--------|-------------|
| **Engine** | ✅ 100% | DSL → Robot Framework compiler + executor |
| **Studio** | ✅ 100% | Editor visual CON integración Tauri ⭐ |
| **Orchestrator** | 🔜 0% | Gestión centralizada de bots |
| **Runner** | 🔜 0% | Agente para ejecución distribuida |

**Progreso Total: 50%**

---

## ✨ Lo que Funciona AHORA

### 🎯 Demo End-to-End

1. Abres el Studio (Tauri)
2. Creas un bot visualmente (drag & drop)
3. Configuras los nodos
4. Click "Compilar" → ✅ Genera Bot Package REAL
5. Click "Ejecutar" → ✅ Ejecuta con Engine REAL
6. Ves resultados de ejecución

**¡Todo funciona end-to-end!** 🎉

---

## 🎯 Componentes

### 1. Engine (✅ Completado 100%)
**Ubicación**: `engine/`  
**Tecnología**: Python + Robot Framework + rpaframework  
**Propósito**: Motor de ejecución compartido para Studio y Runner

**Funcionalidades:**
- ✅ DSL JSON validation (Pydantic)
- ✅ Compiler: DSL → Robot Framework (Jinja2)
- ✅ Executor con callbacks (debug y producción)
- ✅ 12 node types: control, browser, excel
- ✅ Bot Package generation
- ✅ Error handling estructurado
- ✅ Tests completos

**Uso:**
```bash
cd engine/
python test_engine_simple.py
# O instalar: pip3 install --user -e .
```

Ver `engine/README.md` para más detalles.

### 2. Studio (✅ Completado 100%)
**Ubicación**: `studio/`  
**Tecnología**: Tauri + React + Vite + React Flow + Zustand
**Propósito**: Editor visual de flujos RPA (aplicación desktop)

**Funcionalidades:**
- ✅ Editor visual drag & drop
- ✅ 12 node templates disponibles
- ✅ Configuración de nodos en panel
- ✅ Export/Import DSL
- ✅ **Compilación REAL** (vía Tauri → Engine) ⭐
- ✅ **Ejecución REAL** (vía Tauri → Engine) ⭐
- ✅ File dialogs nativos
- ✅ Engine status indicator
- ✅ Save/Load projects

**Uso:**
```bash
cd studio/
npm install
npm run tauri:dev
```

Ver `studio/README.md` y `studio/INTEGRATION_GUIDE.md` para más detalles.

### 3. Orchestrator (🔜 Próximo 0%)
**Ubicación**: `orchestrator/`  
**Tecnología**: NestJS (API) + Next.js (UI)  
**Propósito**: Backend centralizado de gestión

**Funcionalidades planeadas:**
- [ ] API REST para gestión de bots
- [ ] UI web para dashboards
- [ ] Gestión de usuarios y permisos (RBAC)
- [ ] Scheduling de ejecuciones
- [ ] Storage de artifacts
- [ ] Logs centralizados

### 4. Runner (🔜 Próximo 0%)
**Ubicación**: `runner/`  
**Tecnología**: Python + Robot Framework + rpaframework  
**Propósito**: Agente que ejecuta bots en producción

**Funcionalidades planeadas:**
- [ ] Polling/webhooks desde Orchestrator
- [ ] Ejecución de Bot Packages
- [ ] Envío de logs en tiempo real
- [ ] Manejo de secrets
- [ ] Ejecución en sandbox

---

## 🔄 Flujo de Trabajo

### Actual (Engine + Studio)

```
┌─────────────────┐
│  Studio Desktop │  1. Diseña bot
│  (Tauri+React)  │     drag & drop
└────────┬────────┘
         │
         ▼
    ┌─────────┐
    │ DSL JSON│  2. Genera DSL
    └────┬────┘
         │
         ▼
┌─────────────────┐
│  Tauri Backend  │  3. Invoca Engine
│     (Rust)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Engine Python  │  4. Compila y ejecuta
│  Compiler+Exec  │
└────────┬────────┘
         │
         ▼
    ┌───────────┐
    │   Logs +  │  5. Resultados en UI
    │  Results  │
    └───────────┘
```

### Futuro (Con Orchestrator + Runner)

```
┌─────────────────┐
│  Studio Desktop │  1. Diseña bot
│  (Tauri+React)  │
└────────┬────────┘
         │
         ▼
┌──────────────────────┐
│   Orchestrator API   │  2. Almacena y gestiona
│      (NestJS)        │
└──────────┬───────────┘
           │
           ▼
    ┌─────────────┐
    │  Bot Runner │  3. Ejecuta distribuido
    │  (Python)   │
    └─────────────┘
           │
           ▼
    ┌──────────────┐
    │    Logs +    │  4. Resultados
    │   Results    │
    └──────────────┘
```

---

## 📚 Documentación

### General
- **[QUICKSTART.md](./QUICKSTART.md)** - Empieza en 5 minutos ⚡
- **[PROJECT_STATUS.md](./PROJECT_STATUS.md)** - Estado completo del proyecto
- **[claude.md](./claude.md)** - Especificación técnica

### Por Componente
- **[engine/README.md](./engine/README.md)** - Motor de ejecución
- **[engine/ARCHITECTURE.md](./engine/docs/ARCHITECTURE.md)** - Arquitectura del Engine
- **[engine/RPA_CAPABILITIES.md](./engine/RPA_CAPABILITIES.md)** - Capacidades RPA
- **[studio/README.md](./studio/README.md)** - Editor visual
- **[studio/INTEGRATION_GUIDE.md](./studio/INTEGRATION_GUIDE.md)** - Integración Tauri
- **[studio/TEST_INTEGRATION.md](./studio/TEST_INTEGRATION.md)** - Guía de testing

---

## 🛠️ Stack Tecnológico

| Componente | Tecnologías |
|------------|-------------|
| **Engine** | Python 3.10+, Robot Framework, Jinja2, Pydantic |
| **Studio** | Tauri 1.5, Rust, React 18, TypeScript, Vite, React Flow, Zustand |
| **Orchestrator** | NestJS, Next.js, PostgreSQL, Redis |
| **Runner** | Python 3.10+, asyncio |

---

## 🎯 Features Implementadas

### Engine ✅
- [x] DSL JSON validation (Pydantic)
- [x] Compiler: DSL → Robot Framework (Jinja2)
- [x] Executor con callbacks (debug/production modes)
- [x] 12 node types: control, browser, excel
- [x] Error handling
- [x] Tests completos

### Studio ✅
- [x] Editor visual con React Flow
- [x] 12 node templates (drag & drop)
- [x] Configuración de nodos
- [x] Export/Import DSL
- [x] **Compilar bots (REAL)** ⭐
- [x] **Ejecutar bots (REAL)** ⭐
- [x] File dialogs nativos
- [x] Engine status indicator

### Orchestrator 🔜
- [ ] API NestJS
- [ ] PostgreSQL
- [ ] Authentication
- [ ] Bot CRUD
- [ ] Execution management

### Runner 🔜
- [ ] Agent Python
- [ ] Job polling
- [ ] Log streaming

---

## 📊 Métricas

- **Líneas de código**: ~5,500
- **Archivos creados**: ~100
- **Documentación**: ~7,000 líneas
- **Tiempo invertido**: 3 días
- **Features funcionales**: 18+

---

## 🎓 Uso Rápido

### Ejemplo: Crear y Ejecutar un Bot

```python
from skuldbot import Compiler, Executor

dsl = {
    "version": "1.0",
    "bot": {"id": "my-bot", "name": "Mi Bot"},
    "nodes": [
        {
            "id": "start",
            "type": "control.log",
            "config": {"message": "¡Hola Skuldbot!"},
            "outputs": {"success": "start", "error": "start"}
        }
    ]
}

# Compilar
compiler = Compiler()
bot_dir = compiler.compile_to_disk(dsl, "./bots")

# Ejecutar
executor = Executor()
result = executor.run_from_package(str(bot_dir))
print(f"Status: {result.status}")  # success
```

### Ejemplo: Usar el Studio

```bash
cd studio/
npm run tauri:dev

# En el UI:
# 1. Arrastra nodo "Log"
# 2. Configura mensaje
# 3. Click "Compilar"
# 4. Click "Ejecutar"
# 5. ¡Ve los resultados!
```

---

## 🐛 Troubleshooting

### Script de Verificación

```bash
cd studio/
./check-setup.sh
```

### Problemas Comunes

**Engine no conectado (indicator rojo)**:
```bash
cd engine/
pip3 install --user -e .
```

**Tauri no compila**:
```bash
# Instala Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# macOS
xcode-select --install
```

Ver `studio/TEST_INTEGRATION.md` para más soluciones.

---

## 🎯 Roadmap

### ✅ Fase 1-3: Engine + Studio (COMPLETADO)
- Motor de ejecución funcional
- Editor visual completo
- Integración Tauri end-to-end

### 🔜 Fase 4: Orchestrator API (4-6 semanas)
- Backend NestJS
- PostgreSQL schema
- Authentication
- Bot management
- Execution API

### 🔜 Fase 5: Orchestrator UI (2-3 semanas)
- Dashboard Next.js
- Bot management UI
- Execution viewer
- User management

### 🔜 Fase 6: Runner (1-2 semanas)
- Agent Python
- Job polling
- Log streaming

### 🔜 Fase 7: Integración Final (2 semanas)
- Studio → Orchestrator
- Orchestrator → Runner
- Testing end-to-end
- Deployment

**Tiempo estimado para MVP completo**: 2-3 meses

---

## 🤝 Contribuir

1. Fork el repo
2. Crea tu branch (`git checkout -b feature/AmazingFeature`)
3. Commit (`git commit -m 'Add AmazingFeature'`)
4. Push (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

Ver `CONTRIBUTING.md` en cada proyecto para detalles.

---

## 📄 Licencia

MIT License - Ver `LICENSE`

---

## 🏆 Logros

- ✅ **Engine funcional en 1 día**
- ✅ **Studio UI completo en 1 día**
- ✅ **Integración Tauri en 1 día**
- ✅ **Demo end-to-end funcional** ⭐

**¡Tienes un editor RPA funcional que puede crear y ejecutar bots reales!** 🎉

---

**Estado Actual**: Engine ✅ | Studio ✅ | Orchestrator 🔜 | Runner 🔜

**Última actualización**: 16 de Diciembre 2025  
**Versión**: 0.1.0  
**Progreso**: 50%
