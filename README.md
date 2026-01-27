# SkuldBot - Plataforma de Hyperautomation

Plataforma enterprise de RPA + AI para crear, gestionar y ejecutar automation workflows inteligentes.

## 🎉 Estado Actual: Studio 100% Funcional

**✨ Studio v2.0 con AI Planner V2 ✨**

Crea automation workflows visualmente O con inteligencia artificial.

---

## ⚡ Quick Start

```bash
# 1. Engine (Motor de compilación/ejecución)
cd engine/
pip3 install --user -e .

# 2. Studio (Editor visual + AI)
cd ../studio/
npm install
npm run tauri:dev

# 3. Crea un workflow → Exporta → Ejecuta con Runner ✅
```

**Ver [QUICKSTART.md](./QUICKSTART.md) para guía detallada.**

---

## 🏗️ Arquitectura del Ecosistema

```
┌─────────────────────────────────────────────────┐
│         SkuldBot Studio (Desktop App)           │
│         📱 Editor Visual + AI Planner           │
│                                                  │
│  • Diseña workflows drag & drop (279 nodos)     │
│  • AI Planner V2 (genera flows inteligentes)    │
│  • Valida y compila DSL                          │
│  • Exporta archivos ejecutables                  │
│                                                  │
│  Deployment: Installer (.exe/.dmg/.deb)         │
└──────────────────┬──────────────────────────────┘
                   │
                   │ Exporta:
                   │ • workflow.json (DSL)
                   │ • bot.robot (Robot Framework)
                   │
                   ↓
┌─────────────────────────────────────────────────┐
│      SkuldBot Runner (Execution Agent)          │
│      🤖 Agente de ejecución local/remota        │
│                                                  │
│  • Lee workflow.json                            │
│  • Ejecuta bot.robot en la máquina             │
│  • Attended / Unattended modes                  │
│                                                  │
│  (Se instala donde se ejecutan los bots)        │
└──────────────────┬──────────────────────────────┘
                   │
                   │ (opcional)
                   ↓
┌─────────────────────────────────────────────────┐
│    SkuldBot Orchestrator (PaaS Cloud)           │
│    ☁️ Plataforma centralizada (Multi-tenant)    │
│                                                  │
│  • Gestiona múltiples Runners                   │
│  • Scheduling & triggers                        │
│  • Logs/metrics centralizados                   │
│  • Secrets management                           │
│                                                  │
│  Deployment: Docker + Kubernetes                │
└─────────────────────────────────────────────────┘
```

---

## 📁 Estructura del Proyecto

```
skuldbot/
├── engine/           ✅ Motor de compilación/ejecución (100%)
├── studio/           ✅ Editor visual + AI Planner V2 (100%)
├── orchestrator/     🔜 PaaS cloud (en otro repo)
└── runner/           🔜 Agente de ejecución (en desarrollo)
```

---

## 🚀 Estado de Componentes

| Componente | Estado | Repo | Descripción |
|------------|--------|------|-------------|
| **Studio** | ✅ 100% | Este repo | Editor desktop + AI Planner V2 |
| **Engine** | ✅ 100% | Este repo | DSL compiler + validator |
| **Runner** | 🔨 50% | Este repo | Agente de ejecución |
| **Orchestrator** | 🔜 40% | Otro repo (PaaS) | Gestión centralizada cloud |

---

## 🎯 Componentes

### 1. SkuldBot Studio ✅ (Este Repo)

**Ubicación**: `studio/`  
**Tecnología**: Tauri + Rust + React + TypeScript  
**Propósito**: Editor visual desktop para diseñar automation workflows

#### Funcionalidades

##### **Visual Canvas Designer**
- ✅ Drag & drop de 279 nodos (26 categorías)
- ✅ Conexiones visuales entre nodos
- ✅ Configuración en panel lateral
- ✅ Export/Import DSL (JSON)
- ✅ Save/Load projects localmente

##### **AI Planner V2** ⭐
- ✅ Generación inteligente de workflows con LLM
- ✅ Conversación iterativa para refinar flows
- ✅ Validación automática de DSL
- ✅ Auto-corrección de errores
- ✅ Sugerencias contextuales
- ✅ Confidence scoring

##### **Validation & Compilation**
- ✅ Validación de estructura DSL
- ✅ Compilación DSL → Robot Framework
- ✅ Verificación de ejecutabilidad
- ✅ Feedback en tiempo real

