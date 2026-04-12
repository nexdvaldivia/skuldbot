# Platform Execution Map (Skuld)

Fecha: 2026-02-22  
Estado: documento rector de ejecución

## 1) Objetivo

Organizar todo el trabajo del producto en un solo mapa operativo para evitar dispersión entre:

- portales,
- Control Plane,
- Orchestrator,
- Studio,
- Runner,
- Deployers de instalación multi-entorno.

Principio:

- una sola plataforma, varios planos y clientes,
- ejecución `regulated-first` con utilidad real para entornos no regulados.
- `skuldbotweb` es el sitio oficial vigente de Skuld y se evoluciona in-place; no se reemplaza por una copia de otros sitios.

## 2) Mapa de componentes (source of truth en repo)

- `control-plane/api`: backend central de gobierno, licencias, metering, telemetría, catálogo.
- `control-plane/ui`: portal central (admins internos + administración enterprise por tenant).
- `orchestrator/api`: backend por cliente para ejecución, secretos, runners, políticas runtime.
- `orchestrator/ui`: portal operativo por cliente (runs, bots, credenciales, observabilidad local).
- `studio`: app de diseño (desktop) para crear y publicar bots/flows.
- `runner`: agente de ejecución Python.
- `runner-app`: app desktop para operación del runner.
- `engine`: compilación/ejecución DSL + nodos RPA/Agent/Data.
- `skuldbotweb`: portal web comercial/corporativo (sitio y experiencia pública).
- `skuldbotweb` se mantiene como base de continuidad del marketing web; referencias externas (ej. Nexion) se usan solo para adaptar capacidades de negocio y no para clonar UI/branding.
- `docs-components`: portal de documentación.

## 3) Modelo de trabajo por dominios

Cada dominio trabaja como stream independiente, pero con contratos claros entre APIs.

Streams oficiales:

- `WS-PORTALS`: portales de operación (`control-plane/ui`, `orchestrator/ui`, `docs-components`).
- `WS-MARKETING-WEB`: sitio marketing/comercial (`skuldbotweb`).
- `WS-CP`: `control-plane/api`.
- `WS-ORCH`: `orchestrator/api`.
- `WS-STUDIO`: `studio`.
- `WS-RUNNER`: `runner` + `runner-app`.
- `WS-ENGINE`: `engine` + `packages/compiler`.
- `WS-DOCS`: documentación funcional/técnica y catálogo de nodos.
- `WS-DEPLOYERS`: instaladores de Orchestrator por entorno (AWS/Azure/GCP/on-prem).
- `WS-CROSS`: seguridad, compliance, evidencia, observabilidad, QA.

## 4) Contratos obligatorios entre piezas

Sin contrato, no se integra.

Contratos mínimos:

- `CP <-> Orchestrator`: registro, heartbeat, estado, entitlements, usage ingest.
- `Orchestrator <-> Runner`: asignación de trabajo, estado de ejecución, logs y control de capacidad.
- `Studio <-> Orchestrator`: publicación/versionado de bots, validaciones, policy hints.
- `Studio <-> Engine`: compilación y validación DSL.
- `Runner <-> Engine`: ejecución runtime, policy hooks, evidence runtime.
- `CP <-> Portales`: APIs estables con versionado y RBAC.
- `Deployers <-> Orchestrator`: instalación idempotente + health checks + bootstrap seguro.

Regla de frontera:

- el contrato `CP <-> Orchestrator` no incluye transferencia de evidence packs ni auditoría operativa de runs.

Regla de versionado:

- romper contrato requiere versión nueva + compatibilidad temporal + plan de migración.

## 5) Orden de construcción recomendado (sin fechas)

Orden de dependencia técnica:

1. `WS-CROSS` base

- guardrails regulatorios,
- RBAC base,
- mTLS/JWT de canales críticos,
- evidencia y observabilidad mínimas.

2. `WS-CP` + `WS-ORCH` backbone

- fleet APIs,
- entitlements/licensing,
- metering/telemetría,
- control channel y usage channel.

3. `WS-RUNNER` + `WS-ENGINE`

- ejecución robusta,
- manejo de secretos/vault,
- policy enforcement y evidence por run.

4. `WS-STUDIO`

- UX de diseño/publicación alineada a contratos reales,
- integración de promptRef premium/BYOPrompt,
- validación previa a publish.

5. `WS-PORTALS`

- portal CP enterprise,
- portal Orchestrator por cliente,
- portal docs alineado a capacidades reales.

6. `WS-MARKETING-WEB`

- sitio comercial con propuesta de valor, verticales y casos de uso,
- captura de leads y rutas de conversión enterprise,
- integración con CRM/campañas del CP,
- contenido de compliance y trust center.

7. `WS-DEPLOYERS`

- empaquetado final por entorno:
  - AWS,
  - Azure,
  - GCP,
  - on-prem.

8. `WS-DOCS`

- sincronización de docs de nodos y plataforma con cada cambio funcional,
- calidad editorial y navegabilidad de la documentación,
- trazabilidad de contratos y comportamiento operativo.

## 6) Backlog estructurado por stream

## 6.1 WS-CP (Control Plane)

Epics:

- fleet management completo,
- licensing + entitlements + prompt monetization,
- usage/telemetry + quotas,
- evidencia global y panel compliance,
- integraciones provider-first.

Criterio de cierre stream:

- CP controla estado de toda la flota,
- decide licencias/entitlements en tiempo real,
- consume telemetría agregada sin PHI/PII cruda.

