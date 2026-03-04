# Skuld P0 Implementation Checklist (Ruta a Codigo)

Fecha: 2026-02-23  
Estado: checklist operativo para ejecutar P0 en el repo actual

## 1) Objetivo
Pasar del backlog P0 a ejecucion directa en codigo con orden de trabajo, rutas exactas y criterios de cierre por modulo.

Referencia base:
- `docs/SKULD_P0_EXECUTABLE_BACKLOG.md`
- `docs/NEXION_SKULD_MODULE_DECISION_MATRIX.md`

Regla dura:
- `SkuldOne` = Control Plane de Skuld. Nada se ejecuta en `nexion-one`.
- Evidencia/auditoria operativa de runs vive en Orchestrator del cliente.

## 2) Hallazgos del escaneo actual (repo real)

`control-plane/api`:
- Existe `usage/ingest` en `control-plane/api/src/billing/billing.controller.ts`, con idempotencia por `batchId` (no por `event_id`).
- No existen aun endpoints CP de fleet (`/orchestrators/register|heartbeat|health|deregister`).
- No existe modulo publico de leads intake (`/public/leads/intake`).
- Integrations tiene providers y registry, pero no CRUD/admin API completo por tenant.

`orchestrator/api`:
- Ya intenta usar fleet channel en `orchestrator/api/src/control-plane/control-plane-sync.service.ts`.
- Ya reporta salud a CP en `orchestrator/api/src/control-plane/health-reporter.service.ts`.
- Vault externo no implementado en runtime (`fetchFromExternalVault` en `orchestrator/api/src/credentials/credentials.service.ts`).
- Existe audit + evidence local robusto, pero falta cerrar trazabilidad run->hash canónico y políticas de retencion operativa con enforcement estricto.

`skuldbotweb`:
- Backend tiene `contact/newsletter/demo`, pero en placeholder (`skuldbotweb/backend/src/contact/contact.service.ts`).
- Frontend contacto aun simula envio local (`skuldbotweb/frontend/src/app/contact/page.tsx`).

Riesgo detectado (debe corregirse al inicio):
- Drift MCP entre pruebas y codigo en CP (`control-plane/api/src/mcp/servers/licensing.server.ts` vs `control-plane/api/src/mcp/servers/licensing.server.spec.ts`) y cliente ORCH con tool names legacy (`orchestrator/api/src/mcp/clients/control-plane.client.ts`).

## 3) Orden de ejecucion recomendado (sin fechas)
1. `WS-P0-1` contrato CP<->Orchestrator (fleet + usage contract limpio)
2. `WS-P0-3` licencias/entitlements/quota runtime
3. `WS-P0-2` vault runtime real + resolucion de secretos
4. `WS-P0-4` integrations fabric provider-first en CP
5. `WS-P0-5` cierre audit/evidence local en Orchestrator
6. `WS-P0-6` gateway web comercial a CP

## 4) Checklist ejecutable por workstream

## WS-P0-1: CP <-> Orchestrator Contract Backbone
Objetivo: estabilizar registro, heartbeat, health, deregister, usage ingest.

Rutas a tocar (CP):
- `control-plane/api/src/app.module.ts`
- `control-plane/api/src/common/guards/`
- `control-plane/api/src/orchestrators/` (nuevo modulo)
- `control-plane/api/src/billing/billing.controller.ts`
- `control-plane/api/src/billing/billing.service.ts`
- `control-plane/api/src/billing/entities/usage-record.entity.ts`

Rutas a tocar (ORCH):
- `orchestrator/api/src/control-plane/control-plane-sync.service.ts`
- `orchestrator/api/src/control-plane/health-reporter.service.ts`
- `orchestrator/api/src/control-plane/usage-batch.processor.ts`

Checklist:
- [x] Crear modulo fleet CP: `orchestrators.controller/service/module` + entidad `orchestrator_instance`.
- [x] Implementar endpoints:
  - [x] `POST /api/orchestrators/register`
  - [x] `POST /api/orchestrators/heartbeat`
  - [x] `GET /api/orchestrators/:id/health`
  - [x] `POST /api/orchestrators/deregister`