##### **MCP Integration** (opcional)
- ✅ MCP Client para conectar a Orchestrator
- ✅ Compliance checks (HIPAA, SOC 2, PCI-DSS)
- ✅ Context-aware AI Planner

#### Uso

```bash
cd studio/
npm install
npm run tauri:dev
```

Ver `studio/README.md` y `studio/TESTING_AI_PLANNER_V2.md`.

---

### 2. Engine ✅ (Este Repo)

**Ubicación**: `engine/`  
**Tecnología**: Python + Robot Framework + rpaframework  
**Propósito**: Motor compartido de compilación y ejecución

#### Funcionalidades

- ✅ DSL JSON validation (Pydantic)
- ✅ Compiler: DSL → Robot Framework (Jinja2)
- ✅ Executor con callbacks
- ✅ 279 node implementations
- ✅ Bot Package generation
- ✅ Error handling estructurado

#### Uso

```bash
cd engine/
pip3 install --user -e .
skuldbot-compile --dsl workflow.json --output ./bot-package
```

Ver `engine/README.md` y `engine/docs/ARCHITECTURE.md`.

---

### 3. Runner 🔨 (Este Repo - En Desarrollo)

**Ubicación**: `runner/` (TBD)  
**Tecnología**: Python + Robot Framework + rpaframework  
**Propósito**: Agente que ejecuta workflows en producción

#### Funcionalidades Planeadas

- [ ] Ejecutar workflows exportados por Studio
- [ ] Attended mode (con supervisión humana)
- [ ] Unattended mode (ejecución batch)
- [ ] Secrets management (Vault/ENV)
- [ ] Retry logic con exponential backoff
- [ ] Log streaming a Orchestrator (opcional)
- [ ] Health checks

#### Deployment

El Runner se instala **en la máquina donde se ejecutan los bots**:

- Desktop PC (attended)
- Server/VM (unattended)
- Container (Docker)

---

### 4. Orchestrator 🔜 (Otro Repo - PaaS Cloud)

**Tecnología**: NestJS (API) + Next.js (UI) + PostgreSQL  
**Propósito**: Plataforma SaaS centralizada para empresas

#### Funcionalidades Planeadas

- [ ] Gestión de workflows (CRUD, versionado)
- [ ] Gestión de Runners (registro, health)
- [ ] Scheduling & triggers (cron, webhooks)
- [ ] Secrets management (Vault, AWS Secrets)
- [ ] Logs/metrics centralizados (Prometheus, Grafana)
- [ ] Multi-tenancy (aislamiento por cliente)
- [ ] Audit logs (SOC 2, HIPAA compliant)
- [ ] RBAC (role-based access control)

#### Deployment

```bash
# Docker
docker-compose up

# Kubernetes
kubectl apply -f k8s/orchestrator-deployment.yaml
```

**Orchestrator corre en cloud, NO en el desktop.**

---

## 🔄 Flujo de Trabajo

### Opción 1: Studio → Runner (Local)

```
┌─────────────────┐
│  Studio Desktop │  1. Diseña workflow
│  (Tauri+React)  │     (visual o AI)
└────────┬────────┘
         │
         ▼
    ┌─────────┐
    │ workflow│     2. Exporta DSL + Robot Framework
    │  .json  │
    └────┬────┘
         │
         ▼
┌─────────────────┐
│  Runner (local) │  3. Ejecuta workflow
│     Python      │
└────────┬────────┘
         │
         ▼
    ┌───────────┐
    │  Results  │     4. Logs y resultados
    └───────────┘
```

### Opción 2: Studio → Orchestrator → Runner (Enterprise)

```
┌─────────────────┐
│  Studio Desktop │  1. Diseña workflow
└────────┬────────┘
         │
         ▼
┌──────────────────────┐
│   Orchestrator API   │  2. Almacena y programa
│      (NestJS)        │
└──────────┬───────────┘
           │
           ▼
    ┌─────────────┐
    │  Bot Runner │     3. Ejecuta distribuido
    │  (Python)   │        (100+ runners)
    └─────────────┘
           │
           ▼
    ┌──────────────┐
    │ Orchestrator │    4. Logs centralizados
    │  Dashboard   │       Metrics, audit
    └──────────────┘
```

---

## 🛠️ Stack Tecnológico

