# Luis — Tarea Fase 0: Orchestrator Enterprise-Grade en Azure

**Fecha asignación:** 2026-04-21
**Responsable:** Luis
**Revisión final:** Albert + Dubiel
**Plan de referencia:** `~/.claude/plans/zippy-churning-wand.md` (Plan Unificado Runtime — Studio + Orchestrator + Runner)

---

## ⚡ Regla rectora: ENTERPRISE-GRADE, NO MVP

**Toda esta fase debe entregarse enterprise-grade desde el día uno. Zero MVPs, zero "mínimos viables", zero atajos.** Lee el preámbulo del plan en `~/.claude/plans/zippy-churning-wand.md` antes de empezar. Si algo no se puede hacer enterprise-grade dentro del scope, NO lo bajes de nivel — escálalo a Albert para replanificar.

Concretamente para Fase 0 esto significa:
- Pools reales con HA, healthchecks, auto-scaling. No "1 container para probar".
- Managed Identity en toda comunicación interna — zero secretos en `.env`, zero passwords hardcoded.
- Postgres con HA + backups + PITR (no Postgres standalone).
- Redis con AOF + replication (no Redis sin persistencia).
- Storage con versioning + retention policies.
- Observability stack desplegado desde el deploy inicial (App Insights + Log Analytics + alert rules).
- Runbooks operacionales (deploy, rollback, DR) documentados Y testeados.
- RTO/RPO declarados y validados con ejercicio real de disaster recovery.
- IaC reviewable y reproducible (Bicep, no scripts imperativos sueltos).

**Criterio de aceptación transversal:** cualquier compañero debe poder leer la IaC + runbooks y desplegar el Orchestrator en un Azure subscription nuevo sin preguntarte nada. Si tiene que preguntar, el entregable no está terminado.

---

## Contexto

Dubiel aprobó un pivot el 2026-04-21: **congelar Control Plane** (solo fixes críticos) y volcarnos 100% en que el stack operativo (Studio + Orchestrator + Runner) ejecute bots de verdad.

**Audit del 2026-04-21** detectó que:
- Orchestrator tiene `RunsProcessor.simulateExecution()` — los runs se simulan en proceso en vez de despacharse a runners reales.
- No hay generación de `.skb` (el `compiledPlan` vive como JSON en DB).
- No hay Studio→Orchestrator Deploy.
- Runners conectan por WebSocket pero NO se usan para dispatch real.

Antes de atacar esos 4 bloqueadores (eso es Fase 1), necesitamos que el Orchestrator **esté desplegable en Azure del cliente de forma enterprise-grade**. Eso es Fase 0 — tu tarea.

El estado actual del repo:
- `orchestrator/api/` — NestJS + TypeORM + BullMQ + WebSocket gateway. Funciona en local con `pnpm dev`.
- `orchestrator/ui/` — Next.js 15 con páginas de bots/runs/runners/schedules/logs.
- `orchestrator/docker-compose.yml` — stack local con postgres/redis/minio. **No enterprise-grade**: postgres sin HA, redis sin AOF, minio sin versioning. Sirve para dev pero hay que reforzarlo y adicionalmente tener paridad IaC Azure.
- `runner/` — Python agent, con TODOs de encryption en `secrets/providers.py` (no los toques en esta fase, son de Fase 1).
- **No existe `infra/` todavía.** Lo creas vos.

---

## Scope — Qué entregás en Fase 0

### Entregable 1: IaC Bicep en `infra/azure/`

Archivos Bicep **revisables, parametrizados, reproducibles**:

| Archivo | Contenido |
|---|---|
| `infra/azure/main.bicep` | Entry point. Resource Group, orquestación de módulos. Parámetros: `environment` (dev/staging/prod), `tenantName`, `location`, `tenantId`. |
| `infra/azure/modules/network.bicep` | VNet, subnets privadas, NSG, private endpoints. |
| `infra/azure/modules/compute.bicep` | Azure Container Apps environment + apps (API + UI + worker). Healthchecks, readiness/liveness, auto-scaling (min 2 replicas, max configurable, target CPU 70%). Ingress con HTTPS obligatorio. |
| `infra/azure/modules/postgres-ha.bicep` | Azure Database for PostgreSQL Flexible Server con **Zone-redundant HA**, backup retention 35 días, **Point-in-Time Recovery habilitado**, private endpoint, Entra ID auth. Sin passwords en output. |
| `infra/azure/modules/redis-ha.bicep` | Azure Cache for Redis Premium tier con **AOF persistence**, **geo-replication opcional** (parámetro), zone-redundancy, private endpoint. |
| `infra/azure/modules/storage.bicep` | Storage Account con **Blob versioning habilitado**, **immutability policies** para containers que lo requieran (evidence packs = WORM), retention policies, soft delete 30 días, private endpoint. Containers: `bots` (para .skb), `artifacts`, `evidence-packs` (WORM), `logs`. |
| `infra/azure/modules/keyvault.bicep` | Azure Key Vault con **RBAC mode** (no access policies), soft delete + purge protection habilitados, private endpoint. |
| `infra/azure/modules/monitoring.bicep` | Log Analytics Workspace + Application Insights + Action Groups + Alert Rules (CPU high, memory high, failed requests, DB connection pool exhausted, Redis eviction rate, storage 4xx/5xx). Budget alerts opcionales. |
| `infra/azure/modules/identity.bicep` | User-assigned Managed Identity para cada Container App. Role assignments: KV Secrets User, Storage Blob Data Contributor en contenedores específicos, Postgres Entra ID admin, Redis Data Access. |

