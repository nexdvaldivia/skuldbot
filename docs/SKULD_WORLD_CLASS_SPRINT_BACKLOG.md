# Skuld World-Class Sprint Backlog

Fecha: 2026-02-23  
Estado: plan operativo maestro sin fechas de calendario

## 1) Objetivo

Convertir Skuld en una plataforma enterprise de clase mundial con:

- Control Plane (`SkuldOne`) centralizado por cliente y operación comercial completa.
- Orchestrator PaaS por cliente (cloud-agnostic y on-prem) con seguridad, auditoría y evidencia local.
- Studio + Runner + Engine para bots universales (RPA + AI Agent + Data Movement) sin mocks.
- Marketing web y documentación integrados al ciclo de producto y venta.

## 2) Modelo de ejecución

Cadencia:

- Sprints secuenciales de 2 semanas operativas.
- Sin comprometer fechas absolutas en roadmap.

Streams:

- `WS-CP`: `control-plane/api`, `control-plane/ui`
- `WS-ORCH`: `orchestrator/api`, `orchestrator/ui`
- `WS-STUDIO`: `studio`
- `WS-ENGINE`: `engine`
- `WS-RUNNER`: `runner`, `runner-app`
- `WS-WEB`: `skuldbotweb`
- `WS-DOCS`: `docs-components`, `docs/`
- `WS-DEPLOYERS`: instaladores multi-entorno
- `WS-CROSS`: seguridad, compliance, QA, observabilidad

## 3) Reglas no negociables

- `no mocks`: toda integración crítica se prueba contra contratos reales.
- `regulated-first`: diseño apto para HIPAA/SOC2 desde arquitectura, no como parche.
- evidencia operativa y auditoría de runs viven en Orchestrator del cliente.
- secretos siempre por vault y referencias; nunca embebidos en bot ni en logs.
- todo ticket cierra con evidencia técnica (test, logs, contrato y docs).

## 4) Definition of Ready / Done

DoR:

- contrato definido (API/event/schema) y owner por stream.
- impacto regulatorio etiquetado: `standard | regulated | strict`.
- criterios de aceptación explícitos por ticket.

DoD:

- tests unitarios + integración del scope.
- validaciones negativas (auth, tenancy, quota, policy).
- trazabilidad mínima: `trace_id`, `tenant_id`, `orchestrator_id`, `run_id`.
- documentación actualizada en `docs/`.

## 5) Macro-orden de sprints

| Sprint | Foco principal                                        |
| ------ | ----------------------------------------------------- |
| `S0`   | Baseline técnico y contratos backbone                 |
| `S1`   | Entitlements, quota y enforcement runtime             |
| `S2`   | Vault runtime real y seguridad de secretos            |
| `S3`   | Resiliencia de ejecución + runner lifecycle           |
| `S4`   | Studio + Engine universal (RPA + Agent + Data)        |
| `S5`   | Prompt platform monetizable y protegida               |
| `S6`   | Marketplace de bots alquilables                       |
| `S7`   | Compliance runtime + evidence package verificable     |
| `S8`   | Observabilidad enterprise y control operativo         |
| `S9`   | Portales enterprise (CP/Orchestrator) + RBAC completo |
| `S10`  | Web comercial + CRM/tickets/campañas conectadas al CP |
| `S11`  | Deployers cloud-agnostic + bootstrap seguro           |
| `S12`  | Hardening final, DR, performance y release readiness  |

## 6) Backlog ejecutable por sprint

## Sprint S0 - Baseline Backbone