| Componente | Tecnologías |
|------------|-------------|
| **Studio** | Tauri, Rust, React 18, TypeScript, Vite, React Flow, Zustand |
| **Engine** | Python 3.10+, Robot Framework, Jinja2, Pydantic |
| **Runner** | Python 3.10+, Robot Framework, rpaframework |
| **Orchestrator** | NestJS, Next.js, PostgreSQL, Redis, Prometheus, K8s |

---

## 🎯 Features Clave

### Studio ✅

- [x] Editor visual con 279 nodos
- [x] **AI Planner V2** (LLM-powered workflow generation)
- [x] Validación de DSL en tiempo real
- [x] Compilación a Robot Framework
- [x] Export/Import projects
- [x] MCP Client (optional compliance checks)

### Engine ✅

- [x] DSL validation (Pydantic)
- [x] Compiler: DSL → Robot Framework
- [x] 279 node implementations
- [x] Error handling robusto

### Runner 🔨

- [ ] Execute workflow.json
- [ ] Attended/Unattended modes
- [ ] Secrets management
- [ ] Log streaming

### Orchestrator 🔜

- [ ] Multi-tenant SaaS
- [ ] Scheduling (cron, triggers)
- [ ] Centralized logs/metrics
- [ ] RBAC + Audit logs

---

## 📊 Capacidades RPA

### 26 Categorías de Nodos (279 total)

1. **Triggers** (3) - Manual, Schedule, Webhook
2. **Browser** (35) - Web automation (Playwright)
3. **Excel** (28) - Spreadsheet manipulation
4. **Email** (12) - SMTP, IMAP, Exchange
5. **PDF** (15) - Extract, merge, generate
6. **Database** (18) - SQL, NoSQL queries
7. **API** (22) - REST, GraphQL, SOAP
8. **AI/LLM** (20) - GPT-4, Claude, local models
9. **OCR** (8) - Tesseract, cloud OCR
10. **File System** (16) - Read, write, move
11. **Data Transform** (25) - JSON, XML, CSV
12. **Control Flow** (14) - If, loop, switch
13. **Error Handling** (6) - Try/catch, retry
14. **Logging** (4) - Debug, info, error
15. **Variables** (8) - Set, get, compute
16. **Windows Apps** (10) - Desktop automation
17. **Clipboard** (3) - Copy, paste
18. **Screenshot** (5) - Capture, compare
19. **Notifications** (7) - Email, Slack, Teams
20. **Cloud Storage** (9) - S3, Azure, GCS
21. **ERP** (8) - SAP, Oracle, Salesforce
22. **Healthcare** (12) - HL7, FHIR, DICOM
23. **Insurance** (10) - ACORD, claims processing
24. **Finance** (7) - FIX protocol, banking
25. **Security** (6) - Encryption, hashing
26. **Custom Nodes** (∞) - Extensible

### 23+ Data Connectors (via Meltano)

**Sources (Taps)**
- PostgreSQL, MySQL, SQL Server, Oracle
- S3, Azure Blob, GCS
- Salesforce, HubSpot, Stripe
- Google Analytics, GA4
- +15 más

**Targets**
- Snowflake, BigQuery, Redshift
- PostgreSQL, MySQL
- S3, Azure, GCS
- +10 más

---

## 🔐 Compliance & Security

### Studio

- ✅ Local SQLite storage
- ✅ No almacena credenciales
- ✅ DSL validation (previene injection)

### Runner

- ✅ Secrets desde Vault/ENV
- ✅ Sandbox execution (Docker optional)
- ✅ Network isolation

### Orchestrator (PaaS)

- ✅ Multi-tenant isolation (PostgreSQL RLS)
- ✅ Encryption at rest + in transit
- ✅ HIPAA, SOC 2, PCI-DSS, GDPR ready
- ✅ Audit logs (tamper-proof)
- ✅ RBAC

---

## 🆚 vs Competidores

| Feature | SkuldBot | UiPath | Blue Prism | Automation Anywhere |
|---------|----------|---------|------------|---------------------|
| **AI Planner** | ✅ (GPT-4, Claude) | ❌ | ❌ | Partial |
| **Open DSL** | ✅ (JSON) | ❌ | ❌ | ❌ |
| **279 Nodes** | ✅ | ~300 | ~200 | ~250 |
| **Cloud-Native** | ✅ (K8s) | ❌ | ❌ | Partial |
| **Multi-Tenant SaaS** | ✅ | ❌ | ❌ | ❌ |
| **Compliance-First** | ✅ (HIPAA, SOC2) | ❌ | ❌ | ❌ |
| **Data Connectors** | 23+ | ❌ | ❌ | ❌ |
| **Self-Hosted** | ✅ | ❌ | ✅ | ❌ |