- [x] Endurecer auth de canal ORCH->CP (JWT firmado con `iss/aud` estricto + pinning mTLS a nivel edge/proxy).
- [x] Ajustar `usage/ingest` a idempotencia por `event_id` (ademas de `batchId`).
- [x] Agregar estrategia retry/backoff + dead-letter (ingest fallido) en CP.
- [x] Publicar OpenAPI de contratos fleet/usage.
- [x] Corregir drift MCP (tool names/specs/client ORCH) para dejar contrato consistente.

Criterio de cierre:
- [ ] Orchestrator registra y late heartbeat estable visible en CP.
- [ ] Reintentos de usage no duplican eventos.
- [x] Tests negativos auth/version pasan.

## WS-P0-3: Licensing, Entitlements y Quotas en SkuldOne
Objetivo: control comercial runtime desde CP.

Rutas a tocar (CP):
- `control-plane/api/src/licenses/`
- `control-plane/api/src/billing/`
- `control-plane/api/src/` (modulos nuevos `entitlements`, `quota`, opcional `usage` separado)
- `control-plane/api/src/mcp/servers/licensing.server.ts` (si se mantiene canal MCP)

Rutas a tocar (ORCH):
- `orchestrator/api/src/runs/runs.service.ts`
- `orchestrator/api/src/dispatch/dispatch.service.ts`
- `orchestrator/api/src/billing/billing-enforcement.service.ts`
- `orchestrator/api/src/license/license.service.ts`

Checklist:
- [ ] Extender dominio de licencias con `entitlement`, `usage_counter`, `quota_policy`.
- [ ] Exponer endpoints:
  - [x] `GET /api/licenses/:tenant/status`
  - [x] `POST /api/entitlements/check`
  - [x] `POST /api/quota/check`
  - [x] `POST /api/quota/consume`
- [x] Aplicar enforcement en ORCH antes de ejecutar bot/prompt premium.
- [ ] Unificar estados de cuota: `normal|approaching|at_limit|grace|blocked`.
- [ ] Mantener telemetria agregada (sin PHI/PII cruda).

Criterio de cierre:
- [ ] Ejecucion bloqueada con mensaje explicable cuando quota/entitlement no permite.
- [x] Trazabilidad de decisiones de licencia/cuota disponible en CP.

## WS-P0-2: Orchestrator Runtime Security + Vault
Objetivo: secretos del cliente bajo su vault, no embebidos en bot.

Rutas a tocar:
- `orchestrator/api/src/credentials/credentials.service.ts`
- `orchestrator/api/src/credentials/credentials.controller.ts`
- `orchestrator/api/src/credentials/entities/credential.entity.ts`
- `orchestrator/api/src/dispatch/dispatch.service.ts`
- `orchestrator/api/src/runs/runs.service.ts`
- `orchestrator/api/src/common/interceptors/`
- `orchestrator/api/src/evidence/redaction/`

Checklist:
- [ ] Implementar adapters reales en runtime:
  - [x] HashiCorp Vault
  - [x] AWS Secrets Manager
  - [x] Azure Key Vault
  - [x] GCP Secret Manager
- [x] Reemplazar TODO en `fetchFromExternalVault` y `testVaultConnection` por handshake real.
- [x] Asegurar resolucion en runtime (dispatch/run) con `credentialRef` obligatorio.
- [x] Bloquear secretos en claro en logs/audit/events.
- [x] Agregar redaction/masking hooks para datos sensibles.

Criterio de cierre:
- [ ] Secretos de ejecucion se resuelven 100% por vault ref.
- [ ] Cero secretos en DSL/artifacts/logs.

## WS-P0-4: Integrations Fabric Provider-First (CP)
Objetivo: integración enterprise sin lock-in por proveedor.

Rutas a tocar:
- `control-plane/api/src/integrations/`
- `control-plane/api/src/integrations/entities/provider-config.entity.ts`
- `control-plane/api/src/integrations/provider-registry.service.ts`
- `control-plane/api/src/common/interfaces/integration.interface.ts`
- `control-plane/api/src/audit/` (nuevo en CP si no existe)

Checklist:
- [x] Crear CRUD por tenant para `integration_definition` + `integration_config`.
- [ ] Mantener adapters base: `payment`, `email`, `storage`.
- [x] Endpoint `test/health` por integración configurada.
- [x] Secret masking estricto en respuestas API.
- [ ] Auditoria administrativa de cambios de integración.

