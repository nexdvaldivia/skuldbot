# SkuldBot - Arquitectura Técnica

## 🎯 Visión General

SkuldBot es una plataforma de hyperautomation enterprise que permite crear, gestionar y ejecutar flujos RPA con inteligencia artificial integrada.

## 🏗️ Componentes del Ecosistema

```
┌─────────────────────────────────────────────────┐
│         SkuldBot Studio (Desktop App)           │
│         📱 Editor Visual + AI Planner           │
│                                                  │
│  • Diseña workflows visualmente                 │
│  • AI Planner V2 (genera flows inteligentes)    │
│  • Valida y compila DSL                          │
│  • Exporta archivos ejecutables                  │
│                                                  │
│  Stack: Tauri + Rust + React + TypeScript       │
│  Deployment: Installer (.exe/.dmg/.deb)         │
└──────────────────┬──────────────────────────────┘
                   │
                   │ Exporta archivos:
                   │ • workflow.json (DSL)
                   │ • bot.robot (Robot Framework)
                   │ • config.yaml
                   │
                   ↓
┌─────────────────────────────────────────────────┐
│      SkuldBot Runner (Execution Agent)          │
│      🤖 Agente de ejecución local/remota        │
│                                                  │
│  • Lee workflow.json                            │
│  • Ejecuta bot.robot en la máquina             │
│  • Reporta logs/métricas (si está conectado)    │
│                                                  │
│  Stack: Python + Robot Framework + Engine       │
│  Deployment: Attended / Unattended              │
└──────────────────┬──────────────────────────────┘
                   │
                   │ (opcional)
                   │ Reporta a:
                   ↓
┌─────────────────────────────────────────────────┐
│    SkuldBot Orchestrator (PaaS Cloud)           │
│    ☁️ Plataforma centralizada de gestión        │
│                                                  │
│  • Gestiona múltiples Runners                   │
│  • Distribuye workflows a Runners               │
│  • Monitoreo centralizado                       │
│  • Logs, métricas, audit                        │
│  • Scheduling y triggers                        │
│  • Secrets management                           │
│  • Multi-tenant SaaS                            │
│                                                  │
│  Stack: NestJS + PostgreSQL + Next.js           │
│  Deployment: Docker + Kubernetes                │
└─────────────────────────────────────────────────┘
```

---

## 1️⃣ SkuldBot Studio (Este Repositorio)

### 🎯 Propósito

**Editor visual de escritorio** para diseñar automation workflows. Es el "VS Code" de RPA.

### 📦 Responsabilidades

1. **Visual Canvas Designer**
   - Drag & drop de 279 nodos
   - Conexión visual de flujos
   - Configuración de nodos

2. **AI Planner V2**
   - Generación inteligente de workflows
   - Conversación iterativa con el usuario
   - Validación automática del DSL
   - Auto-corrección de errores

3. **DSL Validation & Compilation**
   - Valida estructura del workflow
   - Compila DSL → Robot Framework
   - Verifica que sea ejecutable por Runner

4. **Export & Save**
   - Guarda proyectos localmente
   - Exporta archivos ejecutables
   - NO ejecuta bots (solo los genera)

### 🛠️ Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| **Frontend** | React 18, TypeScript, Vite |
| **Canvas** | React Flow (visual workflow) |
| **State** | Zustand (state management) |
| **UI** | TailwindCSS + shadcn/ui |
| **Backend** | Rust (Tauri commands) |
| **AI** | LLM integration (OpenAI, Anthropic, local) |
| **Storage** | SQLite (proyectos locales) |
| **Deployment** | Desktop installer (.exe/.dmg/.deb) |

### 📂 Estructura de Archivos

```
studio/
├── src/                           # Frontend React
│   ├── components/
│   │   ├── flow/                 # Canvas editor
│   │   ├── ai-planner/           # AI Planner V2 UI
│   │   ├── sidebar/              # Node palette
│   │   └── ui/                   # shadcn components
│   │
│   ├── store/
│   │   ├── flowStore.ts          # Canvas state
│   │   ├── aiPlannerV2Store.ts   # AI Planner state
│   │   └── logsStore.ts          # Logs panel
│   │
│   ├── data/
│   │   └── nodeTemplates.ts      # 279 node definitions
│   │
│   └── types/
│       └── ai-planner.ts         # TypeScript types
│
├── src-tauri/                     # Backend Rust
│   ├── src/
│   │   ├── main.rs               # Tauri commands
│   │   │   ├── compile_dsl()
│   │   │   ├── validate_dsl()
│   │   │   ├── ai_generate_executable_plan()
│   │   │   └── save_project()
│   │   │
│   │   └── mcp/                  # MCP Client (optional)
│   │       ├── client.rs         # Connect to Orchestrator MCP
│   │       └── types.rs          # MCP types
│   │
│   └── Cargo.toml                # Rust dependencies
│
└── TESTING_AI_PLANNER_V2.md      # Testing guide
```