| ID                 | Tipo  | Stream            | Pri | Entregable                                  | Criterio de aceptación                                               |
| ------------------ | ----- | ----------------- | --- | ------------------------------------------- | -------------------------------------------------------------------- |
| `S0-EP-CPORCH-001` | EPIC  | `WS-CP`,`WS-ORCH` | P0  | Fleet + usage contract backbone             | Contratos `/orchestrators/*` y `/usage/ingest` activos y versionados |
| `S0-ST-CP-001`     | Story | `WS-CP`           | P0  | Idempotencia por `event_id` en usage ingest | Reintentos no duplican eventos; test de duplicados en verde          |
| `S0-ST-ORCH-001`   | Story | `WS-ORCH`         | P0  | Auth canal ORCH->CP endurecida              | JWT `iss/aud` válido obligatorio o shared secret controlado          |
| `S0-ST-CROSS-001`  | Story | `WS-CROSS`        | P0  | Trazabilidad mínima transversal             | `trace_id` presente en logs y respuestas de fleet/usage              |
| `S0-ST-DOCS-001`   | Story | `WS-DOCS`         | P0  | OpenAPI fleet/usage publicado               | OpenAPI actualizado y validado contra endpoints reales               |

## Sprint S1 - Licensing, Entitlements, Quota

| ID               | Tipo  | Stream    | Pri | Entregable                                 | Criterio de aceptación                                              |
| ---------------- | ----- | --------- | --- | ------------------------------------------ | ------------------------------------------------------------------- |
| `S1-EP-CP-001`   | EPIC  | `WS-CP`   | P0  | Dominio comercial runtime                  | Entidades `entitlement`, `quota_policy`, `usage_counter` operativas |
| `S1-ST-CP-001`   | Story | `WS-CP`   | P0  | API `entitlements/check`                   | Responde permitido/bloqueado con razón auditable                    |
| `S1-ST-CP-002`   | Story | `WS-CP`   | P0  | API `quota/check` y `quota/consume`        | Estados `normal/approaching/at_limit/grace/blocked` funcionales     |
| `S1-ST-ORCH-001` | Story | `WS-ORCH` | P0  | Enforcement en `dispatch/runs`             | Run bloquea antes de ejecutar si no hay entitlement/cuota           |
| `S1-ST-CP-003`   | Story | `WS-CP`   | P1  | Panel de estado de licencia/cuota en CP UI | Tenant visible con estado y eventos recientes                       |

## Sprint S2 - Vault Runtime Security

| ID                | Tipo  | Stream     | Pri | Entregable                        | Criterio de aceptación                              |
| ----------------- | ----- | ---------- | --- | --------------------------------- | --------------------------------------------------- |
| `S2-EP-ORCH-001`  | EPIC  | `WS-ORCH`  | P0  | Vault adapters productivos        | HashiCorp/AWS/Azure/GCP disponibles y testeables    |
| `S2-ST-ORCH-001`  | Story | `WS-ORCH`  | P0  | `fetchFromExternalVault` real     | Sin placeholders; handshake real por proveedor      |
| `S2-ST-ORCH-002`  | Story | `WS-ORCH`  | P0  | Resolución de secretos en runtime | `credentialRef` obligatorio para acciones sensibles |
| `S2-ST-CROSS-001` | Story | `WS-CROSS` | P0  | Redaction/masking estricto        | No aparece secreto en logs/audit/events             |
| `S2-ST-DOCS-001`  | Story | `WS-DOCS`  | P1  | Runbook de vaults soportados      | Matriz de configuración y troubleshooting publicada |

## Sprint S3 - Runtime Resilience + Runner Lifecycle

| ID                 | Tipo  | Stream      | Pri | Entregable                         | Criterio de aceptación                             |
| ------------------ | ----- | ----------- | --- | ---------------------------------- | -------------------------------------------------- |
| `S3-EP-ORCH-001`   | EPIC  | `WS-ORCH`   | P0  | Resiliencia operativa              | Retry policy + backoff + DLQ para jobs críticos    |
| `S3-ST-ORCH-001`   | Story | `WS-ORCH`   | P0  | Control de concurrencia por tenant | Límite configurable y enforcement activo           |
| `S3-EP-RUNNER-001` | EPIC  | `WS-RUNNER` | P0  | Runner lifecycle enterprise        | Registro, heartbeat, estado y revocación funcional |
| `S3-ST-RUNNER-001` | Story | `WS-RUNNER` | P0  | Política attended/unattended       | Planes/licencia diferencian tipo de runner         |
| `S3-ST-CROSS-001`  | Story | `WS-CROSS`  | P1  | Chaos tests básicos                | Fallo de CP/vault no derriba cola completa         |