## 6.2 WS-ORCH (Orchestrator por cliente)

Epics:

- runtime de runs y scheduling robusto,
- vault adapters reales (Hashicorp/AWS/Azure/GCP),
- enforcement de policies,
- evidence runtime + verify API,
- operación local multi-tenant de cliente.

Criterio de cierre stream:

- cliente opera autónomamente en su entorno,
- secretos bajo su control,
- evidencia verificable por auditor.

## 6.3 WS-STUDIO

Epics:

- diseño de bot universal (RPA + Agent + Data movement),
- flujo de publish hacia Orchestrator,
- gestión de prompts (premium + BYOPrompt),
- validación avanzada y preflight checks.

Criterio de cierre stream:

- bot diseñado en Studio puede publicarse y ejecutarse sin fricción ni hacks manuales.

## 6.4 WS-RUNNER

Epics:

- ejecución estable y observable,
- reporting de progreso y eventos,
- manejo de secretos local seguro,
- compatibilidad attended/unattended.

Criterio de cierre stream:

- runner estable en operación continua, con recuperación y trazabilidad de fallos.

## 6.5 WS-ENGINE

Epics:

- compilación y validación DSL consistente,
- policy hooks y guardrails de datos,
- nodos AI + RPA + data con contratos uniformes.

Criterio de cierre stream:

- ejecución determinista y reproducible para casos críticos,
- fallos explicables, auditables y recuperables.

## 6.6 WS-PORTALS

Epics:

- CP portal: administración global,
- Orchestrator portal: operación por cliente,
- docs portal: documentación oficial y onboarding técnico.

Criterio de cierre stream:

- cada persona usuaria (admin, ops, developer, auditor) tiene flujo claro de punta a punta.

## 6.7 WS-MARKETING-WEB

Epics:

- arquitectura del sitio (home, producto, pricing, verticales, trust/compliance, recursos),
- SEO técnico y performance web,
- captación (forms, demos, trials) con trazabilidad de fuente,
- integración con `control-plane` para leads y campañas,
- alineación de branding Skuld en todos los activos.

Criterio de cierre stream:

- el sitio genera demanda calificada y la conecta sin fricción al pipeline comercial del CP.

## 6.8 WS-DEPLOYERS

Epics:

- installer/launcher de Orchestrator por entorno,
- plantillas IaC y configuración segura,
- bootstrap de credenciales + registro al CP,
- pruebas de instalación y upgrade.

Objetivo de producto:

- deployer no es “script suelto”; es producto con UX, validaciones y soporte.

Criterio de cierre stream:

- un cliente instala Orchestrator en su entorno con pasos guiados, validación automática y rollback seguro.

## 6.9 WS-DOCS

Epics:

- catálogo de nodos y DSL actualizado,
- documentación de contratos CP/Orchestrator/Runner/Studio,
- documentación operativa de despliegue y troubleshooting,
- gobierno documental `docs-as-code` con validación en PR.

Criterio de cierre stream:

- cualquier cambio relevante puede operarse y auditarse leyendo documentación actualizada, sin ingeniería inversa.

## 7) Definition of Done por entrega

Una entrega se considera completa solo si cumple:

- contrato API documentado y probado,
- tests de seguridad/autorización donde aplique,
- observabilidad mínima (logs+métricas+trazas),
- requisitos de `docs/REGULATORY_DESIGN_GUARDRAILS.md`,
- documentación de operación actualizada.

## 8) Dependencias críticas (para evitar bloqueos)

- Studio depende de contratos reales de Orchestrator, no mocks.
- Runner depende de Orchestrator estable para dispatch/reporting.
- Orchestrator depende de CP para entitlements/fleet/usage.
- Deployers dependen de Orchestrator operable en contenedor e instalación idempotente.
- Marketing Web depende de APIs/flows de CP para captación y tracking comercial.
- Docs depende de disciplina de todos los streams; cada stream es responsable de su actualización documental.
- Portales dependen de APIs estables y RBAC consistente.

## 9) Mecanismo de gobierno del trabajo

- backlog único por stream con prioridad explícita,
- decisiones de arquitectura en ADR,
- excepciones regulatorias con vencimiento obligatorio,
- PR checklist regulatoria obligatoria:
  - `.github/pull_request_template.md`
  - `.github/workflows/regulatory-guardrails.yml`
- gobernanza documental obligatoria:
  - `docs/DOCS_GOVERNANCE_NODES_AND_PLATFORM.md`

## 10) Entregables de referencia asociados

- plan maestro: `docs/ENTERPRISE_RPA_AI_AGENT_MASTER_PLAN.md`
- guardrails regulatorios: `docs/REGULATORY_DESIGN_GUARDRAILS.md`
- gobernanza documental: `docs/DOCS_GOVERNANCE_NODES_AND_PLATFORM.md`
- evidencia package: `docs/NEXION_EVIDENCE_PACKAGE_TRACEABILITY_ASSESSMENT.md`
- blueprint de adaptación Nexion: `docs/NEXION_FULL_SCAN_ADAPTATION_BLUEPRINT.md`

## 11) Acción inmediata (siempre vigente)

Cuando entre trabajo nuevo:

1. asignar stream (`WS-*`),
2. definir contrato afectado,
3. marcar impacto regulatorio (`standard|regulated|strict`),
4. ejecutar con pruebas + evidencia de cumplimiento.

Este flujo evita volver al caos cuando el volumen de trabajo suba.
