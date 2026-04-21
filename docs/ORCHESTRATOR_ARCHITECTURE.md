# Orchestrator SkuldBot — Arquitectura de Referencia

**Fecha:** 2026-04-21
**Autores:** Albert (architecture) + research agent consolidado
**Base:** Plan Unificado Runtime (`~/.claude/plans/zippy-churning-wand.md`) + research comparativo n8n / UiPath / ElectroNeek
**Regla rectora:** Enterprise-Grade desde el día uno. NO MVPs. Cualquier módulo marcado en este doc debe construirse completo o no construirse.

---

## 0. Posicionamiento

SkuldBot es una plataforma **híbrida** que combina tres paradigmas que hoy viven en productos separados:

| Paradigma | Producto referencia | SkuldBot |
|---|---|---|
| **Flow Engine** (orquestación, APIs, integraciones, decisiones) | n8n | ✅ nativo |
| **Bot Engine** (UI real, desktop, Citrix/VDI, legacy) | UiPath / ElectroNeek | ✅ nativo |
| **Agentic / LLM Runtime** (razonamiento, planning) | ninguno — son addons | ✅ nativo en el runtime |

El Orchestrator de SkuldBot es el componente que **unifica los tres**. Debe igualar las capacidades enterprise de n8n y UiPath, superarlas en compliance (Evidence Pack criptográfico), y ser verdaderamente cloud-agnostic + multi-OS (diferenciadores donde ambos competidores cojean).

**Invariante arquitectónico:**

```
Flow Engine → Orchestrator Dispatch → Bot Job → Runner → Result → Flow Engine
                     ↑
               Nunca Flow→Runner directo
```

---

## 1. Requerimientos Funcionales (RF)

Derivados del research + plan + CLAUDE.md del proyecto:

### RF1. Gestión del ciclo de vida del bot
Bot entity con versionado (DRAFT / COMPILED / PUBLISHED / DEPRECATED / ARCHIVED), categorías, tags, metadata, manifest declarativo con `runtime.engine: flow | bot | auto`, inputSchema/outputSchema, affinity, capabilities.

### RF2. Compilación + Packaging
DSL JSON → ExecutionPlan (CFG) → `.skb` firmado (ZIP con `main.robot` + `manifest.json` + `resources/` + `requirements.txt` + signature). Package inmutable, hash verificable por el Runner antes de ejecutar.

### RF3. Ejecución real (no simulada)
**Reemplazar `RunsProcessor.simulateExecution()` por dispatch real.** Run lifecycle persistido con state machine: `CREATED / QUEUED / DISPATCHED / LEASED / RUNNING / SUCCEEDED / FAILED / CANCELLED / TIMED_OUT / RETRYING / DEAD_LETTER`.

### RF4. Dispatch multi-modo
Routing `PINNED` (runner específico) / `POOL` (selector por labels+capabilities) / `ANY` (cualquiera disponible). Capacity-aware: respetar `maxConcurrentJobs` + sesiones RDP activas + health score.

### RF5. Dual execution plane
- **Service Workers** (containers) para `engine: flow` — 80% de los runs. HA, auto-scaling, retry policies, circuit breakers.
- **Desktop Runners** (VMs + sesiones RDP aisladas) para `engine: bot` — 20%. Session Broker con políticas declarativas de asignación/reuso/destrucción.

### RF6. Runner federation
Registry multi-OS (Windows/macOS/Linux), tipos (STANDARD/HIGH_MEMORY/HIGH_CPU/GPU/BROWSER/DESKTOP/EDGE/SERVERLESS), pools con selectors, heartbeat, health scoring, auto-scaling config. Auto-register vía Machine Template + licencia por runtime slot.

### RF7. Transactional Queues (estilo UiPath Queues, distinto de BullMQ)
Queue de negocio con items transaccionales (unique references, priority, retry count, SLA + Risk SLA, auto-retry con backoff, Dead-letter). Bot consume por pull model (`GetTransactionItem`). Idempotencia nativa. **BullMQ es el transporte por debajo; Queues son la capa de negocio.**

### RF8. Triggers pluggables
Time (cron + interval + calendar), Queue (auto-dispatch cuando hay items), Webhook inbound, Storage event (Blob/S3), Email, Message Queue (Kafka/RabbitMQ/SQS/Service Bus), Event Bus interno. Scheduler HA con misfire recovery (n8n lo pierde; SkuldBot no puede permitírselo).

### RF9. Package Registry con versioning y promote
Feeds por tenant y por folder. Promote dev→staging→prod con firma separada. Rollback 1-click. SemVer obligatorio.

### RF10. Credential Store plugin architecture
BYO-Vault: Azure Key Vault, AWS Secrets Manager, HashiCorp Vault, CyberArk Conjur, GCP Secret Manager, Thycotic, BeyondTrust, local encrypted (AES-256-GCM + envelope encryption con KMS per-tenant). Plugin SDK público. **Nunca devolver valor al frontend.**

### RF11. Session Broker (RDP)
Políticas declarativas de asignación (warm vs cold), reuso (mismo tenant y mismo flow) vs destrucción (PII/PHI/PCI clasificado). Audit trail inmutable. Cleanup + profile scrub obligatorio en runs sensibles.

### RF12. Power Manager (VM lifecycle)
Interface + factory + 9 providers: Azure, AWS, GCP, VMware vSphere, Hyper-V, Proxmox, WoL, IPMI, Agent HTTP (fallback universal). Retry + timeout + idempotency + cancellation. Identidad federada (Managed Identity / IAM Role / Workload Identity) — nunca credenciales estáticas.

### RF13. Evidence Pack firmado (diferenciador)
Cada run emite Evidence Pack WORM con Merkle root + firma criptográfica + TSA real (RFC 3161) + chain of custody + retention por policy pack (7 años finance, 6 años HIPAA, etc). Verificable offline.

### RF14. Policy Packs (compile-time + runtime)
HIPAA, SOC2, PCI-DSS, GDPR, FinOps; custom por tenant. Evaluados en compile-time (inyectan controles) y runtime (aplican DLP, redactions, HITL approvals).

### RF15. HITL (Human-in-the-Loop)
Approval requests con SLA + escalation + audit. Bot/flow pausa, operador aprueba desde UI, continúa. Integración con Teams/Slack/email.

### RF16. Observabilidad enterprise
- **Tracing distribuido** OpenTelemetry OTLP → Jaeger / Tempo / Application Insights / Datadog (adapter pattern).
- **Métricas Prometheus** `/metrics` en API + workers + runners.
- **Logs estructurados** Pino + correlation ID enforcement por middleware.
- **Audit log inmutable** separado (no se mezcla con logs operacionales).

### RF17. Multi-tenancy jerárquica
`Host > Tenants > Folders > Subfolders > Resources` (≥5 niveles, inheritance de RBAC). Aislamiento de cómputo real (runners per-tenant, queues per-tenant, storage per-tenant), no solo lógico.

### RF18. Identity Service desacoplado
OIDC + SAML 2.0 + JIT provisioning. MFA obligatoria. Providers: Azure AD/Entra, Okta, Auth0, Keycloak, Google, ADFS. Separado del API (puede reemplazarse sin tocar el resto).

### RF19. RBAC granular + folder inheritance
Roles a nivel Org / Tenant / Folder. Permisos resource-scoped. Separation of duties (approver no puede ser ejecutor). Custom roles con anti-privilege-escalation.

### RF20. HA + DR
API stateless escalable horizontalmente, Postgres con HA zone-redundant + PITR, Redis con AOF + replica, Storage con versioning + WORM para evidence. RTO/RPO declarados y probados con ejercicio de DR real.