## Sprint S4 - Studio + Engine Universal

| ID                 | Tipo  | Stream      | Pri | Entregable                        | Criterio de aceptación                                   |
| ------------------ | ----- | ----------- | --- | --------------------------------- | -------------------------------------------------------- |
| `S4-EP-STUDIO-001` | EPIC  | `WS-STUDIO` | P0  | Flujo universal de bot            | Nodos RPA + Agent + Data en el mismo pipeline            |
| `S4-ST-STUDIO-001` | Story | `WS-STUDIO` | P0  | Node config contract-first        | Cada nodo declara input/output schema                    |
| `S4-ST-ENGINE-001` | Story | `WS-ENGINE` | P0  | Validación DSL robusta            | Fallos de compilación explicables con ubicación exacta   |
| `S4-ST-ENGINE-002` | Story | `WS-ENGINE` | P1  | Transform/data movement operators | Fuente->destino con mapeos y validación de tipos         |
| `S4-ST-ORCH-001`   | Story | `WS-ORCH`   | P1  | Preflight antes de publish/deploy | Bloquea publish si contrato/credenciales/policies fallan |

## Sprint S5 - Prompt Platform Monetizable

| ID                 | Tipo  | Stream      | Pri | Entregable                   | Criterio de aceptación                                     |
| ------------------ | ----- | ----------- | --- | ---------------------------- | ---------------------------------------------------------- |
| `S5-EP-CP-001`     | EPIC  | `WS-CP`     | P0  | Prompt catalog administrable | CRUD de prompt packs con versionado y pricing              |
| `S5-ST-CP-001`     | Story | `WS-CP`     | P0  | Protección de IP de prompt   | Cliente consume prompt gestionado sin verlo en texto plano |
| `S5-ST-STUDIO-001` | Story | `WS-STUDIO` | P0  | Nodo Agent con `promptRef`   | Agent ejecuta prompt premium por referencia                |
| `S5-ST-CP-002`     | Story | `WS-CP`     | P1  | BYOPrompt por tenant         | Cliente puede crear prompts propios aislados               |
| `S5-ST-CP-003`     | Story | `WS-CP`     | P1  | Metering de uso de prompts   | Cobro mensual por pack/prompt con usage auditable          |

## Sprint S6 - Marketplace de Bots Alquilables

| ID                 | Tipo  | Stream      | Pri | Entregable                       | Criterio de aceptación                                     |
| ------------------ | ----- | ----------- | --- | -------------------------------- | ---------------------------------------------------------- |
| `S6-EP-CP-001`     | EPIC  | `WS-CP`     | P0  | Marketplace runtime-ready        | Publicación, catálogo, versiones y compatibilidad          |
| `S6-ST-CP-001`     | Story | `WS-CP`     | P0  | Instalación por tenant           | Tenant instala bot y queda enlazado a licencia             |
| `S6-ST-ORCH-001`   | Story | `WS-ORCH`   | P0  | Sync de paquetes firmados        | Orchestrator instala/actualiza bot con integridad validada |
| `S6-ST-STUDIO-001` | Story | `WS-STUDIO` | P1  | Flujo de empaquetado/publicación | Bot publisher con validaciones previas                     |
| `S6-ST-CP-002`     | Story | `WS-CP`     | P1  | Revenue share básico             | Cálculo de share por instalación y periodo                 |

## Sprint S7 - Compliance y Evidence Package