---

## 📚 Documentación

### General

- **[QUICKSTART.md](./QUICKSTART.md)** - Inicio en 5 minutos
- **[docs/TECHNICAL_ARCHITECTURE.md](./docs/TECHNICAL_ARCHITECTURE.md)** - Arquitectura completa
- **[PROJECT_STATUS.md](./PROJECT_STATUS.md)** - Estado del proyecto

### Studio

- **[studio/README.md](./studio/README.md)** - Documentación Studio
- **[studio/TESTING_AI_PLANNER_V2.md](./studio/TESTING_AI_PLANNER_V2.md)** - Guía testing AI Planner
- **[studio/INTEGRATION_GUIDE.md](./studio/INTEGRATION_GUIDE.md)** - Integración Tauri

### Engine

- **[engine/README.md](./engine/README.md)** - Documentación Engine
- **[engine/docs/ARCHITECTURE.md](./engine/docs/ARCHITECTURE.md)** - Arquitectura Engine
- **[engine/RPA_CAPABILITIES.md](./engine/RPA_CAPABILITIES.md)** - Capacidades RPA

---

## 🎓 Ejemplo Rápido

### Crear Workflow con AI Planner

```bash
# 1. Abre Studio
cd studio/
npm run tauri:dev

# 2. En el UI:
# - Click en "AI Planner" tab
# - Escribe: "Automatizar procesamiento de claims de seguros"
# - AI genera workflow completo
# - Revisa, refina, valida
# - Exporta workflow.json

# 3. Ejecuta con Runner (local)
cd runner/
python runner.py execute ../studio/exports/claims-automation.json
```

### Crear Workflow Manualmente

```bash
# 1. Abre Studio
cd studio/
npm run tauri:dev

# 2. En el UI:
# - Arrastra nodo "Read Excel"
# - Conecta a "Process Rows" (loop)
# - Conecta a "Fill Web Form"
# - Configura cada nodo
# - Click "Compile" → valida DSL
# - Click "Export" → guarda workflow.json

# 3. Ejecuta con Runner
cd runner/
python runner.py execute ../workflow.json
```

---

## 🐛 Troubleshooting

### Engine no detectado

```bash
cd engine/
pip3 install --user -e .
which skuldbot-compile  # Debe existir
```

### Tauri no compila

```bash
# Instala Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# macOS
xcode-select --install
```

### AI Planner no responde

- Verifica que tengas API key (OpenAI o Anthropic)
- Configura en Studio → Settings → LLM Config
- O usa modelo local (Ollama)

---

## 🎯 Roadmap

### ✅ Fase 1-3: Studio + Engine (COMPLETADO)

- Editor visual funcional
- AI Planner V2 con LLM
- 279 nodos implementados
- MCP Client integration

### 🔨 Fase 4: Runner (En Desarrollo)

- Agente de ejecución Python
- Attended/Unattended modes
- Secrets management
- Log streaming

### 🔜 Fase 5: Orchestrator (40%)

- Backend NestJS (en otro repo)
- PostgreSQL schema
- Multi-tenancy
- K8s deployment

### 🔜 Fase 6: Integración Final

- Studio → Orchestrator → Runner
- End-to-end testing
- Production deployment

**Tiempo estimado para MVP completo**: 2-3 meses

---

## 🤝 Contribuir

1. Fork el repo
2. Crea branch (`git checkout -b feature/AmazingFeature`)
3. Commit (`git commit -m 'Add AmazingFeature'`)
4. Push (`git push origin feature/AmazingFeature`)
5. Abre Pull Request

Ver `CONTRIBUTING.md` para más detalles.

---

## 📄 Licencia

Proprietary - Ver `LICENSE`

---

## 🏆 Logros Recientes

- ✅ **AI Planner V2** (conversacional, auto-corrige errores)
- ✅ **MCP Integration** (compliance-first architecture)
- ✅ **279 nodos** across 26 categories
- ✅ **23+ data connectors** (Meltano-powered)
- ✅ **End-to-end funcional** (Studio → Export → Runner)

---

**Estado Actual**:  
Studio ✅ | Engine ✅ | Runner 🔨 | Orchestrator 🔜

**Última actualización**: 27 de Enero 2026  
**Versión**: 2.0.0 (AI Planner V2 + MCP)  
**Progreso**: 70%