### 🔌 Integración con Engine

Studio NO ejecuta bots. Solo los **compila**:

```rust
// studio/src-tauri/src/main.rs

#[tauri::command]
fn compile_dsl(dsl: Value) -> Result<String, String> {
    // 1. Valida DSL
    validate_dsl_structure(&dsl)?;
    
    // 2. Llama al Engine Python para compilar
    let output = Command::new("skuldbot-compile")
        .arg("--dsl").arg(dsl_json)
        .output()?;
    
    // 3. Retorna path al bot package
    Ok(bot_package_path)
}
```

### 📤 Output Files

Studio exporta archivos que el **Runner ejecuta**:

1. **`workflow.json`** - DSL completo del workflow
2. **`bot.robot`** - Robot Framework compilado
3. **`config.yaml`** - Configuración de ejecución
4. **`resources/`** - Assets (screenshots, archivos)

---

## 2️⃣ SkuldBot Runner (Otro Repositorio)

### 🎯 Propósito

**Agente de ejecución** que corre en la máquina donde se ejecutan los bots.

### 📦 Responsabilidades

1. **Ejecutar workflows** generados por Studio
2. **Reportar logs** y métricas (si está conectado a Orchestrator)
3. **Manejo de secrets** (credenciales seguras)
4. **Retry logic** (reintentos en caso de fallo)

### 🛠️ Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| **Ejecución** | Python 3.10+, Robot Framework |
| **RPA Framework** | rpaframework (browser, excel, etc) |
| **Engine** | skuldbot-engine (compiler + executor) |

### 🔄 Modos de Ejecución

#### **Attended Runner**
- Corre en la máquina del usuario
- Con supervisión humana
- Para tareas semi-automáticas

#### **Unattended Runner**
- Corre en servidor/VM
- Sin intervención humana
- Para tareas batch (ej: nightly jobs)

### 📥 Input Files

Runner lee archivos generados por Studio:

```bash
runner execute \
  --workflow workflow.json \
  --config config.yaml \
  --secrets vault://prod/credentials
```

---

## 3️⃣ SkuldBot Orchestrator (PaaS - Otro Repositorio)

### 🎯 Propósito

**Plataforma centralizada SaaS** para gestionar todo el ecosistema en empresas.

### 📦 Responsabilidades

1. **Gestión de Workflows**
   - Almacena workflows centralizados
   - Versionado de workflows
   - Control de acceso (RBAC)

2. **Gestión de Runners**
   - Registro de Runners
   - Distribución de trabajo
   - Health checks

3. **Scheduling & Triggers**
   - Cron schedules
   - Event triggers (webhooks)
   - Manual triggers

4. **Observability**
   - Logs centralizados
   - Métricas (Prometheus)
   - Dashboards (Grafana)
   - Audit logs (SOC 2, HIPAA)

5. **Secrets Management**
   - Vault integración
   - Per-tenant secrets
   - Encryption at rest

6. **Multi-Tenancy**
   - Aislamiento por cliente
   - Per-tenant policies
   - Billing & usage tracking

### 🛠️ Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| **API Backend** | NestJS, TypeScript |
| **Database** | PostgreSQL (workflows, logs, audit) |
| **Cache** | Redis (job queue) |
| **Frontend** | Next.js, React |
| **Observability** | Prometheus, Grafana, OpenTelemetry |
| **Secrets** | HashiCorp Vault, AWS Secrets Manager |
| **Deployment** | Docker, Kubernetes, Helm |

### 🐳 Deployment

```bash
# Docker
docker-compose up

# Kubernetes
kubectl apply -f k8s/orchestrator-deployment.yaml

# Helm (recommended for production)
helm install skuldbot-orchestrator ./charts/orchestrator
```

---

## 🔄 Flujo Completo End-to-End

### Caso de Uso: Claims Automation (Seguros)

