# Skuld P0 Executable Backlog

Fecha: 2026-02-23  
Estado: backlog tecnico ejecutable (sin fechas fijas)

## 1) Objetivo P0
Poner operativo el backbone enterprise de Skuld con foco en:
- `SkuldOne` (Control Plane) para gobierno central,
- `Orchestrator` por cliente para ejecucion segura y auditoria local,
- comunicación CP <-> Orchestrator confiable,
- licenciamiento/cuotas/uso funcionales,
- onboarding comercial minimo (web gateway -> leads CP).

## 2) Alcance P0 (in)
- Fleet channel: register/heartbeat/health/deregister.
- Usage channel: ingest idempotente de metering agregado.
- Licensing + entitlements runtime (bots/prompts).
- Quota check + enforcement basico.
- Vault adapters reales en Orchestrator + secret resolution runtime.
- Auditoria/evidencia operativa solo en Orchestrator.
- Integrations fabric base en CP para `payment`, `email`, `storage` (provider-first).
- `skuldbotweb/backend` como gateway publico para `contact/demo/newsletter` hacia CP.

Fuera de P0 (out):
- CMS avanzado de marketing (blog/careers/events),
- BI avanzado/semantic layer completa,
- vertical packs completos.

## 3) Workstreams P0

## WS-P0-1: CP <-> Orchestrator Contract Backbone
Objetivo:
- contrato estable y seguro entre planos.

Tareas:
1. Definir contratos versionados:
- `POST /api/orchestrators/register`
- `POST /api/orchestrators/heartbeat`
- `GET /api/orchestrators/:id/health`
- `POST /api/orchestrators/deregister`
- `POST /api/usage/ingest`
2. Agregar idempotencia por `event_id` en `usage/ingest`.
3. Aplicar mTLS + JWT firmado (issuer/audience estrictos).
4. Implementar retries + backoff + dead-letter para ingest.
5. Exponer OpenAPI actualizado de estos contratos.

DoD:
- registro y heartbeat estables con estado visible en CP,
- ingest de uso no duplica eventos al reintentar,
- tests de auth negativa y compatibilidad de version.

## WS-P0-2: Orchestrator Runtime Security + Vault
Objetivo:
- ejecución con secretos bajo control del cliente.

Tareas:
1. Implementar adapters de vault:
- Hashicorp Vault,
- AWS Secrets Manager,
- Azure Key Vault,
- GCP Secret Manager.
2. Resolver secretos en dispatch/runtime (sin placeholders vacios).
3. Cifrado en transito hacia runner y zero plaintext en logs.
4. Policy hooks minimos para datos sensibles (masking/redaction).
5. Endpoint de prueba de conectividad por vault adapter.

DoD:
- 100% de secretos runtime via vault refs,
- sin secretos en DSL/artifacts/logs,
- tests de fallback y errores de vault.

## WS-P0-3: Licensing, Entitlements y Quotas en SkuldOne
Objetivo:
- monetizacion y control de capacidad operativos en CP.

Tareas:
1. Entidades CP:
- `license`, `entitlement`, `usage_counter`, `quota_policy`.
2. Endpoints:
- `GET /api/licenses/:tenant/status`
- `POST /api/entitlements/check`
- `POST /api/quota/check`
- `POST /api/quota/consume`
3. Enforcement en flujo Orchestrator:
- validar entitlement antes de ejecutar bot/prompt premium.
4. Reglas de cuota:
- normal/approaching/at_limit/grace/blocked.
5. Telemetria agregada por tenant sin PHI/PII cruda.

DoD:
- tenant bloqueado cuando supera quota policy,
- entitlement invalido corta ejecucion con error explicable,
- trazabilidad de decisiones de licencia/cuota en CP.

## WS-P0-4: Integrations Fabric Provider-First (CP)
Objetivo:
- evitar lock-in y habilitar operación enterprise.

Tareas:
1. Modelo `integration_definition` + `integration_config` por tenant.
2. Adapters base:
- payment (Stripe inicial),
- email (SMTP + un provider API),
- storage (S3/Blob/GCS con interfaz comun).
3. Health checks por integración y test endpoint.
4. Secret masking estricto en respuestas de API.
5. Auditoría admin de cambios críticos de integración.