### RF21. Insights / Analytics
Dashboards OOTB (throughput, duración p50/p95, SLA compliance, runner utilization, error rate por proceso/folder/tenant, ROI). Custom dashboards. Export a herramientas externas (Power BI, Tableau).

### RF22. Webhook/Event Bus bidireccional
- **Inbound**: triggers desde sistemas externos con idempotency keys + HMAC signatures.
- **Outbound**: emitir eventos (run.started, run.completed, queue.item.added, runner.offline, etc.) con at-least-once + reintentos.

---

## 2. Requerimientos No-Funcionales (RNF)

- **RNF1 — Cloud-agnostic**: todos los providers (storage, queue, vault, identity, compute, power) detrás de interfaces. Switching cloud = config change + nuevo provider file, nunca refactor.
- **RNF2 — Multi-OS runners**: Windows + macOS + Linux nativos. Diferenciador clave vs UiPath/ElectroNeek (Windows-only de facto).
- **RNF3 — Enterprise-grade day 1**: HA, healthchecks, observability, backups, runbooks desde el primer deploy. Cero MVPs.
- **RNF4 — Compliance-first**: Evidence Pack + Policy Packs + audit log desde la primera línea.
- **RNF5 — Security-first**: Managed Identity / Workload Identity / Vault. Zero secretos en `.env`. mTLS entre componentes críticos. Envelope encryption con KMS per-tenant.
- **RNF6 — Performance targets (declarados, testeados)**:
  - Latencia dispatch (trigger → runner claim): p50 < 500ms, p99 < 2s.
  - Throughput: ≥ 1,000 runs/min por Orchestrator node.
  - Runner heartbeat: 30s default, timeout 90s.
  - Job claim timeout: 10s.
- **RNF7 — Rotation & lifecycle de secretos**: rotación sin downtime. No key monolítico (aprender de n8n CVE-2025-68613).
- **RNF8 — Sandboxing real**: Flows no corren `vm2` (abandonware con CVEs). Usar isolated-vm (V8 isolates) o Firecracker/gVisor para jobs no-trusted.
- **RNF9 — Resilience**: chaos testing obligatorio pre-prod. Circuit breakers por provider. Bulkhead isolation entre tenants.
- **RNF10 — BYO-LLM first-class (no opcional)**:
  - Todo nodo `ai.*` declara explícitamente el `provider` (OpenAI / Anthropic / Azure OpenAI / AWS Bedrock / GCP Vertex / Ollama / LM Studio / custom on-prem). No hay "default central" de Skuld.
  - **Routing policy-aware** obligatorio: datos clasificados `PHI/PII/PCI/CONFIDENTIAL` **solo** pueden enviarse a providers marcados `BYOM` o `LOCAL` (nunca a OpenAI/Anthropic public cloud salvo con BAA firmado + classification `INTERNAL/PUBLIC`).
  - Runner ejecuta el LLM call con **credenciales del tenant**, nunca con credenciales de Skuld. Skuld central no es intermediario del payload — el payload PHI no atraviesa infraestructura Skuld.
  - Evidence Pack registra por cada decision: `modelProvider`, `modelName`, `endpoint`, `tokensUsed`, `dataResidencyRegion`, `BAASignedFlag`, `promptHash`, `responseHash`.
  - Fallback configurable per-tenant si el provider BYOM está down: degradar a LOCAL edge, o fallar el run, nunca fallback silencioso a cloud pública.
  - Diferenciador vs n8n/UiPath/ElectroNeek: ninguno tiene BYO-LLM *policy-aware* nativo en el runtime.

---

## 3. Análisis Comparativo

### 3.1 Stack matrix

| Capability | n8n | UiPath | ElectroNeek | SkuldBot (target) |
|---|---|---|---|---|
| **Flow execution (DAG)** | ✅ native | ⚠️ (inside workflow logic) | ❌ | ✅ native |
| **Bot UI execution** | ❌ | ✅ | ✅ | ✅ multi-OS |
| **Agentic / LLM runtime** | ❌ (addon) | ❌ (addon) | ❌ | ✅ native |
| **Multi-OS runners** | ⚠️ (Node-only) | ❌ (Windows) | ❌ (Windows) | ✅ Win/macOS/Linux |
| **Transactional Queues (business)** | ❌ | ✅ | ❌ | ✅ |
| **BullMQ-style queues (transport)** | ✅ | ❌ | ❌ | ✅ (ambas capas) |
| **Runner affinity / labels** | ❌ | ✅ (Machine Templates) | ⚠️ | ✅ (pools + capabilities) |
| **Scheduler HA + misfire recovery** | ❌ (SPOF) | ✅ | ⚠️ | ✅ |
| **Package registry + feeds** | ❌ | ✅ (NuGet) | ⚠️ | ✅ (.skb feeds) |
| **Credential Store plugins** | ⚠️ (Enterprise) | ✅ (CyberArk/KV/HashiCorp/…) | ⚠️ | ✅ |
| **Envelope encryption + KMS per-tenant** | ❌ (key monolítica) | ✅ | ⚠️ | ✅ |
| **Evidence Pack firmado (WORM)** | ❌ | ⚠️ (audit log texto) | ❌ | ✅ (diferenciador) |
| **Policy Packs (HIPAA/SOC2/PCI/GDPR)** | ❌ | ⚠️ (CFR Part 11 manual) | ❌ | ✅ (diferenciador) |
| **Cloud-agnostic (BYO Everything)** | ⚠️ | ❌ (Azure-friendly) | ❌ (SaaS lock-in) | ✅ (diferenciador) |
| **VDI / Citrix / RDP** | ❌ | ✅ (Remote Runtime) | ⚠️ (CV only) | ✅ (image + UIA planned) |
| **Multi-tenancy con aislamiento de cómputo** | ❌ (lógico) | ✅ | ✅ | ✅ |
| **RBAC granular + folder inheritance** | ⚠️ (Enterprise) | ✅ | ⚠️ | ✅ |
| **SSO SAML + OIDC + MFA** | ⚠️ (Enterprise) | ✅ | ✅ | ✅ |
| **HA nativo (multi-node, replica, failover)** | ⚠️ (queue mode) | ✅ | ✅ | ✅ |
| **Sandboxing seguro (no vm2)** | ❌ | ✅ (process isolation) | ✅ | ✅ (isolated-vm / Firecracker) |
| **Hot secret rotation** | ❌ | ✅ | ⚠️ | ✅ |
| **Sub-workflows / call graph** | ✅ | ✅ | ✅ | ✅ (`bot.call`) |
| **Outbound webhooks** | ✅ | ✅ | ✅ | ✅ |
| **Inbound webhook triggers** | ✅ | ✅ | ✅ | ✅ |
| **Observability (OTLP + Prometheus)** | ⚠️ (Prom only) | ✅ (Insights + EFK) | ⚠️ | ✅ (OTLP-native) |
| **MSP mode (partner pricing)** | ❌ | ❌ | ✅ | ✅ (planeado en memoria) |
| **HITL approvals con SLA + audit** | ❌ (manual) | ✅ | ⚠️ | ✅ |
| **Insights / analytics dashboards** | ❌ (OSS) | ✅ (Insights) | ⚠️ (Reporter) | ✅ (post-Fase 4) |

### 3.2 Dónde ganamos (moats estructurales)

1. **Híbrido de serie**: un mismo run puede mezclar pasos flow + bot + llamadas a LLM, con `bot.call` como contrato formal. Ni n8n ni UiPath ni ElectroNeek lo ofrecen sin addons o integraciones manuales.
2. **Multi-OS real**: runners nativos en Windows/macOS/Linux. UiPath y ElectroNeek son Windows-only de facto.
3. **Compliance de día uno**: Evidence Pack WORM firmado + Policy Packs evaluados en compile-time y runtime. Nadie más lo tiene así de integrado.
4. **Cloud-agnostic**: 9 power providers + BYO-everything (storage, vault, email, SMS, LLM, OCR, identity). UiPath presupone Azure-friendly; ElectroNeek es SaaS-only.
5. **Agentic nativo**: LLM en el runtime, con `ai.llm_prompt` + razonamiento + tools (que son los propios nodos). Decisiones del agente van al Evidence Pack.