| ID                | Tipo  | Stream     | Pri | Entregable                        | Criterio de aceptación                                  |
| ----------------- | ----- | ---------- | --- | --------------------------------- | ------------------------------------------------------- |
| `S7-EP-ORCH-001`  | EPIC  | `WS-ORCH`  | P0  | Audit runtime local completo      | Eventos privilegiados de run persistidos y consultables |
| `S7-ST-ORCH-001`  | Story | `WS-ORCH`  | P0  | Hash canónico por run             | Endpoint `verify` valida integridad de run              |
| `S7-ST-ORCH-002`  | Story | `WS-ORCH`  | P0  | Evidence package exportable       | Export local apto para auditoría regulada               |
| `S7-ST-CROSS-001` | Story | `WS-CROSS` | P0  | Policy packs HIPAA/SOC2           | Controles técnicos mapeados y aplicables en runtime     |
| `S7-ST-CP-001`    | Story | `WS-CP`    | P1  | Frontera CP/Orchestrator auditada | CP no almacena evidence operativa del cliente           |

## Sprint S8 - Observabilidad Enterprise

| ID                 | Tipo  | Stream      | Pri | Entregable                         | Criterio de aceptación                             |
| ------------------ | ----- | ----------- | --- | ---------------------------------- | -------------------------------------------------- |
| `S8-EP-CROSS-001`  | EPIC  | `WS-CROSS`  | P0  | Observabilidad e incident response | Dashboards, alertas y SLIs por plano               |
| `S8-ST-CP-001`     | Story | `WS-CP`     | P0  | Telemetría agregada de flota       | Estado de orchestrators/runners por tenant visible |
| `S8-ST-ORCH-001`   | Story | `WS-ORCH`   | P0  | Métricas de runs/colas/errores     | Export estándar (`Prometheus`/logs estructurados)  |
| `S8-ST-RUNNER-001` | Story | `WS-RUNNER` | P1  | Heartbeat + capacity metrics       | Runner reporta disponibilidad y carga              |
| `S8-ST-CROSS-002`  | Story | `WS-CROSS`  | P1  | SLOs y alerting formalizados       | MTTR y error budget medibles                       |

## Sprint S9 - Portales Enterprise + RBAC

| ID                  | Tipo  | Stream            | Pri | Entregable                 | Criterio de aceptación                                 |
| ------------------- | ----- | ----------------- | --- | -------------------------- | ------------------------------------------------------ |
| `S9-EP-PORTALS-001` | EPIC  | `WS-CP`,`WS-ORCH` | P0  | Shell visual consistente   | Sidebar/header y navegación homogéneos CP/Orchestrator |
| `S9-ST-CPUI-001`    | Story | `WS-CP`           | P0  | RBAC enterprise completo   | Roles y permisos efectivos por acción crítica          |
| `S9-ST-ORCHUI-001`  | Story | `WS-ORCH`         | P0  | Operación local por perfil | Vistas filtradas por `ops/admin/auditor`               |
| `S9-ST-CPUI-002`    | Story | `WS-CP`           | P1  | Gestión avanzada de fleet  | Acciones remotas seguras sobre orchestrators           |
| `S9-ST-PORTALS-001` | Story | `WS-CP`,`WS-ORCH` | P1  | UX feedback consistente    | Mensajería con toast y estados de error claros         |

## Sprint S10 - Comercial, Soporte y Marketing conectado

| ID               | Tipo  | Stream           | Pri | Entregable                  | Criterio de aceptación                           |
| ---------------- | ----- | ---------------- | --- | --------------------------- | ------------------------------------------------ |
| `S10-EP-WEB-001` | EPIC  | `WS-WEB`,`WS-CP` | P0  | Funnel comercial end-to-end | Web -> gateway -> CP leads sin bypass            |
| `S10-ST-WEB-001` | Story | `WS-WEB`         | P0  | Forms reales sin simulación | Contact/demo/newsletter integrados al backend    |
| `S10-ST-CP-001`  | Story | `WS-CP`          | P0  | CRM leads y pipeline ventas | Lead dedupe + tracking de fuente                 |
| `S10-ST-CP-002`  | Story | `WS-CP`          | P1  | Módulo tickets soporte      | Alta, seguimiento, SLA y auditoría               |
| `S10-ST-CP-003`  | Story | `WS-CP`          | P1  | Email marketing engine      | Listas/campañas/templates con webhooks de estado |