DoD:
- alta/config/test de integración por tenant funcionando,
- campos sensibles nunca retornan en claro,
- rollback de config posible sin downtime.

## WS-P0-5: Orchestrator Audit/Evidence Local
Objetivo:
- cumplimiento regulatorio con evidencia operativa local por cliente.

Tareas:
1. Estructura `run_audit_log` y `evidence_manifest` en Orchestrator.
2. Hash canónico por run + verify endpoint local.
3. Registro de acciones privilegiadas:
- secretos,
- cambios de policy,
- ejecuciones,
- abort/retry.
4. Retención por policy tenant.
5. Export controlado del evidence pack para auditor.

DoD:
- evidence verificable por hash para runs completados,
- CP no almacena evidence pack operativo,
- auditor local puede consultar/exportar evidencias.

## WS-P0-6: Web Gateway Comercial Minimo
Objetivo:
- conectar demanda comercial al CP sin exponer core.

Tareas:
1. `skuldbotweb/backend`:
- endpoints publicos `contact`, `demo`, `newsletter`,
- rate-limit + anti-spam + validacion payload.
2. Bridge seguro a `control-plane/api`:
- `POST /api/public/leads/intake` (interno firmado).
3. Dedupe basico de leads por correo/tenant.
4. Auditoría de ingreso de lead (metadata, source, timestamp).
5. `skuldbotweb/frontend/contact` conectado al backend real.

DoD:
- flujo end-to-end web -> gateway -> CP funcionando,
- sin llamadas directas del frontend al core CP,
- links placeholder eliminados en rutas comerciales críticas.

## 4) Dependencias entre workstreams
Orden recomendado:
1. `WS-P0-1` (contracts backbone)
2. `WS-P0-2` y `WS-P0-3` en paralelo (runtime security + monetization control)
3. `WS-P0-4` (integraciones base para billing/email/storage)
4. `WS-P0-5` (audit/evidence local)
5. `WS-P0-6` (gateway comercial sobre CP estable)

Dependencias críticas:
- `WS-P0-3` depende de contratos de `WS-P0-1`.
- `WS-P0-5` depende de runtime estable de `WS-P0-2`.
- `WS-P0-6` depende de endpoints CP de lead intake y auth de `WS-P0-1`.

## 5) Definition of Ready (DoR) por item
Antes de implementar cualquier tarea P0:
- contrato API definido,
- impacto regulatorio marcado (`standard|regulated|strict`),
- criterios de test definidos (feliz + negativo),
- owner tecnico asignado (`WS-CP`, `WS-ORCH`, etc.).

## 6) Definition of Done (DoD) transversal P0
Una tarea P0 no cierra sin:
- tests unitarios + integración,
- pruebas de auth negativa,
- no filtrado de secretos/PII/PHI en logs,
- observabilidad mínima (logs + métricas + trace_id),
- documentación actualizada en `docs/`.

## 7) Gating de salida P0
Gate 1: backbone estable
- orchestrators activos con heartbeat estable,
- registro/deregister confiable.

Gate 2: control comercial/técnico
- licencias/entitlements/quotas aplicados en runtime.

Gate 3: seguridad runtime
- vault real operativo y secreto resuelto en ejecución.

Gate 4: cumplimiento local
- auditoría/evidencia operativa verificable en Orchestrator.

Gate 5: funnel mínimo activo
- leads de web ingresan en CP sin bypass de gateway.

## 8) Entregables P0
- OpenAPI CP actualizado para contratos CP<->Orchestrator.
- Matriz de adapters vault soportados y validados.
- Módulos CP de licensing/entitlements/quota en producción.
- Manifest/evidence local por run en Orchestrator.
- Gateway web comercial integrado a CP.

## 9) Referencias
- `docs/NEXION_SKULD_MODULE_DECISION_MATRIX.md`
- `docs/PLATFORM_EXECUTION_MAP.md`
- `docs/ENTERPRISE_RPA_AI_AGENT_MASTER_PLAN.md`
- `docs/REGULATORY_DESIGN_GUARDRAILS.md`