### 3.3 Dónde perdemos si no lo cerramos

- **Package registry + feeds + promote pipelines**: UiPath lo tiene maduro hace una década. Hoy SkuldBot guarda `compiledPlan` como JSON en DB — ni siquiera genera el `.skb` (según audit, es path teórico).
- **Insights/analytics OOTB**: UiPath Insights + Kibana dashboards por folder/proceso es standard enterprise. Hay que llegar ahí (Fase 6 / post-4).
- **Runtime de ejecución real**: **es la grieta crítica hoy** — `simulateExecution()` en main. Sin esto, los otros diferenciales son humo.

---

## 4. Arquitectura de Referencia

### 4.1 Vista high-level

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                         PUBLIC / TENANT BOUNDARY                               │
│                                                                                │
│  ┌───────────┐  ┌──────────────┐  ┌───────────────┐  ┌───────────────────┐   │
│  │  Studio   │  │ Web UI       │  │ External API  │  │ Inbound Webhooks  │   │
│  │ (Tauri)   │  │ (Next.js)    │  │ (REST)        │  │ + Event Sources   │   │
│  └─────┬─────┘  └───────┬──────┘  └───────┬───────┘  └─────────┬─────────┘   │
└────────┼────────────────┼─────────────────┼─────────────────────┼─────────────┘
         │                │                 │                     │
         │                └───────┬─────────┘                     │
         │                        │                               │
         ▼                        ▼                               ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │                    IDENTITY & ACCESS LAYER                           │
    │   Identity Service (OIDC + SAML + MFA)   │   RBAC / Folder ACL       │
    └──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │                 ORCHESTRATOR API (NestJS, stateless, N replicas)     │
    │                                                                      │
    │  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐ │
    │  │  Bot    │ │ Package  │ │   Run   │ │ Trigger  │ │   HITL       │ │
    │  │ Registry│ │ Registry │ │ Manager │ │ Scheduler│ │  Approvals   │ │
    │  └─────────┘ └──────────┘ └─────────┘ └──────────┘ └──────────────┘ │
    │  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐ │
    │  │  Queue  │ │ Dispatch │ │ Session │ │  Power   │ │  Credential  │ │
    │  │ Manager │ │ Router   │ │ Broker  │ │ Manager  │ │    Vault     │ │
    │  └─────────┘ └──────────┘ └─────────┘ └──────────┘ └──────────────┘ │
    │  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐ │
    │  │ Runner  │ │ Policy   │ │Evidence │ │ Webhook  │ │Observability │ │
    │  │Registry │ │ Engine   │ │  Pack   │ │Event Bus │ │ + Audit Log  │ │
    │  └─────────┘ └──────────┘ └─────────┘ └──────────┘ └──────────────┘ │
    └──────────────────────────────────────────────────────────────────────┘
        │         │           │           │                │              │
        ▼         ▼           ▼           ▼                ▼              ▼
    ┌───────┐ ┌───────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐
    │Postgres│ │ Redis │ │  Object  │ │   KMS    │ │  Vault   │ │  OTLP /     │
    │  (HA   │ │(AOF + │ │ Storage  │ │(per-ten) │ │(plugin)  │ │  Jaeger /   │
    │  PITR) │ │replica│ │(WORM+ver)│ │          │ │          │ │  App Insts) │
    └───────┘ └───────┘ └──────────┘ └──────────┘ └──────────┘ └─────────────┘
                              │
                              ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │                         EXECUTION PLANE                              │
    │                                                                      │
    │  ┌────────────────────────┐      ┌──────────────────────────────┐   │
    │  │  SERVICE WORKERS       │      │  DESKTOP RUNNERS             │   │
    │  │  (Containers)          │      │  (VMs + RDP sessions)        │   │
    │  │                        │      │                              │   │
    │  │  • engine: flow        │      │  • engine: bot               │   │
    │  │  • HTTP/DB/AI/Files    │      │  • Browser real              │   │
    │  │  • HA + auto-scale     │      │  • Desktop apps              │   │
    │  │  • Docker/K8s          │      │  • Citrix/SAP/Legacy         │   │
    │  │                        │      │  • Multi-OS (Win/mac/Lin)    │   │
    │  │  Python engine +       │      │  Python runner + RPA Fwk +   │   │
    │  │  Robot Framework       │      │  session manager             │   │
    │  └────────────────────────┘      └──────────────────────────────┘   │
    └──────────────────────────────────────────────────────────────────────┘