## Sprint S11 - Deployers Cloud-Agnostic

| ID                | Tipo  | Stream         | Pri | Entregable                       | Criterio de aceptación                           |
| ----------------- | ----- | -------------- | --- | -------------------------------- | ------------------------------------------------ |
| `S11-EP-DEP-001`  | EPIC  | `WS-DEPLOYERS` | P0  | Deployers multi-entorno          | AWS/Azure/GCP/on-prem con flujo guiado           |
| `S11-ST-DEP-001`  | Story | `WS-DEPLOYERS` | P0  | Bootstrap seguro de orchestrator | Registro inicial en CP con credenciales rotables |
| `S11-ST-DEP-002`  | Story | `WS-DEPLOYERS` | P0  | Instalación idempotente          | Re-run de instalación no rompe entorno           |
| `S11-ST-DEP-003`  | Story | `WS-DEPLOYERS` | P1  | Upgrade + rollback               | Actualización con plan de reversión validado     |
| `S11-ST-DOCS-001` | Story | `WS-DOCS`      | P1  | Runbooks de despliegue           | Guías por entorno con checklist operativo        |

## Sprint S12 - Hardening & Go-To-Market Readiness

| ID                 | Tipo  | Stream     | Pri | Entregable                  | Criterio de aceptación                            |
| ------------------ | ----- | ---------- | --- | --------------------------- | ------------------------------------------------- |
| `S12-EP-CROSS-001` | EPIC  | `WS-CROSS` | P0  | Security hardening final    | Remediación de hallazgos críticos de pentest      |
| `S12-ST-CROSS-001` | Story | `WS-CROSS` | P0  | DR y backup/restore drills  | Ejercicio de recuperación exitoso y documentado   |
| `S12-ST-CROSS-002` | Story | `WS-CROSS` | P0  | Performance y load testing  | SLOs bajo carga objetivo cumplidos                |
| `S12-ST-CP-001`    | Story | `WS-CP`    | P1  | Release train y rollback CP | Pipeline con gates automáticos y rollback probado |
| `S12-ST-ORCH-001`  | Story | `WS-ORCH`  | P1  | Release train Orchestrator  | Upgrade seguro por tenant con compatibilidad      |

## 7) Dependencias críticas

| Dependencia                 | Impacto                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `S1` depende de `S0`        | Sin contrato backbone estable no hay enforcement fiable    |
| `S2` depende de `S1`        | Enforcements deben evaluar políticas sobre secretos reales |
| `S3` depende de `S2`        | Resiliencia runtime exige credenciales/vault en producción |
| `S5` depende de `S1`        | Monetización de prompts requiere entitlements/quota        |
| `S6` depende de `S3` y `S5` | Marketplace requiere runtime estable + monetización        |
| `S7` depende de `S3`        | Evidence completo necesita eventos robustos de ejecución   |
| `S11` depende de `S0..S3`   | Deployers exigen contratos y bootstrap maduros             |

## 8) KPIs de control por sprint

| KPI                                | Meta operativa    |
| ---------------------------------- | ----------------- |
| Heartbeat activo de orchestrators  | >99.5%            |
| Duplicación de usage por reintento | 0                 |
| Secret leaks en logs               | 0                 |
| Éxito de runs críticos             | >99%              |
| MTTR incidentes P1                 | <30 min           |
| Cobertura de contratos críticos    | 100% endpoints P0 |

## 9) Artefactos que se deben mantener sincronizados

- `docs/NEXION_SKULD_MODULE_DECISION_MATRIX.md`
- `docs/PLATFORM_EXECUTION_MAP.md`
- `docs/SKULD_P0_EXECUTABLE_BACKLOG.md`
- `docs/SKULD_P0_IMPLEMENTATION_CHECKLIST.md`
- `docs/REGULATORY_DESIGN_GUARDRAILS.md`

## 10) Próximo arranque recomendado

- Ejecutar inmediatamente `S1` en paralelo con preparación técnica de `S2`.
- Mantener `S3` preparado como siguiente corte de riesgo.