**Criterios enterprise:**
- Toda comunicación interna va por private endpoints — nada pasa por internet público.
- Postgres y Redis **solo accesibles desde dentro de la VNet** (no public network access).
- Key Vault con RBAC mode + purge protection (no se puede borrar accidentalmente).
- Outputs del main.bicep deben ser lo suficiente para que la aplicación arranque: nombres de resources + endpoints + Managed Identity IDs. **Nunca exportes secretos en outputs.**
- Parámetros claros, documentados, con defaults razonables. `location` defaultea a `eastus2` pero es overridable.
- `what-if` debe correr limpio antes de apply.

### Entregable 2: Docker Compose local con paridad Azure

`orchestrator/docker-compose.yml` **actualizado** para paridad real con el stack Azure:
- Postgres 16 con replication configurada (primary + replica, streaming replication).
- Redis 7 con AOF habilitado (`appendonly yes`, `appendfsync everysec`) + replica para testing local de failover.
- MinIO con versioning habilitado + lifecycle policies (simulate retention).
- Azurite (Azure Storage emulator) como opción alternativa para testing exacto de Blob Storage.
- Jaeger all-in-one + OpenTelemetry Collector para tracing local.
- Prometheus + Grafana opcional para testing de alertas.

Networks separadas (`orchestrator-internal` para DB/Redis, `orchestrator-public` para API/UI) para simular el aislamiento de Azure.

### Entregable 3: Observability integrada en el código

Tocar `orchestrator/api/src/`:
- Módulo `observability/` con OpenTelemetry: OTLP exporter configurable (Jaeger en dev, App Insights en prod).
- `correlation-id.middleware.ts` — enforce correlationId en toda request HTTP + en BullMQ jobs. Si no viene, se genera uno. Se propaga a logs, spans, downstream calls.
- Pino logger estructurado con correlationId injection automática.
- `/metrics` endpoint Prometheus.
- `/healthz` + `/readyz` + `/livez` endpoints.

### Entregable 4: Runbooks operacionales

`docs/runbooks/`:
- `deploy.md` — paso a paso para deploy a un tenant nuevo: pre-requisitos, secrets que el cliente aporta (dominios, managed identity principals), comandos `az deployment`, verificación post-deploy, rollback.
- `rollback.md` — procedimiento de rollback: rollback de imagen de Container App, rollback de DB migrations con `typeorm migration:revert`, rollback de IaC con state previo.
- `dr.md` — disaster recovery: escenarios (región caída, DB corrupta, Redis data loss, storage account comprometido), RTO/RPO declarados por escenario, procedimiento paso a paso de recovery. **Debes ejecutar el ejercicio de DR al menos una vez y documentar tiempos reales medidos** — si el RTO declarado es 1h, demostraste que lo cumpliste.
- `scaling.md` — cómo escalar manual (si es urgente) y cómo está configurado el auto-scaling.
- `incident-response.md` — índice de incidentes con link a runbook específico por tipo (runner no responde, queue backpressure, memory leak, DB slow queries, storage 4xx).

### Entregable 5: CI/CD en GitHub Actions

`.github/workflows/orchestrator-deploy.yml`:
- Trigger en push a `master` que toque `orchestrator/` o `infra/azure/`.
- Steps: lint + test + build + OIDC auth a Azure (no secretos) + `az deployment group what-if` (plan visible en PR) + `az deployment group create` (en apply) + post-deploy health check.
- Multi-environment: dev (auto-deploy), staging (manual approval), prod (manual approval + tag release).
- Rollback automático si health check falla post-deploy.

### Entregable 6: ADR