```

### 4.1-B Vista Ejecutiva (1 página, 12 módulos)

Diagrama de bloques oficial del Orchestrator en formato SVG (autoría Lico, aprobado 2026-04-21). Los 12 bloques son el rollup ejecutivo de los 22 módulos detallados en Sección 5. Renderable en `docs/assets/orchestrator-blocks.svg`.

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1120" viewBox="0 0 1800 1120">
  <defs>
    <style>
      .title { font: 700 28px 'Segoe UI', Arial, sans-serif; fill: #0f172a; }
      .subtitle { font: 500 15px 'Segoe UI', Arial, sans-serif; fill: #334155; }
      .zone { fill: #f8fafc; stroke: #cbd5e1; stroke-width: 2; rx: 14; }
      .module { fill: #ffffff; stroke: #94a3b8; stroke-width: 1.8; rx: 10; }
      .mtext { font: 600 13px 'Segoe UI', Arial, sans-serif; fill: #0f172a; }
      .msub { font: 500 11px 'Segoe UI', Arial, sans-serif; fill: #475569; }
      .actor { fill: #eef2ff; stroke: #818cf8; stroke-width: 1.6; rx: 10; }
      .store { fill: #ecfeff; stroke: #0891b2; stroke-width: 1.6; rx: 10; }
      .edge { stroke: #334155; stroke-width: 1.8; fill: none; marker-end: url(#arrow); }
      .edge2 { stroke: #64748b; stroke-width: 1.4; fill: none; marker-end: url(#arrow); }
      .callout { fill: #fefce8; stroke: #eab308; stroke-width: 1.4; rx: 8; }
      .ctext { font: 600 12px 'Segoe UI', Arial, sans-serif; fill: #713f12; }
    </style>
    <marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#334155"/>
    </marker>
  </defs>

  <text x="40" y="44" class="title">SkuldBot Orchestrator - Arquitectura Ejecutiva (12 Modulos)</text>
  <text x="40" y="70" class="subtitle">Flow Engine + Bot Engine + Agentic Runtime | Contrato unico: bot.call | Cloud-agnostic | Compliance-first</text>

  <rect x="40" y="110" width="250" height="64" class="actor"/>
  <text x="58" y="140" class="mtext">Studio (Tauri + React)</text>
  <text x="58" y="158" class="msub">DSL / Compile / Publish</text>

  <rect x="320" y="110" width="250" height="64" class="actor"/>
  <text x="338" y="140" class="mtext">Admin UI (Orchestrator)</text>
  <text x="338" y="158" class="msub">Ops / Runners / Jobs</text>

  <rect x="600" y="110" width="260" height="64" class="actor"/>
  <text x="618" y="140" class="mtext">External Systems</text>
  <text x="618" y="158" class="msub">Webhook / MQ / Storage / APIs</text>

  <rect x="40" y="200" width="1220" height="770" class="zone"/>
  <text x="58" y="230" class="mtext">Customer Orchestrator (in tenant subscription / on-prem)</text>

  <rect x="70" y="260" width="270" height="92" class="module"/>
  <text x="84" y="286" class="mtext">1) API Gateway + Auth/RBAC</text>
  <text x="84" y="304" class="msub">M1 Identity | M2 RBAC | M3 Tenancy</text>

  <rect x="360" y="260" width="270" height="92" class="module"/>
  <text x="374" y="286" class="mtext">2) Bot Registry / Versionado</text>
  <text x="374" y="304" class="msub">M4 Bot Registry | M5 Compiler/Package</text>

  <rect x="650" y="260" width="270" height="92" class="module"/>
  <text x="664" y="286" class="mtext">12) Scheduler / Triggers</text>
  <text x="664" y="304" class="msub">M9 Trigger/Scheduler + M19 EventBus</text>

  <rect x="940" y="260" width="290" height="92" class="module"/>
  <text x="954" y="286" class="mtext">3) Run Lifecycle Manager</text>
  <text x="954" y="304" class="msub">M6 Run Manager (state machine)</text>

  <rect x="70" y="380" width="270" height="100" class="module"/>
  <text x="84" y="406" class="mtext">4) Dispatch + Queue Manager</text>
  <text x="84" y="424" class="msub">M7 Dispatch Router</text>
  <text x="84" y="440" class="msub">M8 Transport(BullMQ) + Business Queues</text>

  <rect x="360" y="380" width="270" height="100" class="module"/>
  <text x="374" y="406" class="mtext">7) Service Worker Pool Manager</text>
  <text x="374" y="424" class="msub">M21 SW lifecycle, autoscale, isolation</text>
  <text x="374" y="440" class="msub">Flow engine workers (containers)</text>

  <rect x="650" y="380" width="270" height="100" class="module"/>
  <text x="664" y="406" class="mtext">5) Runner Manager</text>
  <text x="664" y="424" class="msub">M10 Runner Registry + M12 Power Manager</text>
  <text x="664" y="440" class="msub">Pools, capabilities, 9 power providers</text>

  <rect x="940" y="380" width="290" height="100" class="module"/>
  <text x="954" y="406" class="mtext">6) Session Broker</text>
  <text x="954" y="424" class="msub">M11 RDP session assignment / cleanup</text>
  <text x="954" y="440" class="msub">Per-job isolation, PII scrub policy</text>

  <rect x="70" y="510" width="270" height="100" class="module"/>
  <text x="84" y="536" class="mtext">8) Secrets &amp; Credential Broker</text>
  <text x="84" y="554" class="msub">M13 Vault plugins (BYO secrets)</text>
  <text x="84" y="570" class="msub">Never expose secrets to frontend</text>

  <rect x="360" y="510" width="270" height="100" class="module"/>
  <text x="374" y="536" class="mtext">9) Policy / Compliance Engine</text>
  <text x="374" y="554" class="msub">M16 Policy Packs compile+runtime</text>
  <text x="374" y="570" class="msub">M22 BYOM Routing &amp; Provider Registry</text>

  <rect x="650" y="510" width="270" height="100" class="module"/>
  <text x="664" y="536" class="mtext">10) Evidence &amp; Audit Engine</text>
  <text x="664" y="554" class="msub">M15 Evidence Pack (WORM signed)</text>
  <text x="664" y="570" class="msub">Audit trail separado (operacional)</text>

  <rect x="940" y="510" width="290" height="100" class="module"/>
  <text x="954" y="536" class="mtext">11) Observability</text>
  <text x="954" y="554" class="msub">M18 OTLP traces, metrics, logs, audit</text>
  <text x="954" y="570" class="msub">CorrelationId end-to-end</text>

  <rect x="70" y="640" width="1160" height="66" class="callout"/>
  <text x="90" y="668" class="ctext">Invariante: Flow -> Orchestrator Dispatch -> Bot Job -> Runner -> Result -> Flow</text>
  <text x="90" y="688" class="ctext">Prohibido: Flow -> Runner directo | Contrato unico de invocacion: bot.call</text>

  <rect x="1280" y="200" width="480" height="500" class="zone"/>
  <text x="1298" y="230" class="mtext">Execution Plane</text>

  <rect x="1310" y="260" width="420" height="110" class="module"/>
  <text x="1326" y="288" class="mtext">Service Workers (Flow Runtime)</text>
  <text x="1326" y="308" class="msub">Containers / K8s jobs | stateless compute</text>
  <text x="1326" y="326" class="msub">Receives flow runs from M21 + M7</text>

  <rect x="1310" y="395" width="420" height="130" class="module"/>
  <text x="1326" y="423" class="mtext">Desktop Runners (Bot Runtime)</text>
  <text x="1326" y="443" class="msub">Windows/macOS/Linux | UI automation</text>
  <text x="1326" y="461" class="msub">RDP/Citrix/SAP/Legacy | session-isolated</text>
  <text x="1326" y="479" class="msub">Managed by M10/M11/M12</text>

  <rect x="1310" y="550" width="420" height="120" class="module"/>
  <text x="1326" y="578" class="mtext">Runner Agent</text>
  <text x="1326" y="598" class="msub">register / heartbeat / poll / claim / execute</text>
  <text x="1326" y="616" class="msub">Returns status, output, artifacts, evidence refs</text>

  <rect x="40" y="990" width="1720" height="100" class="zone"/>
  <text x="58" y="1018" class="mtext">Data Plane (tenant-owned)</text>

  <rect x="260" y="1028" width="220" height="44" class="store"/>
  <text x="278" y="1056" class="mtext">PostgreSQL</text>

  <rect x="500" y="1028" width="220" height="44" class="store"/>
  <text x="518" y="1056" class="mtext">Redis / BullMQ</text>

  <rect x="740" y="1028" width="280" height="44" class="store"/>
  <text x="758" y="1056" class="mtext">Object Storage (WORM)</text>

  <rect x="1040" y="1028" width="250" height="44" class="store"/>
  <text x="1058" y="1056" class="mtext">Vault / KMS</text>

  <rect x="1310" y="1028" width="280" height="44" class="store"/>
  <text x="1328" y="1056" class="mtext">OTLP / Monitoring Backend</text>

  <path d="M290,142 L70,296" class="edge"/>
  <path d="M570,142 L70,296" class="edge2"/>
  <path d="M860,142 L650,296" class="edge2"/>
  <path d="M340,306 L360,306" class="edge"/>
  <path d="M630,306 L650,306" class="edge"/>
  <path d="M920,306 L940,306" class="edge"/>
  <path d="M1085,352 L1085,380" class="edge"/>
  <path d="M340,430 L360,430" class="edge"/>
  <path d="M630,430 L650,430" class="edge"/>
  <path d="M920,430 L940,430" class="edge"/>
  <path d="M205,480 L205,510" class="edge2"/>
  <path d="M495,480 L495,510" class="edge2"/>
  <path d="M785,480 L785,510" class="edge2"/>
  <path d="M1085,480 L1085,510" class="edge2"/>
  <path d="M630,430 L1310,315" class="edge"/>
  <path d="M1230,430 L1310,460" class="edge"/>
  <path d="M1230,430 L1310,610" class="edge2"/>
  <path d="M1520,550 L920,430" class="edge2"/>
  <path d="M1085,610 L1085,1028" class="edge2"/>
  <path d="M785,610 L860,1028" class="edge2"/>
  <path d="M205,610 L370,1028" class="edge2"/>
  <path d="M495,610 L605,1028" class="edge2"/>
  <path d="M995,610 L1450,1028" class="edge2"/>

  <text x="1350" y="1094" class="subtitle">© 2026 Skuld, LLC</text>
</svg>
```

**Mapeo 12 bloques ejecutivos ↔ 22 módulos detallados:**