Criterio de cierre:
- [ ] Alta/config/test por tenant funciona de punta a punta.
- [ ] Config sensible nunca sale en claro.

## WS-P0-5: Audit/Evidence Local en Orchestrator
Objetivo: cumplimiento regulatorio local por cliente.

Rutas a tocar:
- `orchestrator/api/src/audit/`
- `orchestrator/api/src/evidence/`
- `orchestrator/api/src/evidence/evidence-pack.service.ts`
- `orchestrator/api/src/evidence/evidence.controller.ts`

Checklist:
- [x] Asegurar `run_audit_log` alineado a eventos de ejecucion privilegiada.
- [x] Cerrar hash canónico por run y endpoint de verificación.
- [x] Confirmar retención por policy tenant + legal hold enforcement.
- [x] Export controlado de evidence pack para auditor.
- [x] Verificar frontera: CP no almacena evidencia operativa.

Criterio de cierre:
- [x] Evidence verificable por hash para runs completados.
- [x] Export local apto para auditoria.

## WS-P0-6: Web Gateway Comercial Minimo
Objetivo: funnel web->gateway->CP sin bypass.

Rutas a tocar (web backend):
- `skuldbotweb/backend/src/contact/contact.controller.ts`
- `skuldbotweb/backend/src/contact/contact.service.ts`
- `skuldbotweb/backend/src/contact/contact.dto.ts`
- `skuldbotweb/backend/src/app.module.ts`

Rutas a tocar (CP):
- `control-plane/api/src/public-leads/` (nuevo)
- `control-plane/api/src/leads/` (nuevo, dominio interno CP)

Rutas a tocar (web frontend):
- `skuldbotweb/frontend/src/app/contact/page.tsx`

Checklist:
- [x] Reemplazar simulacion frontend por llamada real a backend (`/api/contact*`).
- [x] Implementar anti-spam + rate limit + validacion server-side en gateway.
- [x] Crear bridge firmado backend->CP (`POST /api/public/leads/intake`).
- [x] Dedupe basico por email+tenant.
- [x] Auditar ingreso lead (source, timestamp, metadata).

Criterio de cierre:
- [x] Flujo end-to-end operativo y sin llamadas directas frontend->CP core.

## 5) PRs recomendados (slicing)
- PR-1: Fleet CP (`orchestrators/*`) + ajuste ORCH register/heartbeat + auth de canal.
- PR-2: Usage ingest hardening (`event_id` idempotente + DLQ/retries).
- PR-3: Entitlements + quota API en CP.
- PR-4: Enforcement en ORCH (runs/dispatch) usando entitlements/quota.
- PR-5: Vault adapters runtime (Hashi/AWS/Azure/GCP) + test connectivity real.
- PR-6: Integrations fabric CRUD/health/masking en CP.
- PR-7: Cierre audit/evidence local (hash canónico + verify + retention enforcement).
- PR-8: Web gateway->CP leads intake + frontend contacto real.
- PR-9: OpenAPI final + pruebas integracion + runbooks.

## 6) Test gates por PR
`control-plane/api`:
- `npm run test`
- `npm run build`

`orchestrator/api`:
- `npm run test`
- `npm run test:e2e`
- `npm run build`

`skuldbotweb/backend`:
- `npm run test`
- `npm run build`

`skuldbotweb/frontend`:
- `npm run build`

Gates transversales obligatorios:
- [ ] auth negativa cubierta (JWT/API key inválida, audiencia inválida, mTLS inválido en edge).
- [ ] no leaks de secretos/PII/PHI en logs.
- [ ] trazabilidad mínima (`trace_id`, `tenant_id`, `orchestrator_id`).
- [ ] si hay cambio UI: cumplir `docs/ENTERPRISE_UI_BRANDING_NON_NEGOTIABLES.md`.
- [ ] si hay cambio UI: componentizar y reutilizar (sin duplicar patrones ya existentes).
- [ ] docs actualizadas por PR.

## 7) Primer bloque para empezar ya
Arranque recomendado inmediato:
- Paso 1: ejecutar PR-1 (fleet CP + ORCH sync).
- Paso 2: cerrar PR-2 (usage ingest idempotente por evento).

Resultado de este primer bloque:
- canal CP<->ORCH estable,
- telemetria/usage confiable,
- base lista para monetizacion y enforcement enterprise.