```
[1. DISEÑO]
Usuario abre Studio
├─ Arrastra nodos: "Read Email" → "Extract Data" → "Fill Form"
├─ AI Planner sugiere agregar "Validate Data" y "Error Handler"
└─ Studio valida y compila workflow

[2. EXPORT]
Studio exporta:
├─ claims-automation.json (DSL)
├─ claims-automation.robot (Robot Framework)
└─ config.yaml

[3. DEPLOY (Opción A: Local)]
Usuario copia archivos a máquina de producción
└─ runner execute --workflow claims-automation.json

[3. DEPLOY (Opción B: Orchestrator)]
Usuario sube workflow a Orchestrator
├─ Orchestrator almacena en DB
├─ Orchestrator programa ejecución (cron: "0 9 * * *")
└─ Orchestrator distribuye a Runner disponible

[4. EJECUCIÓN]
Runner recibe job
├─ Descarga workflow + config
├─ Obtiene secrets de Vault
├─ Ejecuta bot (Robot Framework)
└─ Reporta logs a Orchestrator (opcional)

[5. MONITOREO]
Si hay Orchestrator:
├─ Dashboard muestra ejecución en tiempo real
├─ Alertas si falla
└─ Audit log completo (SOC 2 compliant)
```

---

## 🔐 Seguridad

### Studio

- ✅ Local storage (SQLite)
- ✅ No almacena credenciales (usa referencias)
- ✅ Validación de DSL (previene injection)

### Runner

- ✅ Sandbox execution (opcional con Docker)
- ✅ Secrets desde Vault/ENV (no hardcoded)
- ✅ Network isolation (firewall rules)

### Orchestrator

- ✅ Multi-tenant isolation (PostgreSQL RLS)
- ✅ Encryption at rest (TDE)
- ✅ Encryption in transit (TLS 1.3)
- ✅ RBAC (role-based access control)
- ✅ Audit logs (tamper-proof)
- ✅ Compliance: HIPAA, SOC 2, PCI-DSS, GDPR

---

## 🚀 Deployment Options

### Opción 1: Studio Only (Local Development)

```bash
# Desarrollador individual
studio/
└─ Instala Studio (.exe/.dmg/.deb)
└─ Crea bots localmente
└─ Ejecuta con runner local
```

**Pros:** Simple, gratis, privado  
**Cons:** No hay coordinación central

### Opción 2: Studio + Runner (Small Team)

```bash
# Equipo pequeño (5-10 usuarios)
studio/ (cada desarrollador)
runner/ (1-3 máquinas de ejecución)
└─ Workflows se comparten manualmente (Git/Dropbox)
```

**Pros:** Sin costo de infraestructura  
**Cons:** Manejo manual, no hay observability

### Opción 3: Studio + Orchestrator + Runners (Enterprise)

```bash
# Empresa (50+ usuarios, 100+ runners)
studio/ (desarrolladores)
orchestrator/ (K8s cluster en cloud)
runners/ (distribuidos en oficinas/data centers)
```

**Pros:** Full observability, scheduling, multi-tenant  
**Cons:** Requiere infraestructura cloud

---

## 🆚 Comparación con Competidores

| Feature | SkuldBot | UiPath | Blue Prism | Automation Anywhere |
|---------|----------|---------|------------|---------------------|
| **Studio Desktop** | ✅ | ✅ | ✅ | ✅ |
| **AI Planner (LLM)** | ✅ | ❌ | ❌ | Partial |
| **279 Nodes** | ✅ | ~300 | ~200 | ~250 |
| **Open DSL (JSON)** | ✅ | ❌ | ❌ | ❌ |
| **Cloud-Native (K8s)** | ✅ | ❌ | ❌ | Partial |
| **Multi-Tenant SaaS** | ✅ | ❌ | ❌ | ❌ |
| **Compliance-First** | ✅ (HIPAA, SOC2) | ❌ | ❌ | ❌ |
| **23+ Data Connectors** | ✅ | ❌ | ❌ | ❌ |
| **Self-Hosted Option** | ✅ | ❌ | ✅ | ❌ |

---

## 📚 Referencias

- **[README.md](../README.md)** - Visión general del proyecto
- **[QUICKSTART.md](../QUICKSTART.md)** - Inicio rápido
- **[studio/README.md](../studio/README.md)** - Documentación de Studio
- **[studio/TESTING_AI_PLANNER_V2.md](../studio/TESTING_AI_PLANNER_V2.md)** - Guía de testing AI Planner
- **[engine/docs/ARCHITECTURE.md](../engine/docs/ARCHITECTURE.md)** - Arquitectura del Engine
- **[docs/ORCHESTRATOR.md](./ORCHESTRATOR.md)** - Documentación de Orchestrator

---

**Última actualización:** 27 de Enero 2026  
**Versión:** 2.0.0 (AI Planner V2 + MCP)