| # | Bloque Ejecutivo | Módulos detallados (Sec. 5) |
|---|---|---|
| 1 | API Gateway + Auth/RBAC | M1 Identity + M2 RBAC + M3 Tenancy |
| 2 | Bot Registry / Versionado | M4 Bot Registry + M5 Compiler & Package Registry |
| 3 | Run Lifecycle Manager | M6 Run Manager |
| 4 | Dispatch + Queue Manager | M7 Dispatch Router + M8 Queue Manager (transport + business) |
| 5 | Runner Manager | M10 Runner Registry + M12 Power Manager |
| 6 | Session Broker | M11 Session Broker |
| 7 | Service Worker Pool Manager | M21 |
| 8 | Secrets & Credential Broker | M13 Credential Vault |
| 9 | Policy / Compliance Engine | M16 Policy Engine + M22 BYOM Routing (first-class) |
| 10 | Evidence & Audit Engine | M15 Evidence Pack (WORM firmado) + parte audit de M18 |
| 11 | Observability | M18 Observability (OTLP + Prometheus + correlation) |
| 12 | Scheduler / Triggers | M9 Trigger & Scheduler + M19 Webhook & Event Bus |

Módulos en sección 5 que **no aparecen en los 12 ejecutivos** (son entregables de cross-cutting o fases posteriores, conscientemente diferidos del rollup ejecutivo):
- M14 Artifact Storage — utility infra subyacente (bajo Data Plane en el diagrama)
- M17 HITL — parte de Policy Engine en vista ejecutiva (fase 6 UI)
- M20 Insights & Analytics — fase 6 UX

### 4.2 Contextos de confianza

- **Public zone**: Studio, Web UI, External API gateway, webhooks.
- **Tenant control zone**: Orchestrator API + DB + Redis + Storage + KMS — todo detrás de private endpoints, solo accesible dentro de la VNet del tenant.
- **Execution zone**: Service Workers (ephemeral containers) + Desktop Runners (pinned VMs). Comunicación con Orchestrator solo vía API HTTPS (outbound) + WebSocket (long-lived, auth via API key rotativa + mTLS opcional).

---

## 5. Módulos del Orchestrator (22 módulos)

Cada módulo es un NestJS module con ownership claro, entity(s) dedicadas, endpoints propios, tests de integración, runbook. Los 22 módulos se presentan ejecutivamente como 12 bloques (ver Sec. 4.1-B); el detalle técnico queda acá.

### Control Modules

#### M1. **Identity & Access**
Responsabilidades: autenticación (OIDC/SAML), gestión de users, SSO, MFA, API keys.
Archivos clave: `auth/`, `identity/`, `users/`, `api-keys/`.
Deps: Azure AD / Entra / Okta / Keycloak (pluggable).

#### M2. **RBAC & Policies**
Responsabilidades: roles, permisos, folder inheritance, separation of duties, custom roles con anti-escalation.
Archivos: `rbac/`, `policies/` (no confundir con Policy Engine RF14).

#### M3. **Tenancy**
Responsabilidades: Host → Tenant → Folder hierarchy, inheritance ACL, resource scoping.
Archivos: `tenancy/`, `folders/`.

### Bot Lifecycle Modules

#### M4. **Bot Registry**
Responsabilidades: CRUD bots, versioning (DRAFT/COMPILED/PUBLISHED/DEPRECATED/ARCHIVED), tags, categorías, clone/share/export.
Estado actual: ✅ implementado (285 LOC entity + controllers).
Gap: versioning workflow de `promote` dev→staging→prod no implementado.

#### M5. **Compiler & Package Registry**
Responsabilidades: DSL → ExecutionPlan → `.skb` firmado. Feeds per-tenant + per-folder. Promote + rollback.
Estado actual: ⚠️ `compiledPlan` guardado como JSON en DB, `.skb` es path teórico.
Gap crítico: **no hay packager real** (Fase 1 blocker 2).
Archivos a crear: `bots/packager.service.ts`, `bots/templating/robot-template.ts`, `bots/package-registry.service.ts`, `bots/controllers/bot-package.controller.ts`.

### Execution Modules

#### M6. **Run Manager**
Responsabilidades: Run + RunEvent + RunLog + RunArtifact entities, lifecycle state machine, endpoints CRUD/cancel/pause/resume/retry.
Estado actual: ✅ extensivamente modelado (1,181 LOC run.entity.ts).
Gap: dispatch real (ver M7).

#### M7. **Dispatch Router**
Responsabilidades: decidir dónde y cómo ejecutar un run.
- Input: Run + compiledPlan
- Decisión 1: `engine: flow` → Service Workers | `engine: bot` → Desktop Runners
- Decisión 2: PINNED / POOL / ANY + capability matching + capacity-aware
Estado actual: ⚠️ `DispatchService` existe, pero `RunsProcessor` tiene `simulateExecution()` mock.
Gap crítico: **reemplazar `simulateExecution()` por dispatch real** (Fase 1 blocker 3).

#### M8. **Queue Manager**
Responsabilidades: 2 capas:
- **Transport layer (BullMQ)**: 3 colas fijas — `skuldbot:jobs`, `skuldbot:priority`, `skuldbot:dead-letter`. Targeting resuelto antes de encolar.
- **Business layer (Transactional Queues)**: entidad `Queue` + `QueueItem` con unique references, priority, retry, SLA+Risk SLA, auto-retry, DLQ. Pull model (`getTransactionItem`).
Archivos a crear: `queues/transactional-queue.service.ts`, `queues/queue-item.entity.ts`, `dispatch/queue-factory.service.ts`.

#### M9. **Trigger & Scheduler**
Responsabilidades: procesar triggers (cron, interval, calendar, webhook inbound, queue, storage event, email, MQ).
- Scheduler HA (líder elegido via Redis) con misfire recovery persistido.
- Trigger abstraction pluggable.
Estado actual: ✅ entity rica (CRON/INTERVAL/CALENDAR/WEBHOOK soportados), ⚠️ Event/FileWatcher/Email son stubs.
Gap: implementar provider pattern para triggers externos.

### Runner Modules

#### M10. **Runner Registry**
Responsabilidades: Runner entity + types + pools + heartbeat + health scoring + capabilities + machine templates.
Estado actual: ✅ extensivamente modelado (756 LOC entity).
Gap: machine templates + licencia por slot no implementados.

#### M11. **Session Broker**
Responsabilidades: RDP session lifecycle. Políticas declarativas de asignación (warm vs cold), reuso vs destrucción, cleanup + scrub en PII/PHI/PCI.
Estado actual: ❌ no existe.
Archivos a crear: `session-broker/session-broker.service.ts`, `session-broker/entities/rdp-session.entity.ts`, `session-broker/policies/`.

#### M12. **Power Manager**
Responsabilidades: VM lifecycle (powerOn/powerOff/status/restart) con interface + factory + 9 providers (Azure/AWS/GCP/VMware/Hyper-V/Proxmox/WoL/IPMI/Agent HTTP).
Estado actual: ⚠️ `InfraPowerService` con stubs que loggean.
Gap crítico (Fase 3): reemplazar stubs por implementaciones reales, empezando con Azure + Agent HTTP.

### Data & State Modules

#### M13. **Credential Vault**
Responsabilidades: BYO-Vault plugin architecture. Plugins: Azure KV, AWS SM, HashiCorp, CyberArk, GCP SM, Thycotic, BeyondTrust, local (AES-256-GCM + envelope encryption + KMS per-tenant).
Estado actual: ✅ base implementada (encryption service + entity + rotation history).
Gap: plugin SDK público + integración con CyberArk/Thycotic/BeyondTrust faltantes.