`docs/adr/ADR-0XX-orchestrator-azure-deployment.md` — documentar decisiones clave:
- Por qué Azure Container Apps vs AKS vs App Service (justificación enterprise).
- Por qué Postgres Flexible Server zone-redundant.
- Por qué Redis Premium vs Standard (AOF requirement).
- Por qué Managed Identity vs Service Principal.
- Por qué separación `orchestrator-internal` / `orchestrator-public` networks.
- Link al plan en `~/.claude/plans/zippy-churning-wand.md`.

---

## Sub-tasks sugeridos (orden de trabajo)

1. **Setup VNet + Identity + Key Vault** — la base de seguridad. Sin esto, nada más tiene sentido.
2. **Postgres HA + Redis HA con private endpoints** — data layer primero.
3. **Storage con WORM para evidence packs** — compliance desde día uno.
4. **Container Apps environment + apps** — ejecución.
5. **Monitoring + alerts + correlation ID enforcement** — observabilidad.
6. **Docker Compose local con paridad** — para developer experience.
7. **Runbooks + ejercicio DR real** — documentación operacional.
8. **CI/CD GitHub Actions** — automatización.
9. **ADR** — decisiones registradas.

---

## Quality Gates (revisión Albert + Dubiel antes de merge)

- **QG Infra-1**: `az deployment group what-if` corre limpio, sin cambios destructivos implícitos.
- **QG Infra-2**: Deploy real a una subscription de test resulta en Orchestrator accesible, API responde `/healthz` 200, UI carga.
- **QG Infra-3**: `.env` de producción tiene **cero secretos** — todo resuelve vía Managed Identity o Key Vault ref.
- **QG Infra-4**: Postgres failover ejercitado (matar primary, promoción automática, app reconnecta en < 60s).
- **QG Infra-5**: Ejercicio de DR completo — restore desde backup PITR a un point timestamp, validación de integridad.
- **QG Infra-6**: Todas las alert rules disparan en test (CPU high, DB pool exhausted, etc).
- **QG Infra-7**: Tracing end-to-end visible en Application Insights con correlationId atravesando UI → API → DB.
- **QG Infra-8**: Runbooks están probados — alguien más del equipo puede seguir `deploy.md` sin ayuda.
- **QG Infra-9**: CI/CD pipeline ejecuta green en dev, staging pasa con approval, prod despliega.
- **QG Infra-10**: Todos los ADRs referenciados en el plan están escritos y enlazados.

---

## Lo que NO hacés en esta fase

- **Nada de Fase 1+**: no tocás `RunsProcessor.simulateExecution()`, no empiezas el packager `.skb`, no implementes `bot.call`, no agregues Deploy button al Studio, no toques session broker. Eso es siguiente.
- **Nada del Control Plane**: `apps/control-plane/` está congelado. Solo fixes de seguridad críticos que Dubiel explícitamente autorice.
- **Nada de multi-cloud**: AWS/GCP/VMware/etc. son Fase 5. Foco Azure.
- **Nada de nueva UI**: usás el `orchestrator/ui/` que ya existe; solo te aseguras de que arranque en Azure.
- **Nada de features nuevos en API**: solo el scaffolding de observability + correlation middleware + health endpoints. No agregás endpoints nuevos a dispatch/bots/runs/etc.

---

## Reportes

- **Daily**: breve update en formato del proyecto (bar chart + tablas, ver `feedback_progress_format` en memoria) cuando terminás cada sub-task.
- **Weekly**: reporte consolidado con progreso vs criterios de aceptación.
- **Al final de la fase**: PR con todo el entregable + demo de deploy a subscription de test + demo del ejercicio DR.

---

## Preguntas / bloqueos

Si encontrás ambigüedad, preguntale a Albert primero. Si Albert no responde en 4 horas o la pregunta es estratégica, escalás a Dubiel. **No hagas asunciones que te puedan llevar a entregar algo sub-enterprise-grade.** Es mejor parar 1 hora a preguntar que rehacer 2 días de trabajo.

---

## Referencias obligatorias a leer antes de empezar

1. `~/.claude/plans/zippy-churning-wand.md` — el plan completo (sobre todo el preámbulo "Regla Rectora" y la sección Fase 0).
2. `CLAUDE.md` del repo — principios de arquitectura, compliance-first, cloud-agnostic, seguridad.
3. `docs/chatgptaportes.md` — design doc donde están las decisiones arquitectónicas originales del runner/orchestrator.
4. `orchestrator/docker-compose.yml` — punto de partida para el nuevo compose con paridad.
5. `orchestrator/api/src/` — entender estructura NestJS actual para dónde injectar observability.

---

## Deadline

Fase 0 tiene que quedar cerrada antes de arrancar Fase 1 (que es lo gordo). **Target 3-4 semanas** para una persona trabajando full-time, con revisión intermedia de Albert en semana 2.