#### M14. **Artifact Storage**
Responsabilidades: subida/descarga de artifacts por run. Storage abstraction (S3/Azure Blob/GCS/MinIO/local/SFTP). Versioning, retention, WORM para evidence packs.
Estado actual: ✅ S3 + local providers + RunArtifact entity.
Gap: WORM policy enforcement por container.

#### M15. **Evidence Pack Manager**
Responsabilidades: generación de Evidence Pack WORM firmado, chain of custody, TSA real (RFC 3161), retention por Policy Pack, verificación offline.
Estado actual: ⚠️ ~11 archivos, pero TSA es `simulated-tsa` (string hardcoded).
Gap crítico: integrar TSA real (FreeTSA, DigiCert, o self-hosted RFC 3161).

### Cross-Cutting Modules

#### M16. **Policy Engine**
Responsabilidades: compile-time + runtime evaluation de Policy Packs (HIPAA, SOC2, PCI, GDPR, Finance, custom).
- Compile-time: inyectar controles (DLP scan, redaction, audit log, HITL approval) en el ExecutionPlan.
- Runtime: evaluar clasificaciones, aplicar redactions, disparar approvals.
Estado actual: ❌ referenciado en CLAUDE.md + runtime architecture pero no implementado como módulo.
Archivos a crear: `policy/policy-engine.service.ts`, `policy/packs/` (hipaa/soc2/pci/gdpr), `policy/evaluate.ts`.

#### M17. **HITL (Human-in-the-Loop)**
Responsabilidades: approval requests, SLA + escalation, audit, notificación (Teams/Slack/email). Pausa run, espera approver, continúa.
Estado actual: ✅ `HitlRequest` entity existente.
Gap: integración con notificación + UI de approvals.

#### M18. **Observability**
Responsabilidades: OpenTelemetry OTLP exporter (Jaeger/Tempo/App Insights/Datadog), Prometheus `/metrics`, correlation ID middleware, Pino estructurado, audit log inmutable separado.
Estado actual: ❌ `spanId` schema preparado pero no hay OTLP. Sin Prometheus. Sin App Insights.
Gap crítico (Fase 0-1): implementar stack completo.

#### M19. **Webhook & Event Bus**
Responsabilidades: inbound webhooks (con HMAC + idempotency), outbound webhooks (run.*, queue.*, runner.*, evidence.* events), Event Bus interno para comunicación inter-módulo.
Estado actual: ⚠️ triggers webhook inbound parcial.
Gap: outbound webhooks + idempotency keys + Event Bus.

#### M20. **Insights & Analytics**
Responsabilidades: dashboards OOTB (throughput, duración, SLA, utilization, error rate, ROI), custom dashboards, export a Power BI / Tableau.
Estado actual: ❌ no existe.
Archivos a crear: `insights/` módulo completo (Fase 6).

### Runtime & Provider Modules

#### M21. **Service Worker Pool Manager**
Nota: elevado a módulo propio tras revisión (originalmente dentro de M7 Dispatch). Los Service Workers son ephemeral containers para Flow Engine (80% de runs), lifecycle distinto a Desktop Runners (VMs long-lived con RDP).
Responsabilidades:
- Pool management (min/max replicas, auto-scaling por queue depth).
- Container lifecycle: Docker (dev), Kubernetes Jobs / Azure Container Apps / AWS Fargate (prod).
- Health + readiness probes por worker.
- Job claim + execute + shutdown (ephemeral: 1 job = 1 container).
- Resource limits (CPU, memory) por pool.
- Graceful drain en deploys (terminar jobs in-flight antes de shutdown).
Estado actual: ❌ no existe. Falta completo.
Archivos a crear:
- `orchestrator/api/src/service-workers/sw-pool-manager.service.ts`
- `orchestrator/api/src/service-workers/entities/service-worker-pool.entity.ts`
- `orchestrator/api/src/service-workers/container-orchestrator/` (adapters: docker, k8s, aca, fargate)
- `docker/service-worker/Dockerfile` (imagen: Node + engine Python embedded)

#### M22. **BYOM Routing & Provider Registry**
Responsabilidades: primary class del diferenciador BYO-LLM.
- **Provider Registry per-tenant**: catálogo de LLM providers configurados (OpenAI, Anthropic, Azure OpenAI, AWS Bedrock, GCP Vertex, Ollama self-hosted, LM Studio, custom on-prem endpoints) con sus credenciales (vía Credential Vault M13), endpoints, modelos habilitados, data residency region.
- **Routing Decision Engine**: recibe `dataClassification` (PHI/PII/PCI/CONFIDENTIAL/INTERNAL/PUBLIC) + `nodeType` (ai.llm_prompt, ai.embeddings) + policy context → devuelve provider + endpoint + credencial + budget/quota remaining.
- **Policy enforcement**: integrado con Policy Engine (M16). Si el ExecutionPlan tiene datos clasificados `PHI` y el flow intenta provider cloud público → **compile-time error** (no se publica el bot). Runtime double-check antes de cada call.
- **Health check + fallback**: probe por provider (uptime, latencia, error rate). Fallback configurable per-tenant: (a) degradar a LOCAL edge LLM, (b) fallar el run, (c) retry en provider alterno compatible. **Nunca fallback silencioso a provider cloud público si la data es clasificada**.
- **Usage tracking**: tokens usados, latencia, costo estimado — emitido a Observability (M18) y Billing (CP, congelado pero hooks listos).
- **BAA / DPA tracking**: flag `BAASignedFlag` por provider-tenant (si el provider tiene BAA con el tenant). Controla qué providers pueden procesar PHI.
- **Diferenciador estructural**: ni n8n ni UiPath ni ElectroNeek tienen BYOM policy-aware nativo. Los addons LLM que existen en esos productos asumen LLM centralizado.
- **Studio ya expone el catálogo BYOM**: nodos `ai.llm_prompt`/`ai.embeddings` con multi-provider configurable (`studio/src/data/nodeTemplates.ts`).
Estado actual: ⚠️ **Studio tiene la UI; Orchestrator debe implementar Registry + Routing + Policy enforcement de 0.**
Archivos a crear:
- `orchestrator/api/src/byom/byom-registry.service.ts`
- `orchestrator/api/src/byom/byom-router.service.ts`
- `orchestrator/api/src/byom/entities/llm-provider.entity.ts`
- `orchestrator/api/src/byom/entities/llm-provider-usage.entity.ts`
- `orchestrator/api/src/byom/providers/` (adapters: openai, anthropic, azure-openai, bedrock, vertex, ollama, lm-studio, custom-http)
- `orchestrator/api/src/byom/policy-bridge.ts` (integración con M16)
- `packages/compiler/src/validators/byom-compliance.ts` (compile-time check de PHI→provider)

---

## 6. Data Model — Entities Clave

| Entity | Módulo | Relaciones principales |
|---|---|---|
| `Tenant` | M3 | 1:N `Folder`, 1:N `User`, 1:N `Runner` |
| `Folder` | M3 | N:1 `Tenant`, 1:N `Bot`, 1:N `Queue`, 1:N `Credential` |
| `User` | M1 | N:N `Role`, 1:N `AuditLog` |
| `Role` | M2 | N:N `Permission` |
| `Bot` | M4 | 1:N `BotVersion`, N:1 `Folder` |
| `BotVersion` | M4+M5 | 1:1 `Package`, 1:N `Run` |
| `Package` (.skb) | M5 | 1:1 `BotVersion`, stored in Artifact Storage (signed) |
| `Run` | M6 | N:1 `BotVersion`, N:1 `Runner`, 1:N `RunEvent`, 1:N `RunArtifact`, 1:1 `EvidencePack` |
| `RunEvent` | M6 | N:1 `Run`, includes correlationId + spanId |
| `Runner` | M10 | N:1 `Tenant`, N:1 `RunnerPool`, 1:N `Run`, 1:N `RunnerHeartbeat` |
| `RunnerPool` | M10 | 1:N `Runner`, selector (labels/capabilities) |
| `RdpSession` | M11 | N:1 `Runner`, N:1 `Run`, status, cleanup policy |
| `Queue` (business) | M8 | 1:N `QueueItem`, N:1 `Folder` |
| `QueueItem` | M8 | N:1 `Queue`, unique reference, priority, SLA |
| `Credential` | M13 | N:1 `Folder`, provider metadata, never plaintext |
| `EvidencePack` | M15 | 1:1 `Run`, WORM, signed manifest, chain of custody |
| `Schedule` | M9 | N:1 `Bot`, trigger type, cron, overlap/catchup policy |
| `HitlRequest` | M17 | N:1 `Run`, approver, SLA, escalation |
| `Webhook` | M19 | direction (in/out), endpoint, HMAC secret |
| `AuditLog` | M18 | immutable, separate from operational logs |

---

## 7. Integration Points

### 7.1 Studio ↔ Orchestrator
- **Deploy**: `POST /api/bots/{botId}/versions` → upload DSL + manifest → compile → store .skb
- **Debug live**: WebSocket `/ws/debug/{runId}` para logs streaming
- **Vault test connection**: `POST /api/credentials/test-connection`
- **Dev loop**: en Studio el botón "Debug" corre local; "Deploy" va al Orchestrator

### 7.2 Runner ↔ Orchestrator
- **Register**: `POST /api/runners/register` → recibe API key rotativa
- **Heartbeat**: `POST /api/runners/{runnerId}/heartbeat` cada 30s
- **Poll jobs**: `GET /api/runners/{runnerId}/pending-jobs`
- **Claim**: `POST /api/runners/jobs/{jobId}/claim`
- **Progress**: `POST /api/runners/jobs/{jobId}/events` (logs + events con correlationId)
- **Artifacts**: `POST /api/runners/jobs/{jobId}/artifacts` (multipart or signed URL upload)
- **Complete**: `POST /api/runners/jobs/{jobId}/complete`
- **WebSocket**: `/ws/runners` para comandos síncronos (cancel, pause, terminate session)

### 7.3 Service Worker ↔ Orchestrator
- Mismo shape que Runner pero con identidad diferente (`worker_pool_id` vs `runner_id`) y sin heartbeat long-lived (SW son ephemeral por job).

### 7.4 External systems
- **Inbound webhooks**: `POST /webhooks/{tenant}/{botId}` + HMAC signature + idempotency key
- **Outbound webhooks**: firmados HMAC, at-least-once, retries con backoff, dead-letter
- **SIEM**: Evidence Pack + audit log → SIEM provider (Splunk, Elastic, Sentinel, Datadog Security)

---

## 8. Gap Analysis vs Código Actual

Clasificación: ✅ completo / ⚠️ parcial o stub / ❌ falta por completo

Fuentes del estado: audit directo del código + confirmación de Lico (2026-04-21) sobre estado real de Compliance día 1.

| Módulo | Estado | Evidencia / Gap principal |
|---|---|---|
| M1 Identity & Access | ⚠️ | Base OIDC/SAML implementado; MFA obligatoria y JIT provisioning faltan |
| M2 RBAC & Policies | ⚠️ | Role/Permission existen; folder inheritance + custom org roles faltan |
| M3 Tenancy | ⚠️ | tenantId en todas las entities; folder hierarchy multi-level falta |
| M4 Bot Registry | ✅ | OK |
| M5 Compiler & Package | ⚠️ | **Crítico**: `.skb` packaging real + registry por feed + promote pipeline faltan |
| M6 Run Manager | ✅ | Entity+lifecycle modelado (1,181 LOC run.entity.ts); state machine persistida falta |
| M7 Dispatch Router | ⚠️ | **Crítico**: `simulateExecution()` mock vigente en `orchestrator/api/src/dispatch/runs.processor.ts`. Engine routing flow/bot falta |
| M8 Queue Manager | ⚠️ | BullMQ transport funciona; Transactional Queues (business) faltan |
| M9 Trigger & Scheduler | ⚠️ | Cron/Interval/Webhook OK; Event/File/Email stubs; HA + misfire recovery faltan |
| M10 Runner Registry | ✅ | Machine Templates + licencia por slot faltan |
| M11 Session Broker | ❌ | Falta completo |
| M12 Power Manager | ⚠️ | **Crítico**: 9 provider stubs que loggean (`orchestrator/api/src/dispatch/infra-power.service.ts`); Azure + Agent HTTP a implementar real |
| M13 Credential Vault | ⚠️ | Base funcional; plugin SDK público + 3-4 providers (CyberArk/Thycotic/BeyondTrust) faltan |
| M14 Artifact Storage | ✅ | WORM enforcement por container falta |
| M15 Evidence Pack | ⚠️ | **Infrastructure sólida presente** (`orchestrator/api/src/evidence/`: writer, integrity, signature, retention, custody, attestation, PDF, SIEM subdirs + `evidence-pack.service.ts` + `evidence.controller.ts`). **Gap crítico**: TSA simulado (`signature.service.ts` retorna `"simulated-tsa"`). Integrar RFC 3161 real (FreeTSA / DigiCert / self-hosted) + hash chain entre packs + firma con KMS |
| M16 Policy Engine | ⚠️ | **Compile-time existe y funciona** (`packages/compiler/src/policy/evaluate.ts` + `packages/compiler/src/types/policy.ts`). **Runtime parcial**: `orchestrator/api/src/policies/policies.service.ts` es **in-memory** (no persistencia enterprise — un restart del Orchestrator pierde state). Portar a entity persistida + versionado + audit de cambios. Y crear los 5 packs canónicos (HIPAA/SOC2/PCI/GDPR/Finance) como seeds |
| M17 HITL | ⚠️ | Entity existe; UI + notificación faltan |
| M18 Observability | ❌ | **Crítico**: OTLP + Prometheus + App Insights + correlation middleware faltan |
| M19 Webhook & Event Bus | ⚠️ | Inbound parcial; outbound + Event Bus interno faltan |
| M20 Insights & Analytics | ❌ | Falta completo (Fase 6) |
| **M21 Service Worker Pool Manager** | ❌ | Falta completo. Existe `orchestrator/api/src/dispatch/` pero sin pool de containers. Docker/K8s adapters por construir |
| **M22 BYOM Routing & Provider Registry** | ⚠️ | **Studio expone catálogo** (`studio/src/data/nodeTemplates.ts`: OpenAI/Anthropic/Azure OpenAI/Ollama/AWS Bedrock como providers en `ai.model`/`ai.llm_prompt`). **Orchestrator**: Registry + Router + Policy enforcement faltan completos. Provider adapters en runtime Python por implementar |

**Total**: 2 ✅ completos, **14 ⚠️ parciales** (incluyendo 2 con infraestructura sólida pero TSA/persistencia pendientes), **6 ❌ faltantes**.

**Nota sobre Compliance día 1** — hallazgo importante del audit:
- Lo que parecía ❌ falta en M15/M16 en realidad está ⚠️ parcial: **hay infraestructura sólida** (writer/integrity/signature/retention en evidence, compile-time evaluator en policy, API endpoints en orchestrator). **Los gaps son concretos y acotados**: TSA simulado (fix: RFC 3161 real), policies in-memory (fix: persistencia). Esto acelera Fase 1 del Plan Unificado considerablemente — **no partimos de cero**, partimos de 70% y subimos el 30% que falta a enterprise-grade.

---

## 9. Mapeo al Plan Unificado

| Módulo | Fase en Plan Unificado | Razón |
|---|---|---|
| M1, M2, M3 (extender) | Fase 0 | Sin Identity robusto no hay deploy enterprise |
| M18 Observability | Fase 0 | Se despliega con el Orchestrator desde día 0 |
| M5 Packager, M7 Dispatch real (eliminar simulateExecution) | Fase 1 | Bloqueadores críticos del E2E |
| M8 Queue Manager (BullMQ 3-colas) | Fase 1 | Necesario para dispatch real |
| **M21 Service Worker Pool Manager** | Fase 1 | Ejecución real de flows requiere pool de SW desde Fase 1 (no "1 container de prueba") |
| **M22 BYOM Routing & Provider Registry + compile-time policy check** | Fase 1 | Diferenciador BYO-LLM first-class; Studio ya expone catálogo, Orchestrator debe enforcement desde el primer run |
| M6 Run lifecycle persistido, M19 Event Bus | Fase 1 | Core de ejecución y trazabilidad |
| M15 Evidence Pack con TSA real | Fase 1 | Compliance desde día 1 (ya hay 70% de infraestructura — fix TSA + hash chain) |
| M16 Policy Engine (persistencia) | Fase 1 | Mover de in-memory a entity persistida + seed 5 packs canónicos |
| M11 Session Broker | Fase 2 | Desktop runners serios |
| M12 Power Manager real (Azure + Agent HTTP) | Fase 3 | Stubs → real |
| M9 Scheduler HA + misfire recovery, retry policies formalizados | Fase 4 | Hardening |
| M12 Power Manager (AWS/GCP/VMware/Hyper-V/Proxmox/WoL/IPMI) | Fase 5 | Multi-cloud + on-prem |
| M8 Transactional Queues (business layer) | Fase 4 | Después de queues base estables |
| M16 Policy Engine runtime hardening | Fase 4 | Runtime interceptors + chaos testing |
| M22 BYOM health check + fallback policies + usage tracking | Fase 4 | Hardening después de routing básico |
| M17 HITL UI, M20 Insights & Analytics | Fase 6 | UX completa |

---

## 10. Quality Gates (por módulo)

Además de los QG globales del plan, cada módulo debe pasar:

- **QG-M**: Contrato API documentado (OpenAPI) + changelog + ADR.
- **QG-M-Tests**: Integration tests contra Docker compose real; unit tests > 80% coverage.
- **QG-M-Security**: threat model documentado; secrets via Vault; no plaintext en logs.
- **QG-M-Obs**: métricas Prometheus + spans OTLP + logs estructurados con correlationId.
- **QG-M-Docs**: runbook operacional + diagrama de secuencia + troubleshooting.
- **QG-M-Compliance**: si toca datos clasificados (PII/PHI/PCI), policy check + Evidence Pack integration.

---

## 11. Riesgos y Mitigaciones

| Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|
| `simulateExecution` sigue en main más allá de Fase 1 | Alto | Media | QG bloqueante; test E2E que falla si detecta la llamada |
| Deriva entre Flow Engine y Bot Engine (runtimes divergentes) | Alto | Media | Un solo runtime core Python (engine/skuldbot) — Service Workers y Desktop Runners solo cambian el wrapper |
| Power providers difíciles de testear sin credenciales reales | Medio | Alta | Sandboxes dedicados + provider con simulator (Azurite-like) donde exista |
| Evidence Pack TSA timestamping falla offline | Medio | Baja | Cache de TSA responses + fallback TSA (2+ providers configurados) |
| Credential Vault plugin SDK complejo | Medio | Media | Empezar con 3 providers (Azure KV, HashiCorp, local); abrir SDK en Fase 3 |
| Scheduler HA (líder elegido) mal implementado → duplicación | Alto | Media | Usar library probada (Redlock-io/Bull workers con unique job IDs) |
| n8n CVE-ridden (vm2): si replicamos, heredamos los CVEs | Alto | Baja (si lo hacemos bien) | Usar isolated-vm desde día 1, nunca vm2 |

---

## 12. Open Questions (pendientes de decisión)

1. **Identity Service**: ¿separamos en microservicio independiente (como UiPath Identity Server) o lo dejamos como módulo dentro del Orchestrator API? *Recomendación*: separado desde Fase 0 para poder reemplazarlo sin tocar el resto.
2. **Transactional Queues**: ¿las exponemos desde Fase 1 o esperamos a Fase 4? *Recomendación*: Fase 4 — primero estabilizar queues transport y lifecycle.
3. **Sandboxing de flows en Service Workers**: isolated-vm (V8 isolates) suficiente, o necesitamos Firecracker/gVisor para jobs no-trusted? *Recomendación*: isolated-vm para flows escritos en nodos conocidos; Firecracker solo si exponemos Code nodes arbitrarios.
4. **MSP mode**: ¿arranca en Fase 6 o antes? *Recomendación*: Fase 6 (después de estabilizar runtime core) — coherente con memoria "Licencias/modelo de negocio: después de estabilizar runtime core".
5. **Custom plugins**: ¿abrimos plugin SDK público (como UiPath Credential Store plugins) o mantenemos todos los plugins cerrados? *Recomendación*: abrir en Fase 5-6 para Credential Stores + Trigger providers + Power providers — aceleraría integraciones enterprise.

---

## 13. Referencias

- Plan Unificado Runtime: `~/.claude/plans/zippy-churning-wand.md`
- CLAUDE.md (principios de seguridad, arquitectura, cloud-agnostic, BYO): raíz del repo
- Design docs existentes:
  - `docs/chatgptaportes.md` — decisiones arquitectónicas de runner/dispatch
  - `docs/TECHNICAL_ARCHITECTURE.md` — overview original
- n8n research: [docs.n8n.io/hosting/scaling/queue-mode](https://docs.n8n.io/hosting/scaling/queue-mode/) · [docs.n8n.io/flow-logic/execution-order](https://docs.n8n.io/flow-logic/execution-order/) · CVE-2025-68613 (expression injection)
- UiPath research: [docs.uipath.com/orchestrator](https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/about-orchestrator) · Machine Templates · Queues · Credential Stores · Remote Runtime
- ElectroNeek research: [docs.electroneek.com](https://docs.electroneek.com/docs/products-and-services) · MSP model · Bot Runner unlimited

---

## 14. Cambios que este doc implica en el Plan Unificado

El Plan Unificado ya cubre lo esencial pero este análisis agrega precisión en:

1. **Módulo 8 (Queue Manager)**: separar explícitamente Transport Layer (BullMQ) de Business Layer (Transactional Queues estilo UiPath). El Plan Unificado solo hablaba de BullMQ 3-colas — agregar Transactional Queues a Fase 4.
2. **Módulo 16 (Policy Engine)**: no estaba nombrado como módulo independiente. Debe existir desde Fase 1 (compile-time) con runtime evaluation en Fase 4.
3. **Módulo 20 (Insights)**: dashboards OOTB no estaban explícitos; agregar como entregable de Fase 6.
4. **Package Registry + Feeds + Promote dev→staging→prod**: no estaba explícito en el Plan. Es parte del entregable de Fase 1 (junto con packager).
5. **Identity Service desacoplado**: el Plan Unificado no lo diferencia del API. Recomendación: separar desde Fase 0 como servicio dedicado (como UiPath).
6. **Scheduler HA con misfire recovery**: el Plan menciona scheduler pero no HA. Agregar a Fase 4 (Hardening).
7. **Sandboxing seguro (isolated-vm)**: aprender de CVE-2025-68613 de n8n. Explicitar en RNF8 y Fase 1 como requisito.

---

**Este documento es living — se actualiza cuando:**
- Se agregue un módulo nuevo (por compliance, por integración, por mercado).
- Se descubran gaps en el code audit periódico.
- Se cierre una Open Question.
- Una QG se refine tras chaos testing.
